// DIA counting Edge Function (Supabase / Deno).
//
// Holds the Google Gemini API key server-side so it is NEVER shipped to the
// browser. The React app calls this via supabase.functions.invoke('dia-count', ...),
// which attaches the signed-in user's JWT. With verify_jwt enabled (see
// supabase/config.toml) the platform rejects anonymous callers, so only your
// authenticated users can spend your Gemini quota.
//
// The function is named `dia-count` (namespaced) so it won't clash with other
// modules in a shared Supabase project. Note: secrets are PROJECT-WIDE, so
// GEMINI_API_KEY is visible to every function in this project.
//
// Set the secret once:  supabase secrets set GEMINI_API_KEY=AIza...
// Optional:             supabase secrets set GEMINI_MODEL=gemini-2.5-flash
//                       supabase secrets set ALLOWED_ORIGIN=https://you.github.io

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*'
const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  if (!GEMINI_API_KEY) return json({ error: 'function missing GEMINI_API_KEY secret' }, 500)

  let body: { image?: string; mode?: string }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const image = body?.image
  const mode = body?.mode === 'polybag' ? 'polybag' : 'palm'
  if (!image) return json({ error: 'no image' }, 400)

  const subject = mode === 'polybag'
    ? 'oil palm nursery polybag seedlings (small dark bags, each holding one young plant, arranged in tight rows)'
    : 'oil palm trees (each a single round green crown) in a plantation'
  const prompt =
    `This is an aerial / drone image tile. Count every distinct ${subject} you can see, ` +
    `including partial ones cut off at the tile edges. Be thorough and do not skip faint or shadowed ones. ` +
    `Return strict JSON only: {"count": <integer>, "points": [{"x": <0-1000>, "y": <0-1000>}, ...]} ` +
    `where each point marks the centre of one item and x,y are normalised to 0-1000 of the tile ` +
    `width and height. The number of points must equal count. If there are none, return count 0 and an empty array.`

  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
  const payload = {
    contents: [{ parts: [
      { inline_data: { mime_type: 'image/jpeg', data: image } },
      { text: prompt },
    ] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          count: { type: 'INTEGER' },
          points: { type: 'ARRAY', items: {
            type: 'OBJECT',
            properties: { x: { type: 'NUMBER' }, y: { type: 'NUMBER' } },
            required: ['x', 'y'],
          } },
        },
        required: ['count'],
      },
    },
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
  let resp: Response
  try {
    resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  } catch (e) {
    return json({ error: 'gemini fetch failed', detail: String(e) }, 502)
  }
  if (!resp.ok) return json({ error: 'gemini error', status: resp.status, detail: (await resp.text()).slice(0, 400) }, 502)

  let data: any
  try { data = await resp.json() } catch { return json({ error: 'gemini bad json' }, 502) }
  let parsed: any
  try {
    const txt = (data.candidates[0].content.parts || []).map((p: any) => p.text || '').join('')
    parsed = JSON.parse(txt)
  } catch (e) {
    return json({ error: 'could not parse model output', detail: String(e) }, 502)
  }
  const points = Array.isArray(parsed.points) ? parsed.points : []
  const count = Number.isFinite(parsed.count) ? parsed.count : points.length
  return json({ count, points })
})
