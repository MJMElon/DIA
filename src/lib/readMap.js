/* Read either a GeoTIFF or a normal image into a working-size RGBA buffer.
   Ported from the validated single-file app; now imports geotiff from npm. */
import { fromBlob } from 'geotiff'

export async function readMap(file, workmax) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'tif' || ext === 'tiff') return readGeoTIFF(file, workmax)
  return readImage(file, workmax)
}

async function readGeoTIFF(file, workmax) {
  // fromBlob reads the file lazily (byte ranges) instead of loading it all into memory
  const tiff = await fromBlob(file)
  const base = await tiff.getImage(0)
  const fullW = base.getWidth(), fullH = base.getHeight()
  const WM = workmax
  const scale = Math.min(1, WM / Math.max(fullW, fullH))
  const w = Math.max(1, Math.round(fullW * scale)), h = Math.max(1, Math.round(fullH * scale))
  const bands = Math.min(base.getSamplesPerPixel(), 3)
  const samples = bands >= 3 ? [0, 1, 2] : [0]
  // if the file has internal overviews (a Cloud-Optimized GeoTIFF), read the
  // smallest level still >= our working width — this avoids decoding full resolution
  let img = base
  try {
    const n = await tiff.getImageCount(); let bestW = fullW
    for (let i = 0; i < n; i++) {
      const im = await tiff.getImage(i); const iw = im.getWidth()
      if (iw >= w && iw <= bestW) { bestW = iw; img = im }
    }
  } catch (e) { /* no overviews */ }
  const data = await img.readRasters({ width: w, height: h, samples, interleave: true })
  let max = 0; for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i]
  const k = max > 255 ? 255 / max : 1
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    if (bands >= 3) { rgba[i * 4] = data[i * 3] * k; rgba[i * 4 + 1] = data[i * 3 + 1] * k; rgba[i * 4 + 2] = data[i * 3 + 2] * k }
    else { const v = data[i] * k; rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v }
    rgba[i * 4 + 3] = 255
  }
  let geo = null
  try {
    const origin = base.getOrigin(), res = base.getResolution(), bbox = base.getBoundingBox()
    let crs = null
    const gk = base.getGeoKeys ? base.getGeoKeys() : base.geoKeys
    if (gk) { const code = gk.ProjectedCSTypeGeoKey || gk.GeographicTypeGeoKey; if (code) crs = 'EPSG:' + code }
    geo = { origin, res, bbox, crs }
  } catch (e) { geo = null }
  return { rgba, w, h, fullW, fullH, scale, geo }
}

function readImage(file, workmax) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const fullW = img.naturalWidth, fullH = img.naturalHeight
      const scale = Math.min(1, workmax / Math.max(fullW, fullH))
      const w = Math.max(1, Math.round(fullW * scale)), h = Math.max(1, Math.round(fullH * scale))
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h)
      const rgba = ctx.getImageData(0, 0, w, h).data
      URL.revokeObjectURL(img.src)
      resolve({ rgba: new Uint8ClampedArray(rgba), w, h, fullW, fullH, scale, geo: null })
    }
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = URL.createObjectURL(file)
  })
}
