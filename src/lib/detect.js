/* Local greenness detection engine — ported verbatim from the validated
   single-file app. Runs entirely in the browser; used as an offline fallback
   when AI counting is unavailable. */

export function normalizeExG(rgba, w, h) {
  const n = w * h, exg = new Float32Array(n)
  let mn = Infinity, mx = -Infinity
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3]
    if (a === 0) { exg[i] = -1; continue }          // transparent border = no vegetation
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    const t = r + g + b + 1e-6
    const v = 2 * (g / t) - (r / t) - (b / t)
    exg[i] = v; if (v < mn) mn = v; if (v > mx) mx = v
  }
  const rng = (mx - mn) || 1e-6
  for (let i = 0; i < n; i++) { exg[i] = exg[i] === -1 ? 0 : (exg[i] - mn) / rng }
  return exg
}

function boxBlur(src, w, h, radius, passes) {
  let a = Float32Array.from(src), b = new Float32Array(w * h)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0
      for (let k = -radius; k <= radius; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; c++ } }
      b[y * w + x] = s / c
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0
      for (let k = -radius; k <= radius; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += b[yy * w + x]; c++ } }
      a[y * w + x] = s / c
    }
  }
  return a
}

export function detect(rgba, w, h, opt) {
  const minDist = opt.minDist, threshold = opt.threshold
  const exg = normalizeExG(rgba, w, h)
  const radius = Math.max(2, Math.round(minDist * 0.35))
  const sm = boxBlur(exg, w, h, radius, 3)
  const cands = []
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    if (exg[i] < threshold) continue
    const v = sm[i]; let isMax = true
    for (let dy = -1; dy <= 1 && isMax; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) { if (sm[(y + dy) * w + (x + dx)] > v) { isMax = false; break } }
    }
    if (isMax) cands.push([v, x, y])
  }
  cands.sort((a, b) => b[0] - a[0])
  const cell = Math.max(1, minDist), grid = new Map(), key = (a, b) => a + ',' + b, out = []
  const md2 = minDist * minDist
  for (const [, x, y] of cands) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell); let ok = true
    for (let gx = cx - 1; gx <= cx + 1 && ok; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const arr = grid.get(key(gx, gy)); if (!arr) continue
      for (const [ax, ay] of arr) { const dx = ax - x, dy = ay - y; if (dx * dx + dy * dy < md2) { ok = false; break } }
    }
    if (ok) { out.push([x, y]); const k = key(cx, cy); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, y]) }
  }
  return out
}

export function estimateSpacingPx(exg, w, h, threshold) {
  // autocorrelation of row/column vegetation profiles -> dominant planting interval
  const colSum = new Float32Array(w), rowSum = new Float32Array(h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (exg[y * w + x] > threshold) { colSum[x]++; rowSum[y]++ } }
  function period(p) {
    const n = p.length; let mean = 0; for (const v of p) mean += v; mean /= n
    const d = p.map(v => v - mean); const ac = new Float32Array(n)
    for (let lag = 0; lag < n; lag++) { let s = 0; for (let i = 0; i < n - lag; i++) s += d[i] * d[i + lag]; ac[lag] = s }
    let mx = 0; for (let i = 1; i < n; i++) if (ac[i] > mx) mx = ac[i]
    for (let i = 2; i < n - 1; i++) if (ac[i] > ac[i - 1] && ac[i] >= ac[i + 1] && ac[i] > 0.3 * mx) return i
    return null
  }
  const c = period(colSum), r = period(rowSum), cands = [c, r].filter(v => v)
  if (!cands.length) return null
  cands.sort((a, b) => a - b); return cands[Math.floor(cands.length / 2)]
}

// merge near-duplicate points (objects seen in two overlapping tiles) by min distance
export function dedupe(points, minDist) {
  const cell = Math.max(1, minDist), grid = new Map(), key = (a, b) => a + ',' + b, out = [], md2 = minDist * minDist
  for (const [x, y] of points) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell); let ok = true
    for (let gx = cx - 1; gx <= cx + 1 && ok; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const arr = grid.get(key(gx, gy)); if (!arr) continue
      for (const [ax, ay] of arr) { const dx = ax - x, dy = ay - y; if (dx * dx + dy * dy < md2) { ok = false; break } }
    }
    if (ok) { out.push([x, y]); const k = key(cx, cy); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, y]) }
  }
  return out
}

export const PRESET = { palm: { spacing: 9, word: 'palms' }, polybag: { spacing: 0.75, word: 'polybags' } }
