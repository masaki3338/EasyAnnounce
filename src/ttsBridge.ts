// src/ttsBridge.ts
type AnyUtt = SpeechSynthesisUtterance & { onend?: (ev?: any) => void };

(function enableGlobalTTSOverride() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const ss = window.speechSynthesis as SpeechSynthesis & { __ea_patched?: boolean };
  if (ss.__ea_patched) return;

  const originalSpeak = ss.speak.bind(ss);
  const originalCancel = ss.cancel.bind(ss);

  let currentAudio: HTMLAudioElement | null = null;

  // --- キャッシュ（同文は即再生）
  const mem = new Map<string, string>(); // text -> ObjectURL
  const MEM_LIMIT = 20;
  const keyOf = (t: string) => t;
  const remember = (k: string, url: string) => {
    mem.set(k, url);
    if (mem.size > MEM_LIMIT) {
      const first = mem.keys().next().value;
      const old = mem.get(first);
      if (old) URL.revokeObjectURL(old);
      mem.delete(first);
    }
  };

  // ttsBridge.ts の上の方に追加
function splitJa(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  // まず句点で。文が1つしかできなければ読点でも切る
  let segs = t.split(/(?<=[。！？!?])/);
  if (segs.length === 1) segs = t.split(/(?<=、)/);
  return segs.map(s => s.trim()).filter(Boolean);
}

  // --- 先読み（画面側から window.prefetchTTS('文面') で呼べる）
  (window as any).prefetchTTS = async (text: string) => {
    const key = keyOf((text || "").trim());
    if (!key || mem.has(key)) return;
    const apiBase =
      (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
      location.port === "5173"
        ? "http://localhost:3000"
        : "";
    const r = await fetch(`${apiBase}/api/tts-voicevox?text=${encodeURIComponent(key)}`);
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!r.ok || !ct.startsWith("audio/")) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    remember(key, url);
  };

  // --- <audio> で再生できない環境用に WebAudio で再生
  async function playWavWithWebAudio(ab: ArrayBuffer, onend?: () => void) {
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) throw new Error("WebAudio unsupported");
    const ctx = new AC();
    const buffer: AudioBuffer = await new Promise((resolve, reject) => {
      (ctx as AudioContext).decodeAudioData(ab.slice(0), resolve, reject);
    });
    const src = (ctx as AudioContext).createBufferSource();
    src.buffer = buffer;
    src.connect((ctx as AudioContext).destination);
    src.onended = () => { try { onend?.(); } finally { ctx.close(); } };
    src.start(0);
  }

  // --- ここで差し替え
ss.speak = (utter: any) => {
  try {
    const raw = (utter.text || "").trim();
    if (!raw) return;

    // ルビやHTMLを素の文に
    const text = raw
      .replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/g, "$1（$2）")
      .replace(/<br\s*\/?>/gi, "。")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    console.log("[EA-TTS] intercepted:", text);

    const apiBase =
      (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
      location.port === "5173"
        ? "http://localhost:3000"
        : "";

    // 文を分割（最初の1文を先に鳴らして“待ち”を短縮）
    const segments = splitJa(text);

    // ---- 1文だけ：これまで通りの経路（キャッシュ→fetch→<audio>/WebAudio）
    if (segments.length <= 1) {
      const key = keyOf(text);
      const cached = mem.get(key);
      if (cached) {
        const a = new Audio(cached);
        a.onended = () => { try { utter.onend?.(); } catch {} };
        a.onerror = () => { console.warn("[EA-TTS] cached audio error → fallback"); mem.delete(key); originalSpeak(utter); };
        a.play().catch((err) => { console.warn("[EA-TTS] cached play failed → fallback", err); originalSpeak(utter); });
        return;
      }

      const url = `${apiBase}/api/tts-voicevox?text=${encodeURIComponent(text)}`;
      fetch(url)
        .then(async (r) => {
          const ct = (r.headers.get("content-type") || "").toLowerCase();
          if (!r.ok || !ct.startsWith("audio/")) {
            const body = await r.text().catch(() => "");
            console.warn("[EA-TTS] non-audio response → fallback", { status: r.status, ct, body: body.slice(0, 120) });
            originalSpeak(utter);
            return;
          }

          const ab = await r.arrayBuffer();
          const blob = new Blob([ab], { type: ct });
          const objUrl = URL.createObjectURL(blob);
          remember(key, objUrl);

          if (currentAudio) { currentAudio.pause(); currentAudio = null; }
          const a = new Audio(objUrl);
          a.onended = () => { URL.revokeObjectURL(objUrl); currentAudio = null; try { utter.onend?.(); } catch {} };
          a.onerror  = () => {
            console.warn("[EA-TTS] <audio> error → try WebAudio");
            URL.revokeObjectURL(objUrl);
            currentAudio = null;
            playWavWithWebAudio(ab, () => { try { utter.onend?.(); } catch {} })
              .catch(() => originalSpeak(utter));
          };
          currentAudio = a;

          // “確実再生”（playing待ち→失敗でWebAudio→それも失敗なら旧TTS）
          console.log("[EA-TTS] VOICEVOX audio play start");
          const tryPlay = (audio: HTMLAudioElement, ms = 1200) =>
            new Promise<void>((resolve, reject) => {
              let settled = false;
              const ok = () => { if (settled) return; settled = true; audio.removeEventListener("playing", ok); console.log("[EA-TTS] VOICEVOX playing"); resolve(); };
              const fail = (err?: any) => { if (settled) return; settled = true; audio.removeEventListener("playing", ok); console.warn("[EA-TTS] play failed → try WebAudio", err); reject(err); };
              audio.addEventListener("playing", ok, { once: true });
              audio.play().catch(fail);
              setTimeout(() => fail(new Error("play timeout")), ms);
            });

          tryPlay(a).catch(() => {
            playWavWithWebAudio(ab, () => { try { utter.onend?.(); } catch {} })
              .catch(() => originalSpeak(utter));
          });
        })
        .catch((err) => {
          console.warn("[EA-TTS] fetch error → fallback", err);
          originalSpeak(utter);
        });
      return;
    }

    // ---- 複数文：最初の1文を先に鳴らして、その後を順次再生
    const playOne = (idx: number) => {
      if (idx >= segments.length) { try { utter.onend?.(); } catch {}; return; }
      const part = segments[idx];

      // まずは <audio src> でストリーミング再生（最速）
      const url = `${apiBase}/api/tts-voicevox?text=${encodeURIComponent(part)}`;
      const a = new Audio();
      a.src = url;
      a.preload = "auto";

      a.onplaying = () => console.log(`[EA-TTS] VOICEVOX playing part ${idx+1}/${segments.length}`);
      a.onended = () => playOne(idx + 1);
      a.onerror = async () => {
        console.warn("[EA-TTS] <audio> part error → try WebAudio");
        try {
          const r = await fetch(url);
          const ct = (r.headers.get("content-type") || "").toLowerCase();
          if (!r.ok || !ct.startsWith("audio/")) throw new Error(`non-audio: ${ct}`);
          const ab = await r.arrayBuffer();
          const AC:any = (window as any).AudioContext || (window as any).webkitAudioContext;
          const ctx = new AC();
          const buf: AudioBuffer = await new Promise((res,rej)=> (ctx as AudioContext).decodeAudioData(ab.slice(0), res, rej));
          const src = (ctx as AudioContext).createBufferSource();
          src.buffer = buf; src.connect((ctx as AudioContext).destination);
          src.onended = () => { ctx.close(); playOne(idx + 1); };
          src.start(0);
        } catch (e) {
          console.warn("[EA-TTS] part play failed → fallback Web Speech", e);
          // 失敗時は旧TTSで全文読み（最後の砦）
          originalSpeak(utter);
        }
      };

      console.log(`[EA-TTS] VOICEVOX audio play start (part ${idx+1})`);
      a.play().catch(() => a.onerror?.(new Event("error")));
    };

    (window as any)._ea_originalSpeak = originalSpeak; // 念のため退避
    playOne(0);
  } catch (e) {
    console.warn("[EA-TTS] speak wrapper error → fallback", e);
    originalSpeak(utter);
  }
};


  ss.cancel = () => {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
      }
      originalCancel();
    } catch {}
  };

  ss.__ea_patched = true;
  console.log("[EA-TTS] speechSynthesis.speak is now VOICEVOX-bridged");
})();
