/* Geo / KML helpers — ported verbatim from the validated single-file app.
   Parses a KML boundary, reprojects it onto the raster, clips points, computes area. */
import proj4 from 'proj4'

export function parseKML(text) {
  let doc
  try { doc = new DOMParser().parseFromString(text, 'application/xml') } catch (e) { return null }
  const ringFrom = el => el.textContent.trim().split(/\s+/)
    .map(t => { const a = t.split(','); return [parseFloat(a[0]), parseFloat(a[1])] })
    .filter(p => isFinite(p[0]) && isFinite(p[1]))
  const polys = []
  const polyEls = doc.getElementsByTagName('Polygon')
  if (polyEls.length) {
    for (const pe of polyEls) {
      const ob = pe.getElementsByTagName('outerBoundaryIs')[0] || pe
      const ce = ob.getElementsByTagName('coordinates')[0]
      if (ce) { const r = ringFrom(ce); if (r.length >= 3) polys.push(r) }
    }
  } else {
    for (const ce of doc.getElementsByTagName('coordinates')) { const r = ringFrom(ce); if (r.length >= 3) polys.push(r) }
  }
  return polys.length ? polys : null
}

/* proj4 definition for the raster's CRS (handles WGS84 lat/lon and UTM) */
export function rasterProjDef(crs) {
  if (!crs) return null
  const m = /(\d{4,5})/.exec(crs); if (!m) return null
  const c = +m[1]
  if (c === 4326 || c === 4269 || c === 4258) return 'EPSG:4326'
  if (c >= 32601 && c <= 32660) return '+proj=utm +zone=' + (c - 32600) + ' +datum=WGS84 +units=m +no_defs'
  if (c >= 32701 && c <= 32760) return '+proj=utm +zone=' + (c - 32700) + ' +south +datum=WGS84 +units=m +no_defs'
  return null                              // unknown CRS — caller will warn
}

export function pointInPolys(pt, polys) {
  for (const poly of polys) {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
      if (((yi > pt[1]) != (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c
    }
    if (c) return true
  }
  return false
}

/* reproject a KML boundary into working pixels + compute its area (ha) */
export function clipToBoundary(boundary, geo, scale) {
  let clipped = false, clipMsg = '', boundaryPx = null, boundaryHa = null
  if (boundary) {
    if (!(geo && geo.origin && geo.res)) {
      clipMsg = 'Boundary ignored — needs a georeferenced GeoTIFF (JPG/PNG have no coordinates).'
    } else {
      const def = rasterProjDef(geo.crs)
      if (!def) {
        clipMsg = 'Map CRS ' + (geo.crs || '(unknown)') + ' not recognised — tell me the EPSG code and I will add it. Counted whole map.'
      } else {
        const metric = def !== 'EPSG:4326'
        const workPolys = [], worldPolys = []
        for (const poly of boundary) {
          const wp = [], wo = []
          for (const [lon, lat] of poly) {
            let X, Y
            if (metric) { const o = proj4('EPSG:4326', def, [lon, lat]); X = o[0]; Y = o[1] } else { X = lon; Y = lat }
            wo.push([X, Y])
            wp.push([(X - geo.origin[0]) / geo.res[0] * scale, (Y - geo.origin[1]) / geo.res[1] * scale])
          }
          workPolys.push(wp); worldPolys.push(wo)
        }
        boundaryPx = workPolys; clipped = true
        if (metric) {
          boundaryHa = 0
          for (const wo of worldPolys) {
            let a = 0
            for (let i = 0, j = wo.length - 1; i < wo.length; j = i++) { a += wo[j][0] * wo[i][1] - wo[i][0] * wo[j][1] }
            boundaryHa += Math.abs(a / 2) / 10000
          }
        }
      }
    }
  }
  return { clipped, clipMsg, boundaryPx, boundaryHa }
}
