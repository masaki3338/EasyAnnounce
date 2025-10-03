module.exports.config = { api: { bodyParser: false } };
const TARGET = (process.env.VOICEVOX_URL || 'https://voicevox-engine-l6ll.onrender.com').replace(/\/+$/,'');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const q = req.query || {};
  const segs = Array.isArray(q.path) ? q.path : (q.path ? [q.path] : []);
  const path = segs.join('/');

  if (path.includes('://') || path.startsWith('http') || path.includes('%3A%2F%2F')) {
    res.status(400).json({ ok:false, error:'invalid path' }); return;
  }

  const search = req.url && req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  const upstream = `${TARGET}/${path}${search}`;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    const key = k.toLowerCase();
    if ([
      'host','connection','transfer-encoding','content-length',
      'origin','referer','accept-encoding',
      'sec-fetch-mode','sec-fetch-site','sec-fetch-dest',
      'sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform'
    ].includes(key)) continue;
    headers[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
  }

  const init = {
    method: req.method,
    headers,
    body: /^(GET|HEAD|OPTIONS)$/i.test(req.method || '') ? undefined : req,
  };

  let r;
  try { r = await fetch(upstream, init); }
  catch (e) { res.status(502).json({ ok:false, proxy:'fetch_failed', message:String(e && e.message || e) }); return; }

  r.headers.forEach((val, key) => {
    const kk = key.toLowerCase();
    if (!['content-length','transfer-encoding','connection','content-encoding'].includes(kk)) {
      res.setHeader(key, val);
    }
  });
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.status(r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  res.end(buf);
};
