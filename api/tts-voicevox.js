// api/tts-voicevox.js  ― Vercelのサーバーレス関数
const TARGET_BASE = process.env.VOICEVOX_URL; // 例: https://voicevox-engine-l6ll.onrender.com

export default async function handler(req, res) {
  if (!TARGET_BASE) return res.status(500).json({ ok: false, error: "VOICEVOX_URL not set" });

  // /api/tts-voicevox?debug=1 で動作確認
  if (req.query && req.query.debug) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({ ok: true, base: TARGET_BASE });
  }

  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/^\/api\/tts-voicevox\/?/, ""); // 追加パスがあれば付く
  const target = `${TARGET_BASE}/${path}${url.search || ""}`;

  try {
    const init = {
      method: req.method,
      headers: { ...req.headers, host: "", connection: "", "accept-encoding": "" },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
    };
    const r = await fetch(target, init);

    res.status(r.status);
    r.headers.forEach((v, k) => { if (k.toLowerCase() !== "content-encoding") res.setHeader(k, v); });
    res.setHeader("Access-Control-Allow-Origin", "*");

    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.status(502).json({ ok: false, proxy: "failed", message: String(e?.message || e) });
  }
}
