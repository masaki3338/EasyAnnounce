// api/tts-voicevox/version.js
module.exports = async (req, res) => {
  const TARGET = (process.env.VOICEVOX_URL || 'https://voicevox-engine-l6ll.onrender.com').replace(/\/+$/,'');
  const tAll0 = Date.now();            // 関数全体の開始

  const t0 = Date.now();               // 上流fetch 前
  const r = await fetch(`${TARGET}/version`).catch(() => null);
  const t1 = Date.now();               // 上流fetch 後

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!r) {
    res.setHeader('X-Upstream-Time', String(t1 - t0));
    res.setHeader('X-Proxy-Total', String(Date.now() - tAll0));
    res.status(502).json({ ok:false, proxy:'fetch_failed' });
    return;
  }

  const txt = await r.text();
  // ← 計測ヘッダ（DevTools の Headers で見られます）
  res.setHeader('X-Upstream-Time', String(t1 - t0));      // VOICEVOX への往復＋処理時間
  res.setHeader('X-Proxy-Total', String(Date.now() - tAll0)); // この関数全体の時間

  res.status(r.status).end(txt);
};
