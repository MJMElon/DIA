// DIA counting proxy — Cloudflare Worker
//
// Holds the Google Gemini API key server-side so it is never exposed to the
// browser. The DIA web app POSTs an image tile here; this Worker forwards it to
// Gemini's vision model and returns a count + point list.
//
// Secrets / vars (see AI-SETUP.md):
//   GEMINI_API_KEY  (secret, required)  — your Google AI Studio key
//   GEMINI_MODEL    (var, optional)     — defaults to "gemini-2.5-flash"
//   ALLOWED_ORIGIN  (var, optional)     — e.g. "https://you.github.io"; defaults to "*"
//   ACCESS_TOKEN    (secret, optional)  — if set, callers must send a matching
//                                          "x-access-token" header (stops random
//                                          people from spending your quota)

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    // optional shared-secret gate
    if (env.ACCESS_TOKEN) {
      if (request.headers.get('x-access-token') !== env.ACCESS_TOKEN)
        return json({ error: 'unauthorized' }, 401, cors);
    }
    if (!env.GEMINI_API_KEY) return json({ error: 'proxy missing GEMINI_API_KEY' }, 500, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
    const image = body && body.image;
    const mode = body && body.mode === 'polybag' ? 'polybag' : 'palm';
    if (!image) return json({ error: 'no image' }, 400, cors);

    const subject = mode === 'polybag'
      ? 'oil palm nursery polybag seedlings (small dark bags, each holding one young plant, arranged in tight rows)'
      : 'oil palm trees (each a single round green crown) in a plantation';
    const prompt =
      `This is an aerial / drone image tile. Count every distinct ${subject} you can see, ` +
      `including partial ones cut off at the tile edges. Be thorough and do not skip faint or shadowed ones. ` +
      `Return strict JSON only: {"count": <integer>, "points": [{"x": <0-1000>, "y": <0-1000>}, ...]} ` +
      `where each point marks the centre of one item and x,y are normalised to 0-1000 of the tile ` +
      `width and height. The number of points must equal count. If there are none, return count 0 and an empty array.`;

    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
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
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return json({ error: 'gemini fetch failed', detail: String(e) }, 502, cors);
    }
    if (!resp.ok) return json({ error: 'gemini error', status: resp.status, detail: (await resp.text()).slice(0, 400) }, 502, cors);

    let data;
    try { data = await resp.json(); } catch (e) { return json({ error: 'gemini bad json' }, 502, cors); }
    let parsed;
    try {
      const txt = (data.candidates[0].content.parts || []).map(p => p.text || '').join('');
      parsed = JSON.parse(txt);
    } catch (e) {
      return json({ error: 'could not parse model output', detail: String(e) }, 502, cors);
    }
    const points = Array.isArray(parsed.points) ? parsed.points : [];
    const count = Number.isFinite(parsed.count) ? parsed.count : points.length;
    return json({ count, points }, 200, cors);
  },
};

function corsHeaders(request, env) {
  const origin = (env && env.ALLOWED_ORIGIN) || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-access-token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}
