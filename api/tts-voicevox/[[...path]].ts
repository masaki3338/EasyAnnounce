// api/tts-voicevox/[[...path]].ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";

const VOICEVOX_BASE = "https://voicevox-engine-l6ll.onrender.com";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// タイムアウト付き fetch（上流の遅延で関数が落ちないように）
async function timedFetch(url: string, init: RequestInit | undefined, ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort("timeout"), ms);
  try {
    return await fetch(url, { ...(init || {}), signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  // /api/tts-voicevox のサブパスを安全に取り出す（例: "/", "/speakers", "/tts-cache" など）
  let subPath = "/";
  let search = "";
  try {
    const u = new URL(req.url || "/", "https://dummy.local");
    subPath = u.pathname.replace(/^\/api\/tts-voicevox/, "") || "/";
    search = u.search || "";
  } catch {}

  try {
    // ---- GET /api/tts-voicevox  or /version
    if (req.method === "GET" && (subPath === "/" || subPath === "/version")) {
      try {
        const r = await timedFetch(`${VOICEVOX_BASE}/version`, undefined, 4500);
        const txt = await r.text().catch(() => "");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.status(r.status).send(txt || "unknown");
      } catch (e: any) {
        res.status(502).json({ error: "version upstream timeout", detail: String(e) });
      }
      return;
    }

    // ---- GET /api/tts-voicevox/speakers
    if (req.method === "GET" && subPath === "/speakers") {
      try {
        const r = await timedFetch(`${VOICEVOX_BASE}/speakers`, undefined, 5000);
        const txt = await r.text().catch(() => "[]");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.status(r.status).send(txt);
      } catch (e: any) {
        res.status(502).json({ error: "speakers upstream timeout", detail: String(e) });
      }
      return;
    }

    // ---- POST /api/tts-voicevox/tts-cache
    if (req.method === "POST" && subPath === "/tts-cache") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { text, speaker = 3, speedScale = 1.0 } = body || {};
      if (!text) { res.status(400).json({ error: "Missing text" }); return; }

      const ctrl = new AbortController();
      const kill = setTimeout(() => ctrl.abort("server-timeout"), 20000); // 20s

      try {
        // 1) audio_query
        const q = await fetch(
          `${VOICEVOX_BASE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
          { method: "POST", signal: ctrl.signal }
        );
        if (!q.ok) {
          clearTimeout(kill);
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
        clearTimeout(kill);

        if (!s.ok) {
          const msg = await s.text().catch(() => "");
          res.status(s.status).json({ error: "synthesis failed", detail: msg });
          return;
        }

        const buf = Buffer.from(await s.arrayBuffer());
        res.setHeader("Content-Type", "audio/wav");
        res.status(200).send(buf);
      } catch (e: any) {
        clearTimeout(kill);
        res.status(502).json({ error: "voicevox proxy failed", detail: String(e) });
      }
      return;
    }

    // （任意）/audio_query や /synthesis をそのまま中継したい場合の簡易プロキシ
    if (subPath === "/audio_query" || subPath === "/synthesis") {
      const target = `${VOICEVOX_BASE}${subPath}${search}`;
      const init: RequestInit = {
        method: req.method,
        headers: { "Content-Type": req.headers["content-type"] || "" } as any,
      };
      if (req.method === "POST") {
        init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }
      const upstream = await timedFetch(target, init, 10000);
      const buf = Buffer.from(await upstream.arrayBuffer());
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.status(upstream.status).send(buf);
      return;
    }

    // それ以外
    res.status(404).json({ detail: "Not Found" });
  } catch (e: any) {
    res.status(500).json({ error: "handler crashed", detail: String(e) });
  }
}
