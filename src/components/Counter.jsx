import React, { useEffect, useRef, useState } from 'react'
import { readMap } from '../lib/readMap'
import { runAI, PRESET } from '../lib/ai'
import { parseKML } from '../lib/geo'
import { downloadCSV, downloadGeoJSON, downloadPNG, downloadReport } from '../lib/downloads'

export default function Counter() {
  const [mode, setMode] = useState('palm')
  const [detail, setDetail] = useState(4000)
  const [fname, setFname] = useState('')
  const [kmlName, setKmlName] = useState('')
  const [status, setStatus] = useState('Waiting for a map.')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [loaded, setLoaded] = useState(null)   // {rgba,w,h,...} most recent map (state → re-renders button)

  const boundaryRef = useRef(null)      // KML polygons
  const fileRef = useRef(null)          // last map File (to re-read on detail change)
  const canvasRef = useRef(null)

  // ---- map upload ----
  async function handleFile(file) {
    if (!file) return
    fileRef.current = file
    setFname(file.name); setResult(null); setBusy(true)
    setStatus('Reading map…')
    try {
      const m = await readMap(file, detail)
      setLoaded(m)
      setStatus('Map ready — ' + m.fullW + '×' + m.fullH + 'px → working ' + m.w + '×' + m.h
        + (m.geo ? ' · georeferenced' : ' · no coordinates'))
    } catch (err) {
      console.error(err)
      setLoaded(null)
      setStatus('Could not read this map. If it is very large, export a Cloud-Optimized GeoTIFF.')
    } finally { setBusy(false) }
  }

  // re-read the map when the detail level changes
  useEffect(() => {
    if (fileRef.current) handleFile(fileRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  function handleKML(file) {
    if (!file) return
    if (/\.kmz$/i.test(file.name)) { setStatus('KMZ is zipped — please export/unzip to a plain .kml file.'); return }
    const fr = new FileReader()
    fr.onload = () => {
      const polys = parseKML(fr.result)
      if (polys && polys.length) {
        boundaryRef.current = polys
        setKmlName(file.name + ' · ' + polys[0].length + ' points')
        setStatus('Boundary loaded — counting will be clipped to it.')
      } else { boundaryRef.current = null; setKmlName('no polygon found in this KML') }
    }
    fr.readAsText(file)
  }

  // ---- run AI count ----
  async function count() {
    if (!loaded || busy) return
    setBusy(true); setStatus('Counting with AI…')
    try {
      const r = await runAI(loaded, mode, boundaryRef.current, setStatus)
      setResult(r)
      let msg = 'Done — ' + r.count + ' ' + PRESET[r.mode].word + (r.clipped ? ' inside boundary' : '') + ' (' + r.src + ').'
      if (r.clipMsg) msg += ' ⚠ ' + r.clipMsg
      setStatus(msg)
    } catch (err) {
      console.error(err); setStatus(err.message || String(err))
    } finally { setBusy(false) }
  }

  // ---- draw overlay whenever result changes ----
  useEffect(() => {
    if (!result || !loaded || !canvasRef.current) return
    const r = result
    const cv = canvasRef.current, ctx = cv.getContext('2d')
    cv.width = r.w; cv.height = r.h
    const img = ctx.createImageData(r.w, r.h)
    img.data.set(loaded.rgba); ctx.putImageData(img, 0, 0)

    if (r.boundaryPx) {
      ctx.save()
      ctx.beginPath(); ctx.rect(0, 0, r.w, r.h)
      for (const poly of r.boundaryPx) {
        ctx.moveTo(poly[0][0], poly[0][1])
        for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1])
        ctx.closePath()
      }
      ctx.fillStyle = 'rgba(13,15,11,0.58)'; ctx.fill('evenodd')
      ctx.lineWidth = Math.max(1.5, r.w / 520); ctx.strokeStyle = '#ffd400'
      for (const poly of r.boundaryPx) {
        ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1])
        for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1])
        ctx.closePath(); ctx.stroke()
      }
      ctx.restore()
    }
    ctx.strokeStyle = '#e8551f'; ctx.lineWidth = Math.max(1.2, r.w / 700)
    const rad = Math.max(3, Math.min(9, r.w / 220))
    for (const [x, y] of r.pts) { ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.stroke() }
  }, [result])

  const word = PRESET[mode].word
  const dropProps = (handler) => ({
    onDragOver: e => { e.preventDefault(); e.currentTarget.classList.add('hot') },
    onDragLeave: e => { e.preventDefault(); e.currentTarget.classList.remove('hot') },
    onDrop: e => { e.preventDefault(); e.currentTarget.classList.remove('hot'); handler(e.dataTransfer.files[0]) },
  })

  return (
    <div className="grid">
      {/* CONTROL RAIL */}
      <div className="panel">
        <h2>1 · Map</h2>
        <label className="drop" {...dropProps(handleFile)}>
          <input type="file" accept=".tif,.tiff,.jpg,.jpeg,.png" onChange={e => handleFile(e.target.files[0])} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3" /><path d="M8 7l4-4 4 4" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
          <div className="big">Drop a map here</div>
          <div className="small">or click to browse · GeoTIFF / TIFF / JPG / PNG</div>
          <div className="fname">{fname}</div>
        </label>

        <label className="drop" style={{ marginTop: 12, padding: 16 }} {...dropProps(handleKML)}>
          <input type="file" accept=".kml" onChange={e => handleKML(e.target.files[0])} />
          <div className="big" style={{ fontSize: 13 }}>Boundary (KML) — optional</div>
          <div className="small">counts only palms inside your block</div>
          <div className="fname">{kmlName}</div>
        </label>

        <h2 style={{ marginTop: 22 }}>2 · What am I counting</h2>
        <div className="seg">
          <button className={mode === 'palm' ? 'on' : ''} onClick={() => setMode('palm')}>Plantation palms</button>
          <button className={mode === 'polybag' ? 'on' : ''} onClick={() => setMode('polybag')}>Nursery polybags</button>
        </div>

        <div className="field">
          <label>Detail — working resolution</label>
          <select value={detail} onChange={e => setDetail(parseInt(e.target.value, 10))}>
            <option value="2200">Standard · 2200px — fast (palms)</option>
            <option value="4000">High · 4000px — balanced</option>
            <option value="6500">Max · 6500px — dense nursery (slow)</option>
          </select>
          <p className="hint">Nursery polybags sit close together — use High or Max so they don't merge.</p>
        </div>

        <button className="go" onClick={count} disabled={busy || !loaded}>
          {busy ? 'Working…' : 'Count'}
        </button>
        <div className="status">{status}</div>
      </div>

      {/* STAGE */}
      <div className="stage">
        <div className="readout">
          <div className="count">{result ? result.count : '—'}<span className="lbl">{word}</span></div>
          <div className="stats">
            <div><span>Mapped area</span><b>{result?.areaHa ? result.areaHa.toFixed(2) + ' ha' : '—'}</b></div>
            <div><span>Density / ha</span><b>{result?.density ? result.density.toFixed(1) : '—'}</b></div>
            <div><span>Georeferenced</span><b>{result?.geo ? (result.geo.crs || 'yes') : '—'}</b></div>
            <div><span>Working res</span><b>{result ? result.w + '×' + result.h + 'px' : '—'}</b></div>
          </div>
        </div>

        <div className="canvaswrap">
          {!result && <div className="empty">The annotated map appears here once you run a count.</div>}
          <canvas ref={canvasRef} style={{ display: result ? 'block' : 'none' }} />
        </div>

        <div>
          <h2 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>3 · Report — save to your local storage</h2>
          <div className="downloads">
            <button className="dl" disabled={!result} onClick={() => downloadReport(canvasRef.current, result)}>Download report (HTML)</button>
            <button className="dl" disabled={!result} onClick={() => downloadPNG(canvasRef.current, result)}>Annotated map (PNG)</button>
            <button className="dl" disabled={!result} onClick={() => downloadCSV(result)}>Points (CSV)</button>
            <button className="dl" disabled={!result?.geo?.crs} onClick={() => downloadGeoJSON(result)}>Points (GeoJSON)</button>
          </div>
        </div>
      </div>
    </div>
  )
}
