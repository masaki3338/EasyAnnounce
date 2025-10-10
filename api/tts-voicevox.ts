// api/tts-voicevox.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
const VOICEVOX_BASE = "https://voicevox-engine-l6ll.onrender.com";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const subPath = (req.url || "").replace(/^\/api\/tts-voicevox/, "") || "/";

  try {
    // GET /api/tts-voicevox or /version
    if (req.method === "GET" && (subPath === "/" || subPath === "/version")) {
      const r = await fetch(`${VOICEVOX_BASE}/version`);
      const txt = await r.text();
      res.setHeader("Content-Type", "text/plain; charset=utf-8"); // ← ここを text/plain に
      res.status(r.status).send(txt);
      return;
    }

    // GET /api/tts-voicevox/speakers
    if (req.method === "GET" && subPath === "/speakers") {
      const r = await fetch(`${VOICEVOX_BASE}/speakers`);
      const txt = await r.text();
      res.setHeader("Content-Type", "text/plain; charset=utf-8"); // ← ここを text/plain に
      res.status(r.status).send(txt);
      return;
    }

    // POST /api/tts-voicevox/tts-cache
    if (req.method === "POST" && subPath === "/tts-cache") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { text, speaker = 3, speedScale = 1.0 } = body || {};
      if (!text) { res.status(400).json({ error: "Missing text" }); return; }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort("server-timeout"), 20000);

      // 1) audio_query
      const q = await fetch(
        `${VOICEVOX_BASE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
        { method: "POST", signal: ctrl.signal }
      );
      if (!q.ok) {
        clearTimeout(timer);
        const msg = await q.text().catch(() => "");
        res.status(q.status).json({ error: "audio_query failed", detail: msg });
        return;
      }
      const query = await q.json();
      (query as any).speedScale = speedScale;

      // 2) synthesis
      const s = await fetch(`${VOICEVOX_BASE}/synthesis?speaker=${speaker}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
        signal: ctrl.signal,
      });

      clearTimeout(timer);

      if (!s.ok) {
        const msg = await s.text().catch(() => "");
        res.status(s.status).json({ error: "synthesis failed", detail: msg });
        return;
      }

      const buf = Buffer.from(await s.arrayBuffer());
      res.setHeader("Content-Type", "audio/wav");
      res.status(200).send(buf);
      return;
    }

    res.status(404).json({ detail: "Not Found" });
  } catch (e: any) {
    res.status(502).json({ error: "voicevox proxy failed", detail: String(e) });
  }
}
