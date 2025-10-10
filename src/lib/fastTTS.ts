// src/lib/fastTTS.ts
// ====== VOICEVOX 優先（即合成）+ 締切で Web Speech にフォールバック（レイトハンドオフ対応）======

// ---- 初回ウォームアップ（/version）
let __VOX_WARMED = false;
async function warmupVoiceVoxOnce(base: string): Promise<void> {
  if (__VOX_WARMED) return;
  try {
    const url = `${base}/api/tts-voicevox/version`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort("warmup-timeout"), 5000);
    await fetch(url, { signal: ctrl.signal, cache: "no-store" }).catch(() => {});
    clearTimeout(t);
  } finally {
    __VOX_WARMED = true;
  }
}

/** どこからでも同じ VOICEVOX API BASE を使うためのユーティリティ */
export function resolveVoxBase(): string {
  // Vite dev は Vercel を直叩き
  if (typeof window !== "undefined" && /(?:localhost|127\.0\.0\.1):5173/.test(window.location.host)) {
    return PROD_BASE;
  }
  // 環境変数があれば優先（ただし localhost は除外）
  const env = ENV_BASE?.trim();
  if (env && !/localhost|127\.0\.0\.1|^\[?::1\]?/i.test(env)) return env;
  // 同一オリジン（本番）を相対で
  return "";
}

type FastTTSOptions = {
  speaker?: number;
  speedScale?: number;
  pitch?: number;            // Web Speech の抑揚（高さ）
  volume?: number;           // 音量
  voiceName?: string;
  synthTimeoutMs?: number;   // /tts-cache の許容 (ms)
  startDeadlineMs?: number;  // 発声開始の締切 (ms)
};

// ===== デフォルト =====
const DEFAULTS: Required<Pick<FastTTSOptions,
  "speaker" | "speedScale" | "synthTimeoutMs" | "startDeadlineMs">> = {
  speaker: 1,
  speedScale: 1.0,
  synthTimeoutMs: 20000,   // Vercel コールド対策（サーバ側での生成余裕）
  startDeadlineMs: 4500,   // 体感を早める。実際の締切は下で 6200ms 以上に補正
};

const PROD_BASE = "https://easy-announce.vercel.app";
const ENV_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_TTS_API_BASE) || "";

let __API_BASE_CACHED: string | null = null;

// ---- 汎用タイムアウト
function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number, reason = "timeout") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(reason), ms);
  return p(ctrl.signal).finally(() => clearTimeout(timer));
}

// ===================== 読み上げテキスト前処理 =====================
function tuneJaNameProsodySafe(text: string): string {
  const honorific = /(さん|くん|ちゃん|選手|監督|コーチ|先生)\b/;
  if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(text) || !honorific.test(text)) return text;
  let s = text;
  // 漢字/カナの姓名 + 敬称（姓2字以上・名2字以上）
  s = s.replace(
    /([一-龥々〆ヵヶァ-ヶー]{2,})\s*([一-龥々〆ヵヶァ-ヶー]{2,})(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1、$2"
  );
  // かな姓名 + 敬称（姓3文字以上・名2文字以上）
  s = s.replace(
    /([ぁ-んゟァ-ヶー]{3,})\s*([ぁ-んゟァ-ヶー]{2,})(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1、$2"
  );
  // 敬称の直前に NBSP
  s = s.replace(/([^\s、・])(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g, "$1\u00A0");
  return s;
}

function preprocessForTTS(raw: string): string {
  let s = raw ?? "";
  s = tuneJaNameProsodySafe(s);
  // 「姓 名（半角）」→「姓・名」（敬称が続くときに限定）
  s = s.replace(
    /([ぁ-んァ-ヶｧ-ﾝﾞﾟ一-龥]{1,6})\s+([ぁ-んァ-ヶｧ-ﾝﾞﾟ一-龥]{1,6})(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1・$2"
  );
  // 連続スペース抑制
  s = s.replace(/[ \t\u3000]{2,}/g, " ");
  return s;
}

// ---- VOICEVOX 合成（プロキシ専用に修正）----
async function tryVoicevoxSynthesisMulti(
  text: string,
  o: Required<Pick<FastTTSOptions, "speaker" | "speedScale" | "synthTimeoutMs">>
): Promise<{ audio: HTMLAudioElement; base: string }> {

  // ★ /api を必ず通す（同一オリジン or Vercel のみ）
  const bases: string[] = (() => {
    const primary = resolveVoxBase(); // dev→PROD_BASE, 本番→""(same-origin) or ENV
    const envOk = ENV_BASE && !/localhost|127\.0\.0\.1|^\[?::1\]?/i.test(ENV_BASE) ? ENV_BASE : "";
    const list: string[] = [];

    // dev 環境なら Vercel を最優先、本番なら same-origin を先頭に
    if (typeof window !== "undefined" && /(?:localhost|127\.0\.0\.1):5173/.test(window.location.host)) {
      list.push(PROD_BASE);
    } else {
      list.push(""); // same-origin proxy
    }

    if (__API_BASE_CACHED !== null) list.push(__API_BASE_CACHED);
    if (envOk) list.push(envOk);
    list.push(PROD_BASE); // 念のため最後に Vercel

    // 重複除去（same-origin の空文字はそのまま許容）
    return Array.from(new Set(list));
  })();

  // サーバの 20s に合わせて、クライアントは最大 20s
  const perAttemptMs = Math.min(Math.max(o.synthTimeoutMs ?? 8000, 1500), 20000);

  // /api/tts-voicevox/tts-cache を叩く
  const attemptProxy = async (base: string): Promise<Blob> => {
    const endpoint = `${base}/api/tts-voicevox/tts-cache`;
    const payload = JSON.stringify({ text, speaker: o.speaker, speedScale: o.speedScale });
    console.info("[TTS] /tts-cache POST", { endpoint, timeoutMs: perAttemptMs });

    const res = await withTimeout(
      (signal) => fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal,
        cache: "no-store",
      }),
      perAttemptMs
    );

    if (res.status >= 400 && res.status < 500) {
      const body = await res.text().catch(() => "");
      console.warn("[TTS] /tts-cache client error", { base: base || "(same-origin)", status: res.status, body });
      throw Object.assign(new Error("vvx_client_error"), { code: "VVX_CLIENT", status: res.status, body });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[TTS] /tts-cache server error", { base: base || "(same-origin)", status: res.status, body });
      throw new Error(`voicevox ${res.status}: ${body}`);
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error("empty audio blob");
    return blob;
  };

  let lastErr: any = null;

  for (const base of bases) {
    try {
      const blob = await attemptProxy(base);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 1.0;
      audio.onended = () => URL.revokeObjectURL(url);
      try { (window as any).__VOICE_AUDIO__ = audio; } catch {}

      // ★ プロキシのベースだけキャッシュ（onrender 直はそもそも使わない）
      __API_BASE_CACHED = base;

      console.info("[TTS] voicevox ok", { via: "proxy", base: base || "(same-origin)" });
      return { audio, base };
    } catch (e) {
      console.warn("[TTS] voicevox attempt failed", { base: base || "(same-origin)", err: e });
      lastErr = e;
      continue;
    }
  }

  throw lastErr ?? new Error("voicevox synthesis failed");
}


// ---- Web Speech
function speakWithWebSpeech(
  text: string, voiceName?: string, rate?: number, pitch?: number, volume?: number
): Promise<void> {
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      try { window.speechSynthesis.resume(); } catch {}
      const chunks = text
        .split(/([。！？!?]\s*|\n+)/)
        .reduce<string[]>((acc, cur, i, arr) => { if (i % 2 === 0) acc.push(cur + (arr[i + 1] || "")); return acc; }, [])
        .map(s => s.trim()).filter(Boolean);
      const voices = window.speechSynthesis.getVoices();
      const selected = voiceName ? voices.find(v => v.name === voiceName) : undefined;
      const r = typeof rate === "number" && isFinite(rate) ? Math.max(0.5, Math.min(2.0, rate)) : 1.0;
      const p = typeof pitch === "number" && isFinite(pitch) ? Math.max(0.0, Math.min(2.0, pitch)) : 1.2;
      const v = typeof volume === "number" && isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1.0;
      const playNext = (i: number) => {
        if (i >= chunks.length) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(chunks[i]);
        u.lang = "ja-JP";
        if (selected) u.voice = selected;
        u.rate = r; u.pitch = p; u.volume = v;
        u.onend = () => setTimeout(() => playNext(i + 1), 60);
        u.onerror = () => setTimeout(() => playNext(i + 1), 0);
        window.speechSynthesis.speak(u);
      };
      playNext(0);
    } catch { resolve(); }
  });
}

// ---- モバイル用アンロック
let __webSpeechUnlocked = false;
function unlockWebSpeech(voiceName?: string) {
  if (__webSpeechUnlocked) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.lang = "ja-JP"; u.volume = 0; u.rate = 1; u.pitch = 1;
    if (voiceName) {
      const v = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
      if (v) u.voice = v;
    }
    u.onend = () => { __webSpeechUnlocked = true; };
    try { window.speechSynthesis.resume(); } catch {}
    window.speechSynthesis.speak(u);
  } catch {}
}

// ---- メイン（レイトハンドオフ：あとから VOX が来たら乗り換え）
export async function fastSpeak(text: string, opts: FastTTSOptions = {}) {
  const { speaker, speedScale, pitch, volume, voiceName, synthTimeoutMs, startDeadlineMs } =
    { ...DEFAULTS, ...opts };

  const tunedText = preprocessForTTS(text);
  if (!tunedText.trim()) return;
  try { unlockWebSpeech(voiceName); } catch {}
  try { warmupVoiceVoxOnce(resolveVoxBase()); } catch {}

  let finished = false;
  let webSpeechPlaying = false;
  let webStartRequested = false;
  let currentAudio: HTMLAudioElement | null = null;

  const startWithWebSpeech = async () => {
    if (finished || webStartRequested || webSpeechPlaying) return;
    webStartRequested = true;
    webSpeechPlaying = true;
    console.info("[TTS] engine=webspeech (fallback or deadline)");
    await speakWithWebSpeech(tunedText, voiceName, speedScale, pitch, volume);
    webSpeechPlaying = false;
    if (!currentAudio) finished = true;
  };

  // ★ 早めの予備フォールバック（例: 1200ms）
  const earlyFallbackMs = Math.min(startDeadlineMs, 1200);
  const earlyTimer = setTimeout(() => { void startWithWebSpeech(); }, earlyFallbackMs);

  // 従来の締切（必要ならさらに遅い時点でもう一度保険）
  const deadline = new Promise<void>((resolve) => {
    const deadlineMs = startDeadlineMs; // ← 6200ms の下限は撤廃
    setTimeout(async () => { await startWithWebSpeech(); resolve(); }, deadlineMs);
  });

  const tryVoiceVox = (async () => {
    try {
      const { audio } = await tryVoicevoxSynthesisMulti(tunedText, { speaker, speedScale, synthTimeoutMs });
      currentAudio = audio;

      // Web Speech 再生中なら止める（レイトハンドオフ）
      if (webSpeechPlaying) { try { window.speechSynthesis.cancel(); } catch {} webSpeechPlaying = false; }

      if (!finished) {
        console.info("[TTS] engine=voicevox");
        try { await audio.play(); } 
        catch (err) {
          console.warn("[TTS] voicevox play() failed -> keep webspeech if any", err);
          if (!webSpeechPlaying) void startWithWebSpeech();
        } finally {
          finished = true;
        }
      }
    } catch (e: any) {
      console.warn("[TTS] voicevox path failed", e);
      // ★ エラーならその場で即 Web Speech に切替（待たない）
      void startWithWebSpeech();
      finished = true;
    } finally {
      clearTimeout(earlyTimer);
    }
  })();

  await Promise.race([deadline, tryVoiceVox]);
}

