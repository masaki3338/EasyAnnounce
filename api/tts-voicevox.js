// api/tts-voicevox.js
function getBase() {
  // まず環境変数、なければ 127.0.0.1（IPv6のlocalhost問題を回避）
  return process.env.VOICEVOX_URL || "http://127.0.0.1:50021";
}

function pickSpeaker(req) {
  const rawGender = String(req.query.gender || "").toLowerCase();
  if (req.query.speaker !== undefined) return Number(req.query.speaker); // 明示指定が最優先
  if (rawGender === "male" || rawGender === "man" || rawGender === "男性") return 13; // 男性
  return 30; // 既定は女性アナウンス
}

async function handler(req, res) {
  try {
    const text = String(req.query.text ?? req.body?.text ?? "").trim();
    const base = getBase();
    if (!text) return res.status(400).json({ ok: false, error: "text is required" });

    const speaker = pickSpeaker(req);
    const speedScale = Number(req.query.speed ?? 1.08);
    const pitchScale = Number(req.query.pitch ?? 1);
    const intonationScale = Number(req.query.intonation ?? 1.2); // ← param名も分離

    // 診断：/api/tts-voicevox?debug=1
    if ("debug" in req.query) {
      const v = await fetch(`${base}/version`);
      const verTxt = await v.text().catch(() => "");
      return res.status(200).json({ ok: v.ok, base, version: verTxt });
    }

    // 0) エンジン起動確認
    const ver = await fetch(`${base}/version`);
    if (!ver.ok) throw new Error(`engine /version ${ver.status}`);

    // 1) audio_query
    const qRes = await fetch(
      `${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
      { method: "POST" }
    );
    if (!qRes.ok) throw new Error(`audio_query ${qRes.status}`);
    const query = await qRes.json();
    query.speedScale = speedScale;
    query.pitchScale = pitchScale;
    query.intonationScale = intonationScale;

    // 2) synthesis
    const sRes = await fetch(`${base}/synthesis?speaker=${speaker}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    if (!sRes.ok) throw new Error(`synthesis ${sRes.status}`);

    const ab = await sRes.arrayBuffer();
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    res.end(Buffer.from(ab));
  } catch (e) {
    console.error("[TTS] error", e?.message || e);
    // 例外でも 502 JSON を返す（dev サーバを落とさない）
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}

module.exports = handler;
module.exports.config = { runtime: "nodejs", regions: ["hnd1"] };
