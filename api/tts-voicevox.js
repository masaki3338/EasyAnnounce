// api/tts-voicevox.js
function getBase() {
  // まず環境変数、なければ 127.0.0.1（IPv6のlocalhost問題を回避）
  return process.env.VOICEVOX_URL || "http://127.0.0.1:50021";
}

// 先頭付近に追加
function resolveSpeaker(req) {
  // 1) speaker が数値で来たら最優先
  const sp = Number(req.query.speaker);
  if (!Number.isNaN(sp)) return sp;

  // 2) gender が来たら男女マップで決定（※あなたの環境に合わせて調整）
  const g = String(req.query.gender || "").toLowerCase();
  if (g === "male")   return 13; // ← 実際の style_id に合わせる
  if (g === "female") return 30; // ← 実際の style_id に合わせる

  // 3) 既定
  return 30;
}

// ひら→カタ変換（簡易）
function hiraToKata(s) {
  return s.replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}
// モーラ文字を連結
function joinMora(moras = []) {
  return moras.map(m => m?.text ?? "").join("");
}

// 「～番」を無アクセントに（上がっていく読み）
const BAN_WORDS = new Set([
  "イチバン","ニバン","サンバン","ヨンバン","ゴバン","ロクバン","ナナバン","ハチバン","キュウバン"
]);

function forceRisingBan(query) {
  if (!query || !Array.isArray(query.accent_phrases)) return query;
  for (const ap of query.accent_phrases) {
    const wordK = hiraToKata(joinMora(ap.moras || []));
    // 「1番（いちばん）」などでも、音声化時は「イチバン」単独のAPになることが多い
    if (BAN_WORDS.has(wordK)) {
      // 無アクセント化（0にすると下がりが無くなり、スーッと上がる感じになる）
      ap.accent = 0;
    }
  }
  return query;
}



async function handler(req, res) {
  try {
    const text = String(req.query.text ?? req.body?.text ?? "").trim();
    const base = getBase();
    if (!text) return res.status(400).json({ ok: false, error: "text is required" });

    const speaker = resolveSpeaker(req);
    const speedScale = Number(req.query.speed ?? 1.08);
    const pitchScale = Number(req.query.pitch ?? 1);
    const intonationScale = Number(req.query.intonation ?? 1.2); // ← param名も分離

    // 診断：/api/tts-voicevox?debug=1
    if ("debug" in req.query) {
      const v = await fetch(`${base}/version`);
      const verTxt = await v.text().catch(() => "");
      return res.status(200).json({
        ok: v.ok,
        base,
        version: txt,
        speaker,                             // ★採用した話者ID
        received: {                          // 参考：クエリの生値
          speaker: req.query.speaker ?? null,
          gender:  req.query.gender  ?? null,
        },
      });
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
 let query = await qRes.json();
 query = forceRisingBan(query);
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
