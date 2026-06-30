# DIA — Drone Imagery Analysis

Count oil palms (plantation) or polybag seedlings (nursery) from a drone map.
**React + Vite** front end, **Supabase** back end. The Google Gemini API key lives
**server-side** in a Supabase Edge Function, so it is never exposed in the browser
and you never type it in.

## Architecture

```
React app (Vite)                Supabase
─────────────────               ─────────────────────────────
 upload GeoTIFF/JPG/PNG  ──►  Edge Function `dia-count` ──►  Google Gemini
 tile + annotate                holds GEMINI_API_KEY        vision model
 sign-in (email link)           verify_jwt = true
```

- **No key in the browser.** Anything in React is public; the key stays in the
  Edge Function as a Supabase secret.
- **Sign-in required.** Only authenticated users can call the function, which
  protects your Gemini quota.

## Quick start

```bash
npm install
cp .env.example .env.local     # add your Supabase URL + anon key
npm run dev                    # http://localhost:5173
```

Full backend setup (Gemini key, Supabase project, deploying the Edge Function,
enabling email auth, hosting the build) is in **[AI-SETUP.md](./AI-SETUP.md)**.

## Use

- Sign in with the emailed magic link.
- Drop a **GeoTIFF / TIFF / JPG / PNG**.
- Pick **Plantation palms** or **Nursery polybags**.
- Optional: drop a **.kml** boundary to count only inside your block.
- Pick a **Detail** level (higher = denser nursery, slower), then **Count**.
- Download the HTML report, annotated PNG, CSV, and (for GeoTIFFs) GeoJSON.

## Project layout

```
index.html               Vite entry
src/
  main.jsx               React bootstrap
  App.jsx                auth gate + layout
  components/
    Auth.jsx             email magic-link sign-in
    Counter.jsx          the tool (upload, count, canvas, downloads)
  lib/
    supabase.js          Supabase client (public URL + anon key)
    readMap.js           GeoTIFF / image → working RGBA buffer
    ai.js                tile the map, call the Edge Function, de-dupe
    detect.js            local greenness engine (offline fallback) + presets
    geo.js               KML parse, reproject, clip-to-boundary
    downloads.js         report / PNG / CSV / GeoJSON exports
supabase/
  config.toml            functions.dia-count → verify_jwt = true
  functions/dia-count/       the Edge Function that holds GEMINI_API_KEY
legacy/standalone.html   the original single-file app (reference / offline)
proxy/                   old Cloudflare / val.town proxies (alternatives)
```

## Notes

- A **GeoTIFF** carries real coordinates → per-palm CSV + GeoJSON for QGIS.
- Large maps are downsampled for detection; counts scale back to full size. For
  multi-GB maps, export a **Cloud-Optimized GeoTIFF** (internal overviews) so the
  app reads only a low-res level.
- KML boundaries are assumed WGS84 lat/long; the GeoTIFF may be WGS84 lat/long or
  a WGS84 UTM zone. Other CRS → tell me the EPSG code to add it. KMZ → export plain `.kml`.
