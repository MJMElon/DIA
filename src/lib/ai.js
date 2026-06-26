/* AI counting engine — tiles the working image and asks the Supabase Edge
   Function `count` to count each tile, then de-duplicates across overlaps.

   The browser NEVER sees the Gemini key: supabase.functions.invoke attaches the
   signed-in user's JWT, the Edge Function verifies it and calls Gemini with the
   key it holds as a server-side secret. */
import { supabase } from './supabase'
import { dedupe, PRESET } from './detect'
import { clipToBoundary, pointInPolys } from './geo'

// POST one tile (base64 jpeg) to the Edge Function. Returns {count, points:[{x,y}]}.
async function countTile(imageB64, mode) {
  const { data, error } = await supabase.functions.invoke('count', { body: { image: imageB64, mode } })
  if (error) {
    // surface the function's JSON error body when present (status + detail)
    let detail = error.message || String(error)
    try { const ctx = error.context && await error.context.json(); if (ctx) detail = ctx.error ? `${ctx.error}${ctx.detail ? ' — ' + ctx.detail : ''}` : detail } catch (e) { /* ignore */ }
    throw new Error(detail)
  }
  return data
}

/**
 * Run AI counting over a loaded map.
 * @param loaded  result of readMap(): {rgba,w,h,fullW,fullH,scale,geo}
 * @param mode    'palm' | 'polybag'
 * @param boundary  optional KML polygons (array of [[lon,lat],...]) or null
 * @param onProgress(doneText)  status callback
 * @returns the same result shape the renderer expects
 */
export async function runAI(loaded, mode, boundary, onProgress) {
  const { rgba, w, h, fullW, fullH, scale, geo } = loaded

  // draw the working image once, then cut tiles from it
  const sc = document.createElement('canvas'); sc.width = w; sc.height = h
  const sctx = sc.getContext('2d')
  const sid = sctx.createImageData(w, h); sid.data.set(rgba); sctx.putImageData(sid, 0, 0)

  // polybags are small + dense → smaller tiles; palms are larger → bigger tiles
  const tile = mode === 'polybag' ? 640 : 1024
  const overlap = mode === 'polybag' ? 64 : 96
  const step = tile - overlap, sendMax = 1024
  const xs = []; for (let x = 0; x < w; x += step) { xs.push(x); if (x + tile >= w) break }
  const ys = []; for (let y = 0; y < h; y += step) { ys.push(y); if (y + tile >= h) break }
  const tiles = []; for (const y of ys) for (const x of xs) tiles.push({ x, y, sw: Math.min(tile, w - x), sh: Math.min(tile, h - y) })

  async function doTile(t) {
    const longEdge = Math.max(t.sw, t.sh), k = longEdge > sendMax ? sendMax / longEdge : 1
    const dw = Math.max(1, Math.round(t.sw * k)), dh = Math.max(1, Math.round(t.sh * k))
    const tc = document.createElement('canvas'); tc.width = dw; tc.height = dh
    tc.getContext('2d').drawImage(sc, t.x, t.y, t.sw, t.sh, 0, 0, dw, dh)
    const b64 = tc.toDataURL('image/jpeg', 0.85).split(',')[1]
    const res = await countTile(b64, mode)
    if (Array.isArray(res.points) && res.points.length)
      return res.points.map(p => [t.x + (p.x / 1000) * t.sw, t.y + (p.y / 1000) * t.sh])
    return []
  }

  // run tiles with limited concurrency + live progress
  const allPts = []; let done = 0, failed = 0, idx = 0, lastError = ''
  const conc = Math.min(4, tiles.length)
  async function worker() {
    while (idx < tiles.length) {
      const my = idx++
      try { const pts = await doTile(tiles[my]); allPts.push(...pts) }
      catch (err) { failed++; lastError = (err && err.message) ? err.message : String(err); console.error(err) }
      done++
      onProgress('Counting with AI — tile ' + done + '/' + tiles.length + (failed ? (' · ' + failed + ' failed') : '') + '…')
    }
  }
  await Promise.all(Array.from({ length: conc }, worker))
  if (failed === tiles.length) {
    let hint = ''
    if (/\b(401|403)\b/.test(lastError)) hint = ' — sign-in/permission issue: make sure you are logged in and the Edge Function is deployed.'
    else if (/\b(400|404)\b/.test(lastError)) hint = ' — the count function rejected the request or is not deployed (check supabase functions deploy count).'
    else if (/\b429\b/.test(lastError)) hint = ' — rate/quota limit hit; wait a moment or use a key with quota.'
    else if (/\b5\d\d\b/.test(lastError)) hint = ' — server error: check the GEMINI_API_KEY secret is set on the function.'
    throw new Error('AI counting failed — ' + (lastError || 'unknown error') + hint)
  }

  // de-duplicate across tile overlaps, then assemble the result shape the renderer expects
  const minD = mode === 'polybag' ? 8 : 18
  const ptsAll = dedupe(allPts, minD)
  const fullAll = ptsAll.map(([x, y]) => [x / scale, y / scale])
  const coordsAll = (geo && geo.origin && geo.res)
    ? fullAll.map(([px, py]) => [geo.origin[0] + px * geo.res[0], geo.origin[1] + py * geo.res[1]]) : null

  const { clipped, clipMsg, boundaryPx, boundaryHa } = clipToBoundary(boundary, geo, scale)
  const keep = []; ptsAll.forEach((p, i) => { if (!clipped || pointInPolys(p, boundaryPx)) keep.push(i) })
  const pts = keep.map(i => ptsAll[i])
  const full = keep.map(i => fullAll[i])
  const coords = coordsAll ? keep.map(i => coordsAll[i]) : null

  let areaHa = null
  const geographic = geo && geo.crs && /4326|4269|4258/.test(geo.crs)
  if (clipped && boundaryHa) { areaHa = boundaryHa }
  else if (geo && geo.bbox && !geographic) {
    const m2 = Math.abs((geo.bbox[2] - geo.bbox[0]) * (geo.bbox[3] - geo.bbox[1]))
    if (m2 > 0 && m2 < 1e12) areaHa = m2 / 10000
  }

  let src = 'AI · Gemini, ' + tiles.length + ' tiles'
  if (failed) src += ' (' + failed + ' failed)'
  return {
    count: pts.length, pts, full, coords, areaHa, geo, fullW, fullH, w, h, scale, mode,
    density: areaHa ? pts.length / areaHa : null, src, thr: 0, clipped, clipMsg, boundaryPx,
  }
}

export { PRESET }
