// api/tts-voicevox/audio_query.js
module.exports = async (req, res) => {
  const TARGET = (process.env.VOICEVOX_URL || 'https://voicevox-engine-l6ll.onrender.com').replace(/\/+$/,'');
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({detail:'Method Not Allowed'}); return; }

  // /api/tts-voicevox/audio_query?text=...&speaker=...
  const q = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const url = `${TARGET}/audio_query${q}`;

  // 上流にCORS由来ヘッダを渡さない
  const headers = {};
  for (const [k,v] of Object.entries(req.headers||{})) {
    const kk = k.toLowerCase();
    if (['host','connection','transfer-encoding','content-length','origin','referer','accept-encoding',
         'sec-fetch-mode','sec-fetch-site','sec-fetch-dest','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform'].includes(kk)) continue;
    headers[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
  }

  // audio_query は **空ボディPOST** → body 付けない
  const init = { method:'POST', headers };
  const r = await fetch(url, init).catch(e => null);
  if (!r) { res.status(502).json({ok:false, proxy:'fetch_failed'}); return; }

  r.headers.forEach((val,key)=>{ if (!['content-length','transfer-encoding','connection','content-encoding'].includes(key.toLowerCase())) res.setHeader(key,val); });
  res.setHeader('Access-Control-Allow-Origin', '*');

  const buf = Buffer.from(await r.arrayBuffer());
  res.status(r.status).end(buf);
};
