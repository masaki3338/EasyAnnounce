// src/lib/fastTTS.ts
// ====== Auto＋即フォールバック（締切レース仕様）======

type FastTTSOptions = {
  speaker?: number;
  speedScale?: number;
  pitch?: number;          // ← 追加: Web Speech の抑揚っぽさ（高さ）
  volume?: number;         // ← 追加: 音量
  voiceName?: string;
  healthTimeoutMs?: number;   // /version の許容 (ms)
  synthTimeoutMs?: number;    // 合成API( /tts-cache ) の許容 (ms)
  startDeadlineMs?: number;   // 発声開始の締切 (ms) ← ここが2秒を守るキモ
};

// 環境に応じて API ベースを固定（ローカル→本番関数へ飛ばす）
const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_TTS_API_BASE)
  || "https://easy-announce.vercel.app"; // 例: https://easy-announce.vercel.app

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
  audio.volume = 1.0; // ここでMAX
  audio.onended = () => URL.revokeObjectURL(url);
  // 停止処理（lib/tts.ts の stop用）で参照できるように保持
  try { (window as any).__VOICE_AUDIO__ = audio; } catch {}
  return audio;
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
     // ★ 日本語の姓名に区切りを加えて“ね”が不自然に高くなるのを防ぐ
     const tuned = tuneJaNameProsodySafe(text);

     // 文・句で分割（。、！、？、改行あたりで）
     const chunks = tuned
        .split(/([。！？!?]\s*|\n+)/)
        .reduce<string[]>((acc, cur, i, arr) => {
          if (i % 2 === 0) acc.push(cur + (arr[i + 1] || ""));
          return acc;
        }, [])
        .map(s => s.trim())
        .filter(Boolean);

      const voices = window.speechSynthesis.getVoices();
      const selected = voiceName ? voices.find(v => v.name === voiceName) : undefined;
      const r = typeof rate === "number" && isFinite(rate) ? Math.max(0.5, Math.min(2.0, rate)) : 1.0;
      const p = typeof pitch === "number" && isFinite(pitch) ? Math.max(0.0, Math.min(2.0, pitch)) : 1.2;
      // 音量は常に最大に（ユーザ設定があっても MAX にしたいなら固定 1.0）
      const v = 1.0;

      // 句ごとに speak。句頭は少しだけ間を置くと“抑揚”の印象が増す
      const playNext = (i: number) => {
        if (i >= chunks.length) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(chunks[i]);
        u.lang = "ja-JP";
        if (selected) u.voice = selected;
        u.rate = r;
        u.pitch = p;
        u.volume = 1.0;
        u.onend = () => setTimeout(() => playNext(i + 1), 60); // 60msポーズ
        u.onerror = () => setTimeout(() => playNext(i + 1), 0);
        window.speechSynthesis.speak(u);
      };
      playNext(0);
    } catch {
      resolve();
    }
  });
}

// ✅ 安全版：敬称があるときだけ・2文字以上×2ブロックに限定して区切る
function tuneJaNameProsodySafe(text: string): string {
  // 日本語が含まれない・敬称がない → 触らない
  const honorific = /(さん|くん|ちゃん|選手|監督|コーチ|先生)\b/;
  if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(text) || !honorific.test(text)) return text;

  let s = text;

  // 1) 漢字姓名 + 敬称（姓2字以上・名2字以上）: 例「米山太郎くん」→「米山、太郎 くん」
  s = s.replace(
    /([一-龥々〆ヵヶァ-ヶー]{2,})\s*([一-龥々〆ヵヶァ-ヶー]{2,})(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1、$2"
  );

  // 2) かな姓名 + 敬称（姓3文字以上・名2文字以上）: 例「よねやまたろうくん」→「よねやま、たろう くん」
  //   ※ かな1語や短い名は触らない → 「よねやま」「よねやまあおと」は変更なし
  s = s.replace(
    /([ぁ-んゟァ-ヶー]{3,})\s*([ぁ-んゟァ-ヶー]{2,})(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1、$2"
  );

  // 3) 敬称の直前にはノーブレークスペースで軽いポーズ
  s = s.replace(
    /([^\s、・])(?=\s*(さん|くん|ちゃん|選手|監督|コーチ|先生)\b)/g,
    "$1\u00A0"
  );

  return s;
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
      const v = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
      if (v) u.voice = v;
    }
    u.onend = () => { __webSpeechUnlocked = true; };
    try { window.speechSynthesis.resume(); } catch {}
    window.speechSynthesis.speak(u);
  } catch {}
}

// ---- メイン
export async function fastSpeak(text: string, opts: FastTTSOptions = {}) {
  const { speaker, speedScale, pitch, volume, voiceName, healthTimeoutMs, synthTimeoutMs, startDeadlineMs } = { ...DEFAULTS, ...opts };

  // ★ タップ直後にアンロック（awaitしない）
  try { unlockWebSpeech(voiceName); } catch {}

  let started = false; // どちらで「開始」したか
  const startWithWebSpeech = async () => {
    if (started) return;
    started = true;
    console.info("[TTS] engine=webspeech (fallback or deadline)");
    await speakWithWebSpeech(text, voiceName, speedScale, pitch, volume);
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
