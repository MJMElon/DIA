# AI counting (Google Gemini) — setup

DIA has two counting engines:

- **Local** — greenness detection, runs entirely in your browser, free and offline.
  Good default for well-spaced **plantation palms**.
- **AI · Gemini** — sends image tiles to Google's vision model and counts each tile,
  then sums and de-duplicates. Much higher accuracy for **dense nursery polybags**.

Your Gemini API key must **never** live in the web page (it is public — anyone could
steal it). Instead you run a tiny **proxy** that holds the key server-side. The browser
talks to the proxy; only the proxy talks to Google with the key.

```
Browser (DIA)  ──image tile──►  Your proxy (holds key)  ──►  Google Gemini
              ◄──count+points──                          ◄──
```

This guide uses **Cloudflare Workers** (free tier, no servers to manage). The proxy code
is in `proxy/`.

---

## 1. Get a Gemini API key

1. Go to **Google AI Studio** → <https://aistudio.google.com/app/apikey>.
2. Create an API key. Copy it (starts with `AIza...`).

## 2. Deploy the proxy (Cloudflare Workers)

You need a free Cloudflare account and Node.js installed.

```bash
cd proxy

# install the Cloudflare CLI (one-off)
npm install -g wrangler

# log in to your Cloudflare account (opens a browser)
wrangler login

# store your Gemini key as a secret (NOT in any file)
wrangler secret put GEMINI_API_KEY
# paste the AIza... key when prompted

# OPTIONAL but recommended: require an access token so random people who find
# your proxy URL can't spend your quota. Pick any long random string.
wrangler secret put ACCESS_TOKEN

# deploy
wrangler deploy
```

`wrangler deploy` prints your proxy URL, e.g.:

```
https://dia-count-proxy.YOUR-SUBDOMAIN.workers.dev
```

**Recommended:** edit `proxy/wrangler.toml` and set `ALLOWED_ORIGIN` to the site you
serve DIA from (e.g. `https://YOUR-USERNAME.github.io`), then `wrangler deploy` again.
This restricts browser calls to your own page.

## 3. Point the app at the proxy

1. Open DIA in your browser.
2. Set **Counting engine** to **AI · Gemini**.
3. Open **AI settings** and paste:
   - **Proxy endpoint URL** — the `https://...workers.dev` URL from step 2.
   - **Access token** — the value you set for `ACCESS_TOKEN` (leave blank if you skipped it).
   These are saved in your browser (localStorage), so you only enter them once.

Now drop a map, pick **Plantation palms** or **Nursery polybags**, and click **Count**.
Progress shows tile-by-tile. The annotated map, CSV, GeoJSON and HTML report all work the
same as the local engine.

---

## Notes & tuning

- **Cost:** each tile is one Gemini request. A large map can be dozens of tiles per count.
  `gemini-2.5-flash` (the default) is inexpensive; watch your Google billing if you run
  big maps often. Change the model by editing `GEMINI_MODEL` in `wrangler.toml`.
- **Accuracy:** tiling is what makes dense counts (e.g. nursery polybags) reliable — each
  tile only has a few dozen items, which is where vision models are most accurate. Overlap
  between tiles is de-duplicated automatically.
- **Privacy:** in AI mode the image tiles *do* leave your machine (they go to your proxy
  and then to Google). Local mode still uploads nothing.
- **Other hosts:** the same `worker.js` logic works on Vercel/Netlify functions with minor
  wrapping; Cloudflare Workers is just the simplest free option. `proxy/val-town.js` is the
  same proxy adapted for [val.town](https://val.town) — paste it into an HTTP val and add
  `GEMINI_API_KEY` as an environment variable.

---

## Option B — embed the key directly (no proxy)

If you don't want any proxy, you can paste the key straight into the page. **Understand the
trade-off:** the page is public, so the key is publicly readable — there is no way to hide it
(spacing/obfuscation does not work; the browser must send the real key to Google, visible in
the Network tab). Only do this with a key you've locked down so it can't cost you money.

**Make the key safe to expose:**

1. Use a Gemini key from a Google Cloud project with **billing DISABLED** (free tier only).
   An exposed free-tier key can only ever hit the free daily quota — it can never be charged.
2. In **Google Cloud Console → APIs & Services → Credentials**, click the key and set:
   - **API restrictions → Restrict key → Generative Language API** (so the key is useless for anything else).
   - **Application restrictions → Websites** → add `mjmelon.github.io/*` (best-effort; limits casual abuse).
3. Expect that GitHub/Google secret-scanning may still flag or auto-disable the key over time.
   If counting suddenly stops working, generate a fresh (free-tier) key and replace it.

**Wire it in:** edit `index.html`, find this line near the top of the `<script>`:

```js
const DEFAULT_GEMINI_KEY='';    // paste your AIza... key here
```

Put your key between the quotes, commit. AI mode then works for everyone with no key entry —
no proxy, no settings. (The in-page "AI settings → Direct mode" fields still work as an override.)
