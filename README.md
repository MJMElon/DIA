# Frond — Oil Palm & Polybag Counter

A single-file, browser-only tool to count oil palms (plantation) or polybag
seedlings (nursery) from a drone map. No server, no install, no data leaves the
browser. Drop a map, count, download the report, keep it on your machine.

## Put it online with GitHub Pages

1. Create a repo and add this `index.html` to it.
2. Repo **Settings -> Pages -> Source: Deploy from branch -> main / root**.
3. Wait ~1 minute. Your tool is live at `https://USERNAME.github.io/REPO/`.
4. Share that link — anyone can open it in a browser and use it.

## Use

- Drop a GeoTIFF / TIFF / JPG / PNG.
- Pick **Plantation palms** or **Nursery polybags**.
- Optional: enter GSD (cm/pixel) and spacing (m) for best accuracy; otherwise it
  estimates spacing from the map.
- Adjust **sensitivity** if it over- or under-counts, then **Count**.
- Download the HTML report, annotated PNG, CSV, and (for GeoTIFFs) GeoJSON.

## Notes

- A GeoTIFF gives real coordinates per palm (CSV + GeoJSON for QGIS).
- Large maps are downsampled for speed; the count is scaled back to full size.
- Greenness detection is best on separated mature palms / tidy nursery rows.

## Counting inside a block boundary (KML)

Export the **GeoTIFF** (not JPG/PDF) — only the GeoTIFF carries the coordinates
needed to line up a boundary. Then in the tool, also drop your **.kml** boundary
file. The tool reprojects the boundary onto the map, counts only palms inside it,
shades everything outside, and reports the true block area and density per hectare.

- KML boundaries are assumed to be in WGS84 lat/long (the KML standard).
- The GeoTIFF may be in WGS84 lat/long or a WGS84 UTM zone (the usual drone output).
  If your map uses a different CRS, the tool will say so — send me the EPSG code
  and I'll add it.
- KMZ (zipped) isn't read directly — export a plain .kml.

## File sizes — how big can a map be?

The tool downsamples for detection, so the limit is **how big the file is on disk**
and your **device memory**, not the map's pixel count directly.

- **Plain GeoTIFF export:** comfortable up to a few hundred MB on a normal laptop;
  ~300-500 MB on a 16 GB machine; above ~1 GB it gets risky in a browser.
- **Cloud-Optimized GeoTIFF (COG, with internal overviews):** the tool reads only a
  low-resolution overview, so it opens **multi-GB** files quickly with little memory.
  This is the recommended export for large maps. (DroneDeploy/Pix4D/QGIS can export COG;
  or convert with `gdal_translate in.tif out.tif -of COG`.)
- **Detail selector:** Standard (2200px) is fine for plantation palms. For nursery
  polybags, which sit close together, choose **High (4000px)** or **Max (6500px)** so
  seedlings don't merge — at the cost of speed and memory.
- **Very large dense nurseries (tens of ha):** count per block (use your KML blocks),
  export COG, or use the desktop Python tool / QGIS for full-resolution tiling.

Rule of thumb: file size grows with area and with the square of resolution — halving
the GSD (finer detail) quadruples the size.
