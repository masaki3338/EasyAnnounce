// src/lib/tts.ts  — Web Speech API 専用版（VOICEVOX非依存）

type SpeakOptions = {
  progressive?: boolean; // 互換用: 未使用
  cache?: boolean;       // 互換用: 未使用
  speaker?: number;      // 互換用: 未使用
  speedScale?: number;   // 読み上げ速度 (0.5〜2.0推奨)
  voiceName?: string;    // 音声名（任意）
  pitch?: number;        // 0〜2
  volume?: number;       // 0〜1
};

let __wsUnlocked = false;
let sessionCounter = 0; // 停止でインクリメントして旧セッションを無効化
let speaking = false;

let piperAudioContext: AudioContext | null = null;
let currentPiperSource: AudioBufferSourceNode | null = null;
let currentPiperGain: GainNode | null = null;
let piperInitPromise: Promise<any> | null = null;

const PIPER_MODEL = "ayousanz/piper-plus-tsukuyomi-chan";

async function getPiperPlus() {
  if (!piperInitPromise) {
    piperInitPromise = (async () => {
      // 動的 import にして通常の Web Speech 利用時は読み込まない
      const [{ PiperPlus }, ort] = await Promise.all([
        import("piper-plus"),
        import("onnxruntime-web/wasm"),
      ]);

      return PiperPlus.initialize({
        model: PIPER_MODEL,
        ort,
        onProgress: ({ stage, progress, message }: any) => {
          try {
            const pct = Math.round(Number(progress || 0) * 100);
            console.info(`[Piper-Plus] ${stage} ${pct}% ${message || ""}`);
          } catch {}
        },
      });
    })().catch((err) => {
      // 初期化失敗後に再試行できるようにする
      piperInitPromise = null;
      throw err;
    });
  }

  return piperInitPromise;
}

function getPiperAudioContext(): AudioContext {
  if (!piperAudioContext || piperAudioContext.state === "closed") {
    const AudioCtx =
      window.AudioContext ||
      (window as any).webkitAudioContext;

    if (!AudioCtx) {
      throw new Error("Web Audio API is not supported on this device.");
    }

    piperAudioContext = new AudioCtx();
  }

  return piperAudioContext;
}

async function unlockPiperAudio(): Promise<AudioContext> {
  const ctx = getPiperAudioContext();

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (err) {
      console.warn("[Piper-Plus] AudioContext resume failed", err);
    }
  }

  console.info("[Piper-Plus] AudioContext state:", ctx.state);
  return ctx;
}

function stopPiperAudio() {
  if (currentPiperSource) {
    try {
      currentPiperSource.onended = null;
      currentPiperSource.stop();
      currentPiperSource.disconnect();
    } catch {}
    currentPiperSource = null;
  }

  if (currentPiperGain) {
    try {
      currentPiperGain.disconnect();
    } catch {}
    currentPiperGain = null;
  }
}

async function speakWithPiper(
  text: string,
  rate: number,
  volume: number,
  mySession: number,
  audioContext?: AudioContext
) {
  stopPiperAudio();
  hardCancelSpeechSynthesis(false);

  speaking = true;
  const synthStart = performance.now();

  // 重要: ボタン押下直後に作成/再開した AudioContext を使う。
  const ctx = audioContext || await unlockPiperAudio();

  console.info("[Piper-Plus] synthesize start:", text);

  const piper = await getPiperPlus();
  if (mySession !== sessionCounter) {
    speaking = false;
    return;
  }

  console.info("[Piper-Plus] model ready");

  // Piper-Plus は lengthScale が小さいほど速い。
  const lengthScale = clamp(1 / Math.max(rate, 0.01), 0.5, 2.0);

  const generated = await piper.synthesize(text, {
    language: "ja",
    noiseScale: 0.4,
    lengthScale,
    noiseW: 0.5,
  });

  const synthMs = Math.round(performance.now() - synthStart);

  console.info("[Piper-Plus] synthesize complete", {
    synthMs,
    samples: generated?.samples?.length ?? 0,
    sampleRate: generated?.sampleRate,
    duration: generated?.duration,
  });

  if (mySession !== sessionCounter) {
    speaking = false;
    return;
  }

  if (!generated?.samples || generated.samples.length === 0) {
    speaking = false;
    throw new Error("Piper-Plus generated zero audio samples.");
  }

  const sampleRate = Number(generated.sampleRate || 22050);
  const samples: Float32Array = generated.samples;

  // AudioResult のPCMをWeb Audio APIへ直接渡して再生する
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();

  gain.gain.value = clamp(volume, 0, 1);
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(ctx.destination);

  currentPiperSource = source;
  currentPiperGain = gain;

  await new Promise<void>((resolve, reject) => {
    source.onended = () => {
      if (currentPiperSource === source) currentPiperSource = null;
      if (currentPiperGain === gain) currentPiperGain = null;

      try {
        source.disconnect();
        gain.disconnect();
      } catch {}

      speaking = false;
      console.info("[Piper-Plus] playback ended");
      resolve();
    };

    try {
      console.info("[Piper-Plus] playback start", {
        contextState: ctx.state,
        volume: gain.gain.value,
      });
      source.start(0);
    } catch (err) {
      speaking = false;
      try {
        source.disconnect();
        gain.disconnect();
      } catch {}
      reject(err);
    }
  });
}

// ---- speech normalize ------------------------------------------------------
const ORDER_KANA: Record<string, string> = {
  "1": "いち",
  "2": "に",
  "3": "さん",
  "4": "よ",
  "5": "ご",
  "6": "ろく",
  "7": "なな",
  "8": "はち",
  "9": "きゅう",
};

function toHalfWidthDigits(s: string) {
  return s.replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xfee0));
}

/**
 * 読み上げ直前の文章を野球アナウンス向けに正規化する
 * - 例: "4番" / "４番" / "4 番" → "よばん"
 */
function normalizeSpeechText(input: string): string {
  let t = String(input);

  // 「○番」を「(かな)ばん」に置換（番が付くものだけ）
  t = t.replace(/[0-9０-９]\s*番/g, (m) => {
    const d = toHalfWidthDigits(m.replace(/\s/g, "").replace("番", ""));
    const kana = ORDER_KANA[d];
    return kana ? `${kana}ばん` : m;
  });

  // 単独の「0」を「ゼロ」に
  t = t.replace(/(^|[^0-9０-９])0(?![0-9０-９])/g, "$1ゼロ");

  // 第○試合 の読みを補正
  t = t.replace(/第1試合/g, "だいいちしあい");
  t = t.replace(/第2試合/g, "だいにしあい");
  t = t.replace(/第3試合/g, "だいさんしあい");
  t = t.replace(/第4試合/g, "だいよんしあい");
  t = t.replace(/第5試合/g, "だいごしあい");

  // メンバー表 の読みを補正
  t = t.replace(/メンバー表/g, "めんばーひょう");

  t = t.replace(/先攻/g, "せんこう");
  t = t.replace(/後攻/g, "こうこう");
  t = t.replace(/四氏/g, "よんし");
  t = t.replace(/行方/g, "ゆくえ");

  return t;
}

// ---- utilities -------------------------------------------------------------
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// 長文だけ少し速くする（全音声共通で効かせやすい控えめ設定）
function getAutoAdjustedRate(text: string, baseRate: number): number {
  const normalized = String(text)
    .replace(/\s/g, "")
    .replace(/[、。！？!?]/g, "");

  const len = normalized.length;
  let adjusted = baseRate;

  // 控えめに上げる
  if (len >= 100) {
    adjusted = baseRate + 0.08;
  } else if (len >= 60) {
    adjusted = baseRate + 0.04;
  }

  return clamp(adjusted, 0.5, 2.0);
}

// 既存の hardCancelSpeechSynthesis を差し替え
function hardCancelSpeechSynthesis(deferred = false) {
  try {
    window.speechSynthesis.cancel();
  } catch {}

  if (deferred) {
    // UIの「停止」用: 旧セッションの取りこぼしを確実に止める
    try {
      setTimeout(() => window.speechSynthesis.cancel(), 0);
    } catch {}
    try {
      requestAnimationFrame(() => window.speechSynthesis.cancel());
    } catch {}
  }
}

async function waitForVoices(maxWaitMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) return resolve();

    const timer = setTimeout(() => {
      clearInterval(iv);
      resolve();
    }, maxWaitMs);

    const iv = setInterval(() => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        clearInterval(iv);
        clearTimeout(timer);
        resolve();
      }
    }, 50);
  });
}

function pickVoice(preferredName?: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices() || [];

  if (preferredName) {
    const hit = voices.find((v) => v.name === preferredName);
    if (hit) return hit;
  }

  const ja = voices.filter((v) =>
    (v.lang || "").toLowerCase().startsWith("ja")
  );

  return ja[0] || voices[0];
}

function splitJaSentences(text: string): string[] {
  return String(text)
    .split(/([。！？!?]\s*|\n+)/)
    .reduce<string[]>((acc, cur, i, arr) => {
      if (i % 2 === 0) acc.push(cur + (arr[i + 1] || ""));
      return acc;
    }, [])
    .map((s) => s.trim())
    .filter(Boolean);
}

async function unlockWebSpeech(voiceName?: string) {
  if (__wsUnlocked) return;

  try {
    await waitForVoices();

    const u = new SpeechSynthesisUtterance(" ");
    u.lang = "ja-JP";
    u.volume = 0;
    u.rate = 1;
    u.pitch = 1;

    const v = pickVoice(voiceName);
    if (v) u.voice = v;

    hardCancelSpeechSynthesis(false);
    window.speechSynthesis.speak(u);
    __wsUnlocked = true;
  } catch {
    // ignore
  }
}

// ---- public API ------------------------------------------------------------
export async function speak(text: string, options: SpeakOptions = {}) {
  if (!text || !text.trim()) return;

  text = normalizeSpeechText(text);

  // ローカル設定の既定値（LS未設定時のフォールバック）
  const DEFAULT_RATE = 1.0;
  const DEFAULT_PITCH = 1.0;
  const DEFAULT_VOLUME = 0.8;

  const lsSpeed = Number(localStorage.getItem("tts:speedScale"));
  const lsWSName = localStorage.getItem("tts:webspeech:voiceName") || undefined;
  const lsPitch = Number(localStorage.getItem("tts:pitch"));
  const lsVolume = Number(localStorage.getItem("tts:volume"));
  const engine = localStorage.getItem("tts:engine") || "webspeech";

  const voiceName = options.voiceName ?? lsWSName;

  const baseRate = Number.isFinite(options.speedScale)
    ? clamp(Number(options.speedScale), 0.5, 2.0)
    : Number.isFinite(lsSpeed)
      ? clamp(lsSpeed, 0.5, 2.0)
      : DEFAULT_RATE;

  const rate = getAutoAdjustedRate(text, baseRate);

  const pitch = Number.isFinite(options.pitch)
    ? clamp(Number(options.pitch), 0.0, 2.0)
    : Number.isFinite(lsPitch)
      ? clamp(lsPitch, 0.0, 2.0)
      : DEFAULT_PITCH;

  const volume = Number.isFinite(options.volume)
    ? clamp(Number(options.volume), 0.0, 1.0)
    : Number.isFinite(lsVolume)
      ? clamp(lsVolume, 0.0, 1.0)
      : DEFAULT_VOLUME;

  // 新しい読み上げ開始時に、以前の Web Speech / Piper を止める
  sessionCounter++;
  const mySession = sessionCounter;
  speaking = false;
  hardCancelSpeechSynthesis(false);
  stopPiperAudio();

  // Easyアナウンス AI音声（Piper-Plus）
  if (engine === "piper") {
    try {
      // ユーザー操作の直後にAudioContextを起こしておく。
      // モデル初期化/推論後に初めて音声再生を開始すると、
      // ブラウザの自動再生制限に掛かる端末があるため。
      const ctx = await unlockPiperAudio();
      await speakWithPiper(text, rate, volume, mySession, ctx);
      return;
    } catch (err) {
      speaking = false;
      console.error("[Piper-Plus TTS]", err);
      throw err;
    }
  }

  // ---- ここから従来の Web Speech API -------------------------------------
  try {
    await unlockWebSpeech(voiceName);
  } catch {}

  if (mySession !== sessionCounter) return;

  await new Promise<void>((r) => setTimeout(r, 0));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  await waitForVoices();
  if (mySession !== sessionCounter) return;

  const pick = pickVoice(voiceName);
  const chunks = splitJaSentences(text);
  if (chunks.length === 0) return;

  // 逐次再生（各ステップでセッション確認。停止されたら即中断）
  await new Promise<void>((resolve) => {
    let i = 0;

    const playNext = () => {
      if (mySession !== sessionCounter) return resolve();
      if (i >= chunks.length) {
        speaking = false;
        return resolve();
      }

      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = "ja-JP";
      if (pick) u.voice = pick;
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;

      u.onend = () => {
        if (mySession !== sessionCounter) return resolve();
        setTimeout(playNext, 40);
      };

      u.onerror = () => {
        if (mySession !== sessionCounter) return resolve();
        setTimeout(playNext, 0);
      };

      speaking = true;

      try {
        window.speechSynthesis.speak(u);
      } catch {
        speaking = false;
        resolve();
      }
    };

    playNext();
  });
}

export function stop() {
  sessionCounter++;
  speaking = false;
  hardCancelSpeechSynthesis(true);
  stopPiperAudio();
}

export function isSpeaking() {
  return speaking;
}

// 互換用: 事前ウォームアップ（無音1文字でモバイルのロック解除）
export async function prewarmTTS(): Promise<void> {
  const engine = localStorage.getItem("tts:engine") || "webspeech";

  if (engine === "piper") {
    try {
      // アプリ起動後/ユーザー操作後に先にモデルを読み込み、
      // 読み上げボタン押下時の待ち時間を減らす。
      await unlockPiperAudio();
      await getPiperPlus();
    } catch (err) {
      console.error("[Piper-Plus prewarm]", err);
    }
    return;
  }

  try {
    const name = localStorage.getItem("tts:webspeech:voiceName") || undefined;

    await waitForVoices();

    const u = new SpeechSynthesisUtterance(" ");
    u.lang = "ja-JP";
    u.volume = 0;
    u.rate = 1;
    u.pitch = 1;

    if (name) {
      const hit = window.speechSynthesis.getVoices().find((v) => v.name === name);
      if (hit) u.voice = hit;
    }

    hardCancelSpeechSynthesis(false);
    window.speechSynthesis.speak(u);
    __wsUnlocked = true;
  } catch {
    // ignore
  }
}
