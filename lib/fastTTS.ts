// src/lib/fastTTS.ts
// ====== Auto＋即フォールバック（締切レース仕様）======

type FastTTSOptions = {
  speaker?: number;
  speedScale?: number;
  voiceName?: string;
  healthTimeoutMs?: number;   // /version の許容 (ms)
  synthTimeoutMs?: number;    // 合成API( /tts-cache ) の許容 (ms)
  startDeadlineMs?: number;   // 発声開始の締切 (ms) ← ここが2秒を守るキモ
};

// 環境に応じて API ベースを固定（ローカル→本番関数へ飛ばす）
const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_TTS_API_BASE) || "";
  console.info('[TTS] API_BASE =', API_BASE); // dev再起動後に1回だけ出ます
const DEFAULTS: Required<
  Pick<
    FastTTSOptions,
    "speaker" | "speedScale" | "healthTimeoutMs" | "synthTimeoutMs" | "startDeadlineMs"
  >
> = {
  speaker: 1,
  speedScale: 1.0,
  healthTimeoutMs: 500,
  synthTimeoutMs: 1200,
  startDeadlineMs: 2000, // ← 目標2秒なら 1700–1900ms あたりに
};

// ---- 汎用タイムアウトラッパ
function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number, reason = "timeout") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(reason), ms);
  return p(ctrl.signal).finally(() => clearTimeout(timer));
}

// ---- VOICEVOX ヘルスチェック
async function voicevoxHealthy(timeoutMs: number): Promise<boolean> {
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(`${API_BASE}/api/tts-voicevox/version`, { signal, cache: "no-store" }),
      timeoutMs
    );
    console.info("[TTS] /version", { ok: res.ok, status: res.status });
    return res.ok;
  } catch (e) {
    console.warn("[TTS] /version failed", e);
    return false;
  }
}

// ---- VOICEVOX 合成（サーバ側 LRU 付き1往復）
async function tryVoicevoxSynthesis(
  text: string,
  o: Required<Pick<FastTTSOptions, "speaker" | "speedScale" | "synthTimeoutMs">>
): Promise<HTMLAudioElement> {
  const body = JSON.stringify({ text, speaker: o.speaker, speedScale: o.speedScale });
  const res = await withTimeout(
    (signal) =>
      fetch(`${API_BASE}/api/tts-voicevox/tts-cache`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      }),
    o.synthTimeoutMs
  );
   console.info("[TTS] /tts-cache", { ok: res.ok, status: res.status, cache: res.headers.get("x-tts-cache") });
  if (!res.ok) throw new Error(`voicevox ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  // 停止処理（lib/tts.ts の stop用）で参照できるように保持
  try { (window as any).__VOICE_AUDIO__ = audio; } catch {}
  return audio;
}

// ---- Web Speech API
function speakWithWebSpeech(text: string, voiceName?: string, rate?: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const uttr = new SpeechSynthesisUtterance(text);
      if (voiceName) {
        const v = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
        if (v) uttr.voice = v;
      }
       // rate は 0.1〜10（ブラウザ依存）。あなたのUIは 0.5〜2.0 なのでそのまま使えます。
      if (typeof rate === "number" && Number.isFinite(rate)) {
        // 念のため安全にクリップ（iOS/Chrome ともに 0.5〜2.0 が扱いやすい）
        const r = Math.max(0.5, Math.min(2.0, rate));
        uttr.rate = r;
      }
      uttr.onend = () => resolve();
      uttr.onerror = () => resolve();
      window.speechSynthesis.speak(uttr);
    } catch {
      resolve();
    }
  });
}

// ---- メイン
export async function fastSpeak(text: string, opts: FastTTSOptions = {}) {
  const { speaker, speedScale, voiceName, healthTimeoutMs, synthTimeoutMs, startDeadlineMs } = {
    ...DEFAULTS,
    ...opts,
  };

  let started = false; // どちらで「開始」したか
  const startWithWebSpeech = async () => {
    if (started) return;
    started = true;
    console.info("[TTS] engine=webspeech (fallback or deadline)");
    await speakWithWebSpeech(text, voiceName, speedScale);
    // console.info('tts-engine: webspeech');
  };

  // ❶ 締切タイマー（締切までに開始できなければ Web Speech で必ず鳴らす）
  const deadline = new Promise<void>((resolve) => {
    const t = setTimeout(async () => {
      await startWithWebSpeech();
      resolve();
    }, startDeadlineMs);
    // どちらで先に開始してもよいよう、resolveはVOX側でも呼ばれる
  });

  // ❷ VOICEVOX 経路（ヘルス→合成→再生）
  const tryVoiceVox = (async () => {
    const healthy = await voicevoxHealthy(healthTimeoutMs);
    if (!healthy) throw new Error("vvx_unhealthy");
    const audio = await tryVoicevoxSynthesis(text, { speaker, speedScale, synthTimeoutMs });
    if (!started) {
      started = true;
      console.info("[TTS] engine=voicevox");
      try {
        await audio.play();
      } catch (err) {
        // iOSの自動再生制限などで失敗した場合は即フォールバック
        console.warn("[TTS] voicevox play() failed -> fallback to webspeech", err);
        started = false; // 失敗したので取り消す
        await startWithWebSpeech();
      }
    }
  })().catch(async () => {
    if (!started) await startWithWebSpeech();
  });

  // ❸ どちらかが先に「開始」すればOK
  await Promise.race([deadline, tryVoiceVox]);
}
