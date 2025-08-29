// src/ttsBridge.ts
// 目的：speechSynthesis.speak をグローバルに VOICEVOX 再生へブリッジ
// - 押下直後に <audio> 再生を開始（間に合わなければ即 Web Speech）
// - 文単位の分割再生（先頭文を最優先）
// - LRUメモリキャッシュ（同一文はゼロ秒再生）
// - cancel() 対応
// - 既存ボタン・画面側の変更は不要

import localForage from "localforage";

type AnyUtt = SpeechSynthesisUtterance & { onend?: (ev?: any) => void };

// ===== ユーティリティ =====
// 句読点対策版：読点「、」では分割しない。終止符のみ。
// 必要なら localStorage.eaTtsSplit = 'off' で分割そのものを無効化できます。
function splitJa(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];

  // 分割オフ指定（トラブル時の安全スイッチ）
  if (localStorage.getItem("eaTtsSplit") === "off") return [t];

  // 「。！？!?」の直後のみで分割。読点「、」では切らない。
  let segs = t.split(/(?<=[。！？!?])/);

  // 連続終止符で空要素が出ないようクリーニング
  segs = segs.map(s => s.trim()).filter(s => s.length > 0);

  // きょくたんに短い断片（2文字以下）は前の文に吸収（停止しにくくする）
  const merged: string[] = [];
  for (const s of segs) {
    if (merged.length && s.length <= 2) merged[merged.length - 1] += s;
    else merged.push(s);
  }
  return merged.length ? merged : [t];
}

// 長文は少しだけ待ち時間を増やす（最大3s）
function computeTimeoutMs(s: string): number {
  const n = Math.min(80, Math.max(0, s.length)); // 0〜80文字想定
  return Math.min(3000, 1200 + n * 30);          // 1.2s + 30ms/文字（上限3s）
}

function sanitizeHtmlToPlain(raw: string): string {
  return (raw || "")
    .replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/g, "$1（$2）")
    .replace(/<br\s*\/?>/gi, "。")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ===== 音声キャッシュ（メモリLRU：ObjectURL） =====
function currentVoiceKey(): string {
  const sp = localStorage.getItem("ttsDefaultSpeaker");
  const g  = localStorage.getItem("ttsGender");
  return sp && /^\d+$/.test(sp) ? `sp:${sp}` : g ? `g:${g}` : "default";
}
const mem = new Map<string, string>(); // key -> ObjectURL
const MEM_LIMIT = 20;
const keyOf = (text: string) => `${currentVoiceKey()}|${text}`;
function remember(k: string, url: string) {
  mem.set(k, url);
  if (mem.size > MEM_LIMIT) {
    const first = mem.keys().next().value as string | undefined;
    if (first) {
      const old = mem.get(first);
      if (old) URL.revokeObjectURL(old);
      mem.delete(first);
    }
  }
}

// ===== VOICE 設定の取得（localStorage/Forage のどちらでも） =====
async function getVoiceConfig(): Promise<{ speaker?: number; gender?: "male" | "female"; vk: string }> {
  const lsSpeaker = localStorage.getItem("ttsDefaultSpeaker");
  let speaker: number | undefined = /^\d+$/.test(lsSpeaker || "") ? Number(lsSpeaker) : undefined;
  if (speaker === undefined) {
    try {
      const lf = await localForage.getItem<number>("ttsDefaultSpeaker");
      if (typeof lf === "number") speaker = lf;
    } catch {}
  }
  const g = (localStorage.getItem("ttsGender") || (await localForage.getItem<string>("ttsGender")) || "") as string;
  const gender = g === "male" || g === "female" ? (g as "male" | "female") : undefined;
  const vk = encodeURIComponent(currentVoiceKey());
  return { speaker, gender, vk };
}

function buildTtsUrlWithVoice(text: string, cfg: { speaker?: number; gender?: "male" | "female"; vk: string }): string {
  const t = encodeURIComponent(text);
  if (cfg.speaker !== undefined) return `/api/tts-voicevox?text=${t}&speaker=${cfg.speaker}&vk=${cfg.vk}`;
  if (cfg.gender)               return `/api/tts-voicevox?text=${t}&gender=${cfg.gender}&vk=${cfg.vk}`;
  return `/api/tts-voicevox?text=${t}&vk=${cfg.vk}`;
}

// <audio> の再生を「タイムアウト監視」して、間に合わなければ失敗にする
function tryPlayWithTimeout(audio: HTMLAudioElement, label: string, ms = 1500): Promise<void> {
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

// ===== グローバルブリッジ本体 =====
(function enableGlobalTTSOverride() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const ss = window.speechSynthesis as SpeechSynthesis & { __ea_patched?: boolean };
  if (ss.__ea_patched) return;

  const originalSpeak  = ss.speak.bind(ss);
  const originalCancel = ss.cancel.bind(ss);

  let currentAudio: HTMLAudioElement | null = null;

  // 先読み（画面側から window.prefetchTTS('文面') で呼べる）
  (window as any).prefetchTTS = async (text: string) => {
    const plain = sanitizeHtmlToPlain(text);
    const key = keyOf(plain);
    if (!plain || mem.has(key)) return;
    const cfg = await getVoiceConfig();
    const url = buildTtsUrlWithVoice(plain, cfg);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!r.ok || !ct.startsWith("audio/")) return;
      const blob = await r.blob();
      const obj = URL.createObjectURL(blob);
      remember(key, obj);
    } catch {}
  };

  // speak の置き換え：押した瞬間に <audio> 再生を試行 → 間に合わなければ即 Web Speech
  // 文が複数ある時は、先頭文を最優先で鳴らしつつ後続を順次再生
  const bridgedSpeak = async (utter: AnyUtt) => {
    try {
      const text = sanitizeHtmlToPlain(utter?.text || "");
      if (!text) return;

      console.log("[EA-TTS] intercepted:", text);
      const cfg = await getVoiceConfig();
      const segments = splitJa(text);

      // 単文：キャッシュ → 取得 → <audio>、間に合わなければ Web Speech
      if (segments.length <= 1) {
        const t = segments[0] ?? text;
        const k = keyOf(t);
        const hit = mem.get(k);
        if (hit) {
          // キャッシュ即時
          currentAudio = new Audio(hit);
          currentAudio.onended = () => { try { utter.onend?.(); } catch {} };
          currentAudio.onerror = () => { console.warn("[EA-TTS] cached audio error → fallback"); mem.delete(k); originalSpeak(utter); };
          currentAudio.play().catch(err => { console.warn("[EA-TTS] cached play failed → fallback", err); originalSpeak(utter); });
          return;
        }

        // ストリーミング開始を最優先
        const url = buildTtsUrlWithVoice(t, cfg);
        currentAudio = new Audio();
        currentAudio.src = url;
        currentAudio.preload = "auto";
        currentAudio.onended = () => { try { utter.onend?.(); } catch {} };
        currentAudio.onerror = () => {
          console.warn("[EA-TTS] <audio> single error → WebSpeech & prewarm");
          originalSpeak(utter);
          try { (window as any).prefetchTTS?.(t); } catch {}
        };

        console.log("[EA-TTS] VOICEVOX audio play start (single)");
        tryPlayWithTimeout(currentAudio, "single", computeTimeoutMs(t)).catch(() => {
          // 1.2〜3s で playing が来ない → 即 Web Speech に切替＋裏でプリウォーム
          originalSpeak(utter);
          try { (window as any).prefetchTTS?.(t); } catch {}
        });
        return;
      }

      // 複数文：先頭文を最優先。後続は順次。
      const playOne = async (idx: number) => {
        if (idx >= segments.length) { try { utter.onend?.(); } catch {}; return; }
        const part = segments[idx];

        // キャッシュヒットなら即
        const pk = keyOf(part);
        const phit = mem.get(pk);
        if (phit) {
          const a = new Audio(phit);
          currentAudio = a;
          a.onended = () => playOne(idx + 1);
          a.onerror  = () => { mem.delete(pk); originalSpeak(new SpeechSynthesisUtterance(part)); };
          a.play().catch(() => a.onerror?.(new Event("error")));
          return;
        }

        const url = buildTtsUrlWithVoice(part, cfg);
        const a = new Audio();
        currentAudio = a;
        a.src = url;
        a.preload = "auto";
        a.onplaying = () => console.log(`[EA-TTS] VOICEVOX playing part ${idx+1}/${segments.length}`);
        a.onended   = () => playOne(idx + 1);
        a.onerror   = async () => {
          console.warn("[EA-TTS] <audio> part error → fallback Web Speech for this part");
          // その文だけ旧TTS、全体は継続
          originalSpeak(new SpeechSynthesisUtterance(part));
          // 次の文へ
          playOne(idx + 1);
        };

        console.log(`[EA-TTS] VOICEVOX audio play start (part ${idx+1})`);
        // 先頭文だけは「即読上げ保証」のためタイムアウト監視
        if (idx === 0) {
          tryPlayWithTimeout(a, `part ${idx+1}`, computeTimeoutMs(part)).catch(() => {
            originalSpeak(new SpeechSynthesisUtterance(part));
            // 後続は通常フローで続ける
            setTimeout(() => playOne(idx + 1), 0);
          });
        } else {
          a.play().catch(() => a.onerror?.(new Event("error")));
        }

        // 先読み：次文を裏で温める（失敗は無視）
        if (idx + 1 < segments.length) {
          (window as any).prefetchTTS?.(segments[idx + 1]);
        }
      };

      // 念のため退避
      (window as any)._ea_originalSpeak = originalSpeak;
      playOne(0);

    } catch (e) {
      console.warn("[EA-TTS] speak wrapper error → fallback", e);
      originalSpeak(utter);
    }
  };

  // 置き換え（直接 or Proxy フォールバック）
  try {
    // @ts-ignore
    ss.speak = bridgedSpeak;
    console.log("[EA-TTS] bridged via direct assignment");
    (window as any).EATTS = { speak: bridgedSpeak };
  } catch {
    try {
      const proxy = new Proxy(ss, {
        get(target, prop, receiver) {
          if (prop === "speak") return bridgedSpeak;
          return Reflect.get(target, prop, receiver);
        },
      });
      // @ts-ignore
      window.speechSynthesis = proxy;
      console.log("[EA-TTS] bridged via Proxy");
      (window as any).EATTS = { speak: bridgedSpeak };
    } catch {
      (window as any).EATTS = { speak: bridgedSpeak };
      console.warn("[EA-TTS] could not patch speechSynthesis; use window.EATTS.speak instead");
    }
  }

  // cancel() も上書き（現在再生を止める）
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
