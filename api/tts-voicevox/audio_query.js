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

  // === 計測開始 ===
  const tAll0 = Date.now();  // 関数全体
  const t0 = Date.now();     // 上流fetch前

  // audio_query は空ボディPOST → body 付けない
  const init = { method:'POST', headers };
  const r = await fetch(url, init).catch(e => null);

  const t1 = Date.now();     // 上流fetch後
  // === 計測ここまで ===

  if (!r) {
    res.setHeader('X-Upstream-Time', String(t1 - t0));
    res.setHeader('X-Proxy-Total', String(Date.now() - tAll0));
    res.status(502).json({ok:false, proxy:'fetch_failed'});
    return;
  }

  r.headers.forEach((val,key)=>{ 
    if (!['content-length','transfer-encoding','connection','content-encoding'].includes(key.toLowerCase())) {
      res.setHeader(key, val);
    }
  });
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 計測ヘッダを付与（DevTools の Headers で見えます）
  res.setHeader('X-Upstream-Time', String(t1 - t0));        // 上流(VOICEVOX) 往復＋処理時間
  res.setHeader('X-Proxy-Total', String(Date.now() - tAll0)); // この関数全体の時間

  const buf = Buffer.from(await r.arrayBuffer());
  res.status(r.status).end(buf);
};
