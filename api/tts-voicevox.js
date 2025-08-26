// api/tts-voicevox.js  ← 置き換え
function getBase() {
  // まず環境変数を優先。なければ 127.0.0.1:50021（IPv6のlocalhost問題を回避）
  return process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
}

// 先頭にユーティリティを追加
function withTimeout(fetcher, ms, label) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), ms);
  return fetcher(ac.signal)
    .finally(() => clearTimeout(to))
    .catch((e) => { throw new Error(`${label}: ${e?.message || e}`); });
}

// 使うところ（例）：
const base = process.env.VOICEVOX_URL;

// 0) /version チェック（短め）
const verRes = await withTimeout(
  (signal) => fetch(`${base}/version`, { signal }),
  3000,
  'engine /version timeout'
);
if (!verRes.ok) throw new Error(`engine /version ${verRes.status}`);

// 1) audio_query（中くらい）
const qRes = await withTimeout(
  (signal) => fetch(`${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, { method: 'POST', signal }),
  7000,
  'audio_query timeout'
);

// 2) synthesis（長め：合成が重い）
const sRes = await withTimeout(
  (signal) => fetch(`${base}/synthesis?speaker=${speaker}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query), signal
  }),
  20000,
  'synthesis timeout'
);

async function handler(req, res) {
  try {
    const text = String(req.query.text ?? req.body?.text ?? '').trim();
    const base = getBase();
    //const speaker = Number(req.query.speaker ?? 13);  //男性
    const speaker = Number(req.query.speaker ?? 30);  //アナウンス女性
    const speedScale = Number(req.query.speed ?? 1.08);
    const pitchScale = Number(req.query.pitch ?? 1);

    // 診断モード： ?debug=1 を付けると /version だけチェック
    if ('debug' in req.query) {
      const v = await fetch(`${base}/version`);
      const verTxt = await v.text().catch(() => '');
      return res.status(200).json({ ok: v.ok, base, version: verTxt });
    }

    if (!text) return res.status(400).json({ ok: false, error: 'text is required' });

    // 0) エンジン起動確認
    const ver = await fetch(`${base}/version`);
    if (!ver.ok) throw new Error(`engine /version ${ver.status}`);

    // 1) audio_query
    const qRes = await fetch(`${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, {
      method: 'POST'
    });
    if (!qRes.ok) throw new Error(`audio_query ${qRes.status}`);
    const query = await qRes.json();
    query.speedScale = speedScale;
    query.pitchScale = pitchScale;

    // 2) synthesis
    const sRes = await fetch(`${base}/synthesis?speaker=${speaker}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    });
    if (!sRes.ok) throw new Error(`synthesis ${sRes.status}`);

    const ab = await sRes.arrayBuffer();
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(ab));
  } catch (e) {
    console.error('[TTS] error', e?.message || e);
    // 例外でも落とさず JSON を返す（=「Function has crashed」を防ぐ）
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', regions: ['hnd1'] };
