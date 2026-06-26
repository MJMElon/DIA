# Setup — Supabase Edge Function (holds the Gemini key) + Auth

DIA is now a **React (Vite)** app with a **Supabase** backend. The Google Gemini
API key lives **server-side** in a Supabase **Edge Function** — it is never put in
the React code and never reaches the browser, so it can't be scraped or revoked.

```
React app (browser) ──image tile + your login token──► Supabase Edge Function ──► Google Gemini
                    ◄──────── count + points ─────────  (holds GEMINI_API_KEY)
```

Only **signed-in** users can call the function (`verify_jwt = true`), so strangers
who find your URL can't spend your Gemini quota.

---

## 1. Get a Gemini API key

1. Go to **Google AI Studio** → <https://aistudio.google.com/app/apikey>.
2. Create an API key (starts with `AIza...`). Make sure the **Generative Language
   API** is enabled for that Google project.

## 2. Create a Supabase project

1. Sign up at <https://supabase.com> and create a project (free tier is fine).
2. From **Project Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
   (Both are safe to ship in the browser — they only grant what your auth allows.)

## 3. Deploy the Edge Function with the key as a secret

Install the Supabase CLI (<https://supabase.com/docs/guides/cli>), then:

```bash
# log in and link to your project
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# store the Gemini key server-side (NOT in any file)
supabase secrets set GEMINI_API_KEY=AIza...your-key...
# optional:
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
supabase secrets set ALLOWED_ORIGIN=https://YOUR-USERNAME.github.io

# deploy the counting function
supabase functions deploy count
```

`supabase/config.toml` already sets `verify_jwt = true` for the function, so it
rejects anyone who isn't signed in.

## 4. Turn on email sign-in

In the Supabase dashboard → **Authentication → Providers → Email**, make sure
**Email** is enabled (magic link works out of the box). Under
**Authentication → URL Configuration**, add your site URL (e.g.
`https://YOUR-USERNAME.github.io/DIA/` and `http://localhost:5173`) to the
**Redirect URLs** so the sign-in link returns to your app.

## 5. Configure and run the app

```bash
cp .env.example .env.local      # then edit it
#   VITE_SUPABASE_URL=...        (from step 2)
#   VITE_SUPABASE_ANON_KEY=...   (from step 2)

npm install
npm run dev                     # http://localhost:5173
```

Sign in with the magic link, drop a map, pick **Plantation palms** or
**Nursery polybags**, and click **Count**. No key entry — ever.

## 6. Build for hosting

```bash
npm run build      # outputs static files to dist/
```

Deploy `dist/` to **GitHub Pages**, **Vercel**, **Netlify**, or **Supabase
Hosting**. `vite.config.js` uses `base: './'`, so the same build works from a
sub-path (GitHub Pages project sites) or a root domain. Remember to set the same
two `VITE_…` env vars in your host's build settings.

---

## Notes

- **Cost:** each tile is one Gemini request; a large map is many tiles. `gemini-2.5-flash`
  is inexpensive — watch billing if you run big maps often. Change the model with the
  `GEMINI_MODEL` secret.
- **Why a function and not the key in code?** The browser bundle is public. Anything
  in React (including env vars prefixed `VITE_`) ships to users. Only a server-side
  secret stays hidden — that's the Edge Function.
- **Quota protection:** `verify_jwt = true` + email auth means only your users can count.
  For tighter control, restrict sign-ups in the Supabase Auth settings.
- **Privacy:** in AI mode image tiles leave the browser (to your function, then Google).
- **Legacy:** the original single-file version is kept at `legacy/standalone.html`, and the
  old Cloudflare/val.town proxies remain in `proxy/` as alternatives to the Edge Function.
