export const config = { runtime: "edge" };

const VOICEVOX_BASE =
  (globalThis as any).process?.env?.VOICEVOX_BASE ||
  "https://voicevox-engine-l6ll.onrender.com";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

export default async function handler(req: Request) {
  // すべて try/catch 内にして、必ず JSON でエラー詳細を返す
  try {
    const { pathname } = new URL(req.url);
    const subPath = pathname.replace(/^\/api\/tts-voicevox/, "") || "/";

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: cors() });
    }

    // ---- /version
    if (req.method === "GET" && (subPath === "/version")) {
      const r = await fetch(`${VOICEVOX_BASE}/version`, { cache: "no-store" });
      const body = await r.text();
      return new Response(body, {
        status: r.status,
        headers: { ...cors(), "content-type": "text/plain; charset=utf-8" },
      });
    }

    // ---- /speakers
    if (req.method === "GET" && subPath === "/speakers") {
      const r = await fetch(`${VOICEVOX_BASE}/speakers`, { cache: "no-store" });
      const body = await r.text();
      return new Response(body, {
        status: r.status,
        headers: { ...cors(), "content-type": "application/json; charset=utf-8" },
      });
    }

    // ---- /tts-cache
    if (req.method === "POST" && subPath === "/tts-cache") {
      const body = await req.json().catch(() => ({} as any));
      const { text, speaker = 3, speedScale = 1.0 } = body || {};
      if (!text) {
        return new Response(JSON.stringify({ error: "Missing text" }), {
          status: 400,
          headers: { ...cors(), "content-type": "application/json" },
        });
      }

      // 20s タイムアウト（OnRender のコールド対策）
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort("server-timeout"), 20000);

      try {
        // 1) audio_query
        const q = await fetch(
          `${VOICEVOX_BASE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
          { method: "POST", signal: ctrl.signal }
        );
        if (!q.ok) {
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
      } finally {
        clearTimeout(timer);
      }
    }

    // ---- not found
    return new Response(JSON.stringify({ detail: "Not Found", subPath }), {
      status: 404,
      headers: { ...cors(), "content-type": "application/json" },
    });
  } catch (e: any) {
    // ここに来れば“関数自体が落ちている”原因が分かる
    console.error("[tts-voicevox] crashed:", e);
    return new Response(
      JSON.stringify({
        error: "voicevox proxy failed",
        detail: String(e?.message || e),
      }),
      { status: 502, headers: { ...cors(), "content-type": "application/json" } }
    );
  }
}
