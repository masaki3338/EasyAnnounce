// src/lib/fastTTS.ts
// ====== VOICEVOX 優先 + 期限内に開始できなければ Web Speech へ自動フォールバック ======

type FastTTSOptions = {
  speaker?: number;
  speedScale?: number;
  pitch?: number;            // Web Speech の抑揚（高さ）
  volume?: number;           // 音量
  voiceName?: string;
  healthTimeoutMs?: number;  // /version 許容 (ms)
  synthTimeoutMs?: number;   // /tts-cache 許容 (ms)
  startDeadlineMs?: number;  // 発声開始の締切 (ms)
};

// ===== デフォルト =====
const DEFAULTS: Required<
  Pick<
    FastTTSOptions,
    "speaker" | "speedScale" | "healthTimeoutMs" | "synthTimeoutMs" | "startDeadlineMs"
  >
> = {
  speaker: 1,
  speedScale: 1.0,
  healthTimeoutMs: 3000,
  synthTimeoutMs: 7000,
  startDeadlineMs: 3500,
};

// ===== ベースURL自動解決（dev/prod/設定ミスでも“生きてる”APIを見つけて固定） =====
const PROD_BASE = "https://easy-announce.vercel.app"; // ← あなたの Vercel ドメインに合わせてOK
const ENV_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_TTS_API_BASE) || "";

let __API_BASE_CACHED: string | null = null;

function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number, reason = "timeout") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(reason), ms);
  return p(ctrl.signal).finally(() => clearTimeout(timer));
}

// /version を叩いて生存判定
async function pingVersion(base: string, timeoutMs: number): Promise<boolean> {
  const url = `${base}/api/tts-voicevox/version`;
  const res = await withTimeout(
    (signal) =>
      fetch(url, {
        signal,
        cache: "no-store",
        method: "GET",
        credentials: "omit",
        mode: "cors",
      }),
    timeoutMs
  );
  return res.ok;
}

async function resolveApiBase(timeoutMs: number): Promise<string> {
  if (__API_BASE_CACHED) return __API_BASE_CACHED;

  try {
    const saved = localStorage.getItem("tts:voicevox:apiBase");
    if (saved) {
      __API_BASE_CACHED = saved;
      console.info("[TTS] API_BASE (cached) =", saved || "(same-origin)");
      return saved;
    }
  } catch {}

  const candidates = [
    // .env が localhost 等なら無視
    ENV_BASE && !/localhost|127\.0\.0\.1|^\[?::1\]?/i.test(ENV_BASE) ? ENV_BASE : "",
    "",        // 同一オリジン（dev は vite proxy / prod は同一ドメイン）
    PROD_BASE, // 最後の砦：本番直叩き
  ].filter(Boolean) as string[];

  for (const base of candidates) {
    try {
      const ok = await pingVersion(base, timeoutMs);
      if (ok) {
        __API_BASE_CACHED = base;
        try { localStorage.setItem("tts:voicevox:apiBase", base); } catch {}
        console.info("[TTS] API_BASE resolved =", base || "(same-origin)");
        return base;
      }
    } catch {
      // 次の候補へ
    }
  }

  console.warn("[TTS] API_BASE could not be resolved; fallback to same-origin");
  __API_BASE_CACHED = "";
  return "";
}

// ---- VOICEVOX ヘルスチェック（ベースURLを解決してから実行）
async function voicevoxHealthy(timeoutMs: number): Promise<{ ok: boolean; base: string }> {
  try {
    const base = await resolveApiBase(timeoutMs);
    const url = `${base}/api/tts-voicevox/version`;
    const res = await withTimeout(
      (signal) =>
        fetch(url, {
          signal,
          cache: "no-store",
          method: "GET",
          credentials: "omit",
          mode: "cors",
        }),
      timeoutMs
    );
    console.info("[TTS] /version", { base: base || "(same-origin)", ok: res.ok, status: res.status });
    return { ok: res.ok, base };
  } catch (e) {
    console.warn("[TTS] /version failed", e);
    return { ok: false, base: __API_BASE_CACHED || "" };
  }
}

// ---- VOICEVOX 合成（JSON → form → GET の順で自動トライ／API差異を吸収）
async function tryVoicevoxSynthesis(
  base: string,
  text: string,
  o: Required<Pick<FastTTSOptions, "speaker" | "speedScale" | "synthTimeoutMs">>
): Promise<HTMLAudioElement> {
  const endpoint = `${base}/api/tts-voicevox/tts-cache`;
  const q = new URLSearchParams({
    text,
    speaker: String(o.speaker),
    speedScale: String(o.speedScale),
  });

  const attempts: Array<() => Promise<Response>> = [
    // ① JSON
    () =>
      withTimeout(
        (signal) =>
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, speaker: o.speaker, speedScale: o.speedScale }),
            signal,
          }),
        o.synthTimeoutMs
      ),
    // ② x-www-form-urlencoded
    () =>
      withTimeout(
        (signal) =>
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: q,
            signal,
          }),
        o.synthTimeoutMs
      ),
    // ③ GET クエリ
    () =>
      withTimeout(
        (signal) => fetch(`${endpoint}?${q}`, { signal, cache: "no-store" }),
        o.synthTimeoutMs
      ),
  ];

  let lastErr: any = null;
  for (const req of attempts) {
    try {
      const res = await req();
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn("[TTS] /tts-cache not ok", { base: base || "(same-origin)", status: res.status, body });
        if (res.status >= 500) throw new Error(`voicevox ${res.status}: ${body}`);
        lastErr = new Error(`voicevox ${res.status}: ${body}`);
        continue; // 次の方式へ
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        lastErr = new Error("empty audio blob");
        continue;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 1.0;
      audio.onended = () => URL.revokeObjectURL(url);
      try { (window as any).__VOICE_AUDIO__ = audio; } catch {}
      console.info("[TTS] /tts-cache ok", { base: base || "(same-origin)" });
      return audio;
    } catch (e) {
      console.warn("[TTS] /tts-cache try failed", e);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("voicevox synthesis failed");
}

// ===================== 読み上げテキスト前処理 =====================
// 敬称があるときだけ・2文字以上×2ブロックに限定して区切る（安全版）
function tuneJaNameProsodySafe(text: string): string {
  const honorific = /(さん|くん|ちゃん|選手|監督|コーチ|先生)\b/;
  if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(text) || !honorific.test(text)) return text;

  let s = text;

  // 1) 漢字/カナの姓名 + 敬称（姓2字以上・名2字以上）
  s = s.replace(
    /([一-龥々〆ヵヶァ-ヶー]{2,})\s*([一-龥々〆ヵヶァ-ヶー]{2,})(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1、$2"
  );

  // 2) かな姓名 + 敬称（姓3文字以上・名2文字以上）
  s = s.replace(
    /([ぁ-んゟァ-ヶー]{3,})\s*([ぁ-んゟァ-ヶー]{2,})(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1、$2"
  );

  // 3) 敬称の直前にノーブレークスペースで軽いポーズ
  s = s.replace(/([^\s、・])(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g, "$1\u00A0");

  return s;
}

// 両エンジン共通の最終前処理（姓名の半角→中点。“・”の方が確実に短い間になる）
function preprocessForTTS(raw: string): string {
  let s = raw ?? "";
  s = tuneJaNameProsodySafe(s);
  // 「姓 名（半角）」→「姓・名」（敬称が続くときに限定）
  s = s.replace(
    /([ぁ-んァ-ヶｧ-ﾝﾞﾟ一-龥]{1,6})\s+([ぁ-んァ-ヶｧ-ﾝﾞﾟ一-龥]{1,6})(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1・$2"
  );
  // 連続スペースを抑制
  s = s.replace(/[ \t\u3000]{2,}/g, " ");
  return s;
}

// ---- Web Speech API
function speakWithWebSpeech(
  text: string,
  voiceName?: string,
  rate?: number,
  pitch?: number,
  volume?: number
): Promise<void> {
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      try { window.speechSynthesis.resume(); } catch {}

      const chunks = text
        .split(/([。！？!?]\s*|\n+)/)
        .reduce<string[]>((acc, cur, i, arr) => {
          if (i % 2 === 0) acc.push(cur + (arr[i + 1] || ""));
          return acc;
        }, [])
        .map((s) => s.trim())
        .filter(Boolean);

      const voices = window.speechSynthesis.getVoices();
      const selected = voiceName ? voices.find((v) => v.name === voiceName) : undefined;
      const r = typeof rate === "number" && isFinite(rate) ? Math.max(0.5, Math.min(2.0, rate)) : 1.0;
      const p = typeof pitch === "number" && isFinite(pitch) ? Math.max(0.0, Math.min(2.0, pitch)) : 1.2;
      const v = typeof volume === "number" && isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1.0;

      const playNext = (i: number) => {
        if (i >= chunks.length) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(chunks[i]);
        u.lang = "ja-JP";
        if (selected) u.voice = selected;
        u.rate = r;
        u.pitch = p;
        u.volume = v;
        u.onend = () => setTimeout(() => playNext(i + 1), 60);
        u.onerror = () => setTimeout(() => playNext(i + 1), 0);
        window.speechSynthesis.speak(u);
      };
      playNext(0);
    } catch {
      resolve();
    }
  });
}

// ---- モバイル用アンロック（ユーザー操作直後に呼ぶと効果大）
let __webSpeechUnlocked = false;
function unlockWebSpeech(voiceName?: string) {
  if (__webSpeechUnlocked) return;
  try {
    const u = new SpeechSynthesisUtterance(" "); // 1スペースの無音
    u.lang = "ja-JP";
    u.volume = 0;
    u.rate = 1;
    u.pitch = 1;
    if (voiceName) {
      const v = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
      if (v) u.voice = v;
    }
    u.onend = () => { __webSpeechUnlocked = true; };
    try { window.speechSynthesis.resume(); } catch {}
    window.speechSynthesis.speak(u);
  } catch {}
}

// ---- メイン（VOICEVOX優先・締切で Web Speech に必ず落ちる）
export async function fastSpeak(text: string, opts: FastTTSOptions = {}) {
  const {
    speaker, speedScale, pitch, volume, voiceName,
    healthTimeoutMs, synthTimeoutMs, startDeadlineMs,
  } = { ...DEFAULTS, ...opts };

  // 読み上げテキスト前処理（姓名の“間”など）
  const tunedText = preprocessForTTS(text);

  // タップ直後にアンロック（await しない）
  try { unlockWebSpeech(voiceName); } catch {}

  let started = false;

  const startWithWebSpeech = async () => {
    if (started) return;
    started = true;
    console.info("[TTS] engine=webspeech (fallback or deadline)");
    await speakWithWebSpeech(tunedText, voiceName, speedScale, pitch, volume);
  };

  // ❶ 締切タイマー（締切までに開始できなければ Web Speech）
  const deadline = new Promise<void>((resolve) => {
    setTimeout(async () => {
      await startWithWebSpeech();
      resolve();
    }, startDeadlineMs);
  });

  // ❷ VOICEVOX 経路（ヘルス→合成→再生）
  const tryVoiceVox = (async () => {
    const { ok, base } = await voicevoxHealthy(healthTimeoutMs);
    if (!ok) throw new Error("vvx_unhealthy");

    const audio = await tryVoicevoxSynthesis(base, tunedText, { speaker, speedScale, synthTimeoutMs });

    if (!started) {
      started = true;
      console.info("[TTS] engine=voicevox", { base: base || "(same-origin)" });
      try {
        await audio.play();
      } catch (err) {
        // iOS の自動再生制限などで失敗したら即フォールバック
        console.warn("[TTS] voicevox play() failed -> fallback to webspeech", err);
        started = false;
        await startWithWebSpeech();
      }
    }
  })().catch(async () => {
    if (!started) await startWithWebSpeech();
  });

  // ❸ どちらかが先に「開始」すればOK
  await Promise.race([deadline, tryVoiceVox]);
}
