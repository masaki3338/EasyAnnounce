// api/tts-voicevox/tts-cache.js
// 役割: (text,speaker,speed) をキーに、WAV をサーバ側で LRU キャッシュして返す
// 依存なし／Vercel のメモリ内に保持（インスタンスが再起動すると消えますが、バースト時の体感は大幅改善）

module.exports.config = { api: { bodyParser: false } };

const TARGET = (process.env.VOICEVOX_URL || 'https://voicevox-engine-l6ll.onrender.com').replace(/\/+$/,'');
const MAX_ITEMS = 64;            // LRU の上限（必要に応じて増減）
const TTL_MS = 1000 * 60 * 60;   // 1時間 (用途に応じて)

const g = globalThis;
if (!g.__tts_lru__) {
  g.__tts_lru__ = { map: new Map(), order: [] }; // key -> {buf, mime, ts}
}
const LRU = g.__tts_lru__;

// 簡易ハッシュ
const hash = (s) => {
  let h = 0; for (let i = 0; i < s.length; i++) h = ((h<<5)-h + s.charCodeAt(i))|0;
  return h.toString(36);
};

const touch = (key) => {
  const i = LRU.order.indexOf(key);
  if (i >= 0) LRU.order.splice(i, 1);
  LRU.order.unshift(key);
  while (LRU.order.length > MAX_ITEMS) {
    const drop = LRU.order.pop();
    if (drop) LRU.map.delete(drop);
  }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ detail:'Method Not Allowed' }); return; }

  // 入力: JSON { text, speaker, speedScale }
  let bodyBuf = Buffer.from([]);
  for await (const chunk of req) bodyBuf = Buffer.concat([bodyBuf, Buffer.from(chunk)]);
  let payload = {};
  try { payload = JSON.parse(bodyBuf.toString('utf-8') || '{}'); } catch {}

  const text = String(payload.text || '');
  const speaker = Number(payload.speaker ?? 1);
  const speedScale = Number(payload.speedScale || 1.0);

  if (!text) { res.status(400).json({ ok:false, error:'text required' }); return; }

  // キーを作る
  const key = hash(`${speaker}|${speedScale}|${text}`);
  // ヒット？
  const now = Date.now();
  const hit = LRU.map.get(key);
  if (hit && now - hit.ts < TTL_MS) {
    touch(key);
    res.setHeader('Content-Type', hit.mime || 'audio/wav');
    res.setHeader('X-TTS-Cache', 'HIT');
    res.status(200).end(hit.buf);
    return;
  }

  // ミス → 上流へ: 1) audio_query（空ボディPOST）
  const qParams = new URLSearchParams({ text, speaker: String(speaker) });
  const qRes = await fetch(`${TARGET}/audio_query?${qParams.toString()}`, { method:'POST' });
  if (!qRes.ok) {
    res.status(qRes.status).end(await qRes.text());
    return;
  }
  const query = await qRes.json();
  query.speedScale = speedScale;

  // 2) synthesis（JSON ボディ／duplex は上流へ送る側の node-fetch 実装に依存。ここは自分が送る側）
  const sRes = await fetch(`${TARGET}/synthesis?speaker=${encodeURIComponent(speaker)}`, {
    method:'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(query),
  });
  if (!sRes.ok) {
    res.status(sRes.status).end(await sRes.text());
    return;
  }
  const buf = Buffer.from(await sRes.arrayBuffer());

  // LRU に格納
  LRU.map.set(key, { buf, mime: sRes.headers.get('content-type') || 'audio/wav', ts: now });
  touch(key);

  res.setHeader('Content-Type', sRes.headers.get('content-type') || 'audio/wav');
  res.setHeader('X-TTS-Cache', 'MISS');
  res.status(200).end(buf);
};
