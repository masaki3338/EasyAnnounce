// src/ttsBridge.ts
import localForage from "localforage";

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

  // ★ 特例：イニングの攻撃アナウンスは分割しない
  if (/(?:\d+回[表裏])[^。！？!?]*攻撃は/.test(t)) {
    return [t];
  }

  // まず「。！？!?」で区切る
  let segs = t.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(Boolean);

  // 1文しかできず、かつ全体が“長い”ときだけ「、」で分割（短文は分割しない）
  if (segs.length === 1 && t.length >= 14) {
    segs = t.split(/(?<=、)/).map(s => s.trim()).filter(Boolean);
  }
  return segs;
}



async function playViaVoiceVox(text: string, onstart?: () => void, onend?: () => void) {
  const gender  = (await localForage.getItem<string>("ttsGender")) === "male" ? "male" : "female";
  const speaker = await localForage.getItem<number>("ttsDefaultSpeaker"); // male=13 / female=30 を保存済み

  const qs = new URLSearchParams({ text });
  if (typeof speaker === "number") {
    qs.set("speaker", String(speaker)); // ← 確実に反映（サーバは speaker 最優先）
  } else {
    qs.set("gender", gender);
  }

  //const url = `/api/tts-voicevox?${qs.toString()}`;
const url = buildTtsUrlWithVoice(text);
  const audio = new Audio(url);
  onstart?.();
  await audio.play().catch(() => {});
  audio.onended = () => onend?.();
}

(function installBridge() {
  const synth = window.speechSynthesis;
  const nativeSpeak = synth.speak.bind(synth);
  const bridged = async (utter: SpeechSynthesisUtterance) => {
    const text = (utter?.text ?? "").trim();
    if (!text) return;
    await playViaVoiceVox(
      text,
      () => utter.onstart?.(new Event("start")),
      () => utter.onend?.(new Event("end"))
    );
  };

  // 1) 直接上書き
  try {
    // @ts-ignore
    synth.speak = bridged;
    console.log("[EA-TTS] bridged via direct assignment");
    (window as any).EATTS = { speak: bridged };
    return;
  } catch {}

  // 2) iOS Safari 用 Proxy フォールバック
  try {
    const proxy = new Proxy(synth, {
      get(target, prop, receiver) {
        if (prop === "speak") return bridged;
        return Reflect.get(target, prop, receiver);
      },
    });
    // @ts-ignore
    window.speechSynthesis = proxy;
    console.log("[EA-TTS] bridged via Proxy");
    (window as any).EATTS = { speak: bridged };
    return;
  } catch {}

  // 3) 最終手段：グローバル関数を提供
  (window as any).EATTS = { speak: bridged };
  console.warn("[EA-TTS] could not patch speechSynthesis; use window.EATTS.speak instead");
})();



function buildTtsUrlWithVoice(text: string) {
  const t = encodeURIComponent(text);
  // localStorage 優先（同期で読める）
  const sp = localStorage.getItem("ttsDefaultSpeaker");
  const g  = localStorage.getItem("ttsGender");

  if (sp && /^\d+$/.test(sp)) {
    return `/api/tts-voicevox?text=${t}&speaker=${sp}`; // ← speaker が最優先で効く
  }
  if (g === "male" || g === "female") {
    return `/api/tts-voicevox?text=${t}&gender=${g}`;   // ← 無ければ gender で指定
  }
  return `/api/tts-voicevox?text=${t}`;                 // ← どちらも無ければ既定(女性=30)
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
    //const r = await fetch(`${apiBase}/api/tts-voicevox?text=${encodeURIComponent(key)}`);
    const r = await fetch(buildTtsUrlWithVoice(key));
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!r.ok || !ct.startsWith("audio/")) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    remember(key, url);
  };

function computeTimeoutMs(s: string): number {
  const n = Math.min(50, Math.max(0, s.length)); // 0〜50文字を想定
  return Math.min(3000, 1200 + n * 60);          // 1.2s + 文字数×60ms（上限3s）
}


  // playing を待つが、ms で見切る
// 追加：ss.speak より上に置く
function tryPlayWithTimeout(audio: HTMLAudioElement, label: string, ms = 1500) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const ok = () => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("playing", ok);
      console.log(`[EA-TTS] VOICEVOX playing ${label}`);
      resolve();
    };
    const fail = (err?: any) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("playing", ok);
      console.warn(`[EA-TTS] play timeout → WebAudio (${label})`, err);
      reject(err);
    };
    audio.addEventListener("playing", ok, { once: true });
    const p = audio.play();
    if (p && (p as any).catch) (p as any).catch(fail);
    setTimeout(() => fail(new Error("timeout")), ms);
  });
}


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
  const url = buildTtsUrlWithVoice(text);

  // 1) まず <audio src> で“即再生”を試みる（成功すれば最速）
  const a = new Audio();
  a.src = url;
  a.preload = "auto";
  a.onended = () => { try { utter.onend?.(); } catch {} };

  // <audio> がエラー → すぐ旧TTSにフォールバック ＋ 裏でプリウォーム
  a.onerror = () => {
    console.warn("[EA-TTS] <audio> single error → fallback Web Speech & prewarm");
    (window as any)._ea_originalSpeak?.(utter) ?? originalSpeak(utter);
    try { (window as any).prefetchTTS?.(text); } catch {}
  };

  console.log("[EA-TTS] VOICEVOX audio play start (single)");
  // 2) 1.2s 待って“playing”が来なければ、即 Web Speech に切替（無音で待たせない）
  tryPlayWithTimeout(a, "single", computeTimeoutMs(text)).catch(() => {
    console.warn("[EA-TTS] play timeout → fallback Web Speech & prewarm");
    (window as any)._ea_originalSpeak?.(utter) ?? originalSpeak(utter);
    try { (window as any).prefetchTTS?.(text); } catch {}
  });

  return;
}


    // ---- 複数文：最初の1文を先に鳴らして、その後を順次再生
// 置換：ss.speak 内の playOne をこれに
const playOne = (idx: number) => {
  if (idx >= segments.length) { try { utter.onend?.(); } catch {} ; return; }
  const part = segments[idx];
  const url  = buildTtsUrlWithVoice(part);

  const a = new Audio();
  a.src = url;
  a.preload = "auto";
  a.onended = () => playOne(idx + 1);
  a.onerror = async () => {
    console.warn("[EA-TTS] <audio> part error → try WebAudio");
    try {
      const r = await fetch(url, { cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!r.ok || !ct.startsWith("audio/")) throw new Error(`non-audio: ${ct}`);
      const ab = await r.arrayBuffer();
      await playWavWithWebAudio(ab, () => playOne(idx + 1));
    } catch (e) {
      console.warn("[EA-TTS] part play failed → fallback Web Speech", e);
      originalSpeak(utter);
    }
  };

  console.log(`[EA-TTS] VOICEVOX audio play start (part ${idx + 1})`);
  // ★ 1.5s で見切り→WebAudioに切替
  tryPlayWithTimeout(a, `part ${idx + 1}/${segments.length}`, computeTimeoutMs(part))
    .catch(async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (!r.ok || !ct.startsWith("audio/")) throw new Error(`non-audio: ${ct}`);
        const ab = await r.arrayBuffer();
        await playWavWithWebAudio(ab, () => playOne(idx + 1));
      } catch (e) {
        console.warn("[EA-TTS] part play (timeout) → fallback Web Speech", e);
        originalSpeak(utter);
      }
    });
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
