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

  function currentVoiceKey() {
    const sp = localStorage.getItem("ttsDefaultSpeaker");
    const g  = localStorage.getItem("ttsGender");
    return sp && /^\d+$/.test(sp) ? `sp:${sp}` : g ? `g:${g}` : "default";
  }
  // --- キャッシュ（同文は即再生）
  const mem = new Map<string, string>(); // text -> ObjectURL
  const MEM_LIMIT = 20;
  const keyOf = (t: string) => `${currentVoiceKey()}|${t}`;
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
  const sp = localStorage.getItem("ttsDefaultSpeaker");
  const g  = localStorage.getItem("ttsGender");
  const vk = encodeURIComponent(currentVoiceKey());

  if (sp && /^\d+$/.test(sp)) return `/api/tts-voicevox?text=${t}&speaker=${sp}&vk=${vk}`;
  if (g === "male" || g === "female") return `/api/tts-voicevox?text=${t}&gender=${g}&vk=${vk}`;
  return `/api/tts-voicevox?text=${t}&vk=${vk}`;
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
      console.warn(`[EA-TTS] play timeout → WebSpeech (${label})`, err);
      reject(err);
    };
    audio.addEventListener("playing", ok, { once: true });
    const p = audio.play();
    if (p && (p as any).catch) (p as any).catch(fail);
    setTimeout(() => fail(new Error("timeout")), ms);
  });
}

// 文の長さで待ち時間を少しだけ伸ばす（最大3s）
function computeTimeoutMs(s: string): number {
  const n = Math.min(80, Math.max(0, s.length)); // 0〜80文字想定
  return Math.min(3000, 1200 + n * 30);          // 1.2s + 30ms/文字（上限3s）
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
  const textKey = keyOf(text);
  const hit = mem.get(textKey);
  if (hit) {
    const a = new Audio(hit);
    a.onended = () => { try { utter.onend?.(); } catch {} };
    a.onerror = () => { console.warn("[EA-TTS] cached audio error → fallback"); mem.delete(textKey); (window as any)._ea_originalSpeak?.(utter) ?? originalSpeak(utter); };
    a.play().catch((err) => { console.warn("[EA-TTS] cached play failed → fallback", err); (window as any)._ea_originalSpeak?.(utter) ?? originalSpeak(utter); });
    return;
  }

  const url = buildTtsUrlWithVoice(text);

  // 1) まず <audio src> で“押した瞬間に”再生開始を試みる
  const a = new Audio();
  a.src = url;
  a.preload = "auto";
  a.onended = () => { try { utter.onend?.(); } catch {} };

  // エラー時は即 WebSpeech ＋ 裏でプリウォーム（次回速く）
  a.onerror = () => {
    console.warn("[EA-TTS] <audio> single error → WebSpeech & prewarm");
    (window as any)._ea_originalSpeak?.(utter) ?? originalSpeak(utter);
    try { (window as any).prefetchTTS?.(text); } catch {}
  };

  console.log("[EA-TTS] VOICEVOX audio play start (single)");
  // 2) 1.2〜3s 待って playing が来なければ即 WebSpeech に切替（無音で待たせない）
  tryPlayWithTimeout(a, "single", computeTimeoutMs(text)).catch(() => {
    console.warn("[EA-TTS] play timeout → WebSpeech & prewarm");
    (window as any)._ea_originalSpeak?.(utter) ?? originalSpeak(utter);
    try { (window as any).prefetchTTS?.(text); } catch {}
  });

  return;
}

    // ---- 複数文：最初の1文を先に鳴らして、その後を順次再生
    const playOne = (idx: number) => {
      if (idx >= segments.length) { try { utter.onend?.(); } catch {}; return; }
      const part = segments[idx];

      // まずは <audio src> でストリーミング再生（最速）
      //const url = `${apiBase}/api/tts-voicevox?text=${encodeURIComponent(part)}`;
      const url = buildTtsUrlWithVoice(part);

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
