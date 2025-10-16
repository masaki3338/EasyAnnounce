export const config = { runtime: "edge" };

const VOICEVOX_BASE = "https://voicevox-engine-l6ll.onrender.com";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const subPath = url.pathname.replace(/^\/api\/tts-voicevox/, "") || "/";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors() });
  }

  try {
    // GET /api/tts-voicevox or /version
    if (req.method === "GET" && (subPath === "/" || subPath === "/version")) {
      const r = await fetch(`${VOICEVOX_BASE}/version`, { cache: "no-store" });
      const txt = await r.text();
      return new Response(txt, {
        status: r.status,
        headers: { ...cors(), "content-type": "text/plain; charset=utf-8" },
      });
    }

    // GET /api/tts-voicevox/speakers
    if (req.method === "GET" && subPath === "/speakers") {
      const r = await fetch(`${VOICEVOX_BASE}/speakers`, { cache: "no-store" });
      const txt = await r.text();
      return new Response(txt, {
        status: r.status,
        headers: { ...cors(), "content-type": "application/json; charset=utf-8" },
      });
    }

    // POST /api/tts-voicevox/tts-cache
    if (req.method === "POST" && subPath === "/tts-cache") {
      const body = await req.json().catch(() => ({} as any));
      const { text, speaker = 3, speedScale = 1.0 } = body || {};
      if (!text) {
        return new Response(JSON.stringify({ error: "Missing text" }), {
          status: 400,
          headers: { ...cors(), "content-type": "application/json" },
        });
      }

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
        return new Response(JSON.stringify({ error: "audio_query failed", detail: msg }), {
          status: q.status,
          headers: { ...cors(), "content-type": "application/json" },
        });
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
        return new Response(JSON.stringify({ error: "synthesis failed", detail: msg }), {
          status: s.status,
          headers: { ...cors(), "content-type": "application/json" },
        });
      }

      const bytes = new Uint8Array(await s.arrayBuffer());
      return new Response(bytes, {
        status: 200,
        headers: { ...cors(), "content-type": "audio/wav" },
      });
    }

    return new Response(JSON.stringify({ detail: "Not Found" }), {
      status: 404,
      headers: { ...cors(), "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "voicevox proxy failed", detail: String(e?.message || e) }),
      { status: 502, headers: { ...cors(), "content-type": "application/json" } }
    );
  }
}
