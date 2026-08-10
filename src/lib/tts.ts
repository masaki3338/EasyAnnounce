import {
  prewarmPiper,
  speakPiper,
  stopPiper,
} from "./piperTts";

// src/lib/tts.ts
// Easyアナウンス 読み上げ統合版
// - Web Speech API
// - Piper-Plus（モデル切替は piperTts.ts 側で管理）

type SpeakOptions = {
  progressive?: boolean; // 互換用: 未使用
  cache?: boolean;       // 互換用: 未使用
  speaker?: number;      // 互換用: 未使用
  speedScale?: number;   // 読み上げ速度 (0.5〜2.0推奨)
  voiceName?: string;    // 端末音声名（任意）
  pitch?: number;        // 0〜2
  volume?: number;       // 0〜1
};

let __wsUnlocked = false;
let sessionCounter = 0;
let speaking = false;

function getTtsEngine(): "webspeech" | "piper" {
  return localStorage.getItem("tts:engine") === "piper"
    ? "piper"
    : "webspeech";
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

  const DEFAULT_RATE = 1.0;
  const DEFAULT_PITCH = 1.0;
  const DEFAULT_VOLUME = 0.8;

  const lsSpeed = Number(localStorage.getItem("tts:speedScale"));
  const lsWSName =
    localStorage.getItem("tts:webspeech:voiceName") || undefined;
  const lsPitch = Number(localStorage.getItem("tts:pitch"));
  const lsVolume = Number(localStorage.getItem("tts:volume"));

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

  // 新しい読み上げ開始時に既存音声を停止
  sessionCounter++;
  const mySession = sessionCounter;
  speaking = false;

  try {
    hardCancelSpeechSynthesis(false);
  } catch {}

  stopPiper();

  // Piper-Plus
  if (getTtsEngine() === "piper") {
    speaking = true;

    try {
      await speakPiper(text, {
        // Piper側では speedScale を直接使う
        speedScale: baseRate,
        volume,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);

      console.error("[Piper-Plus TTS]", error);

      throw new Error(`Piper-Plus読み上げ失敗: ${message}`);
    } finally {
      speaking = false;
    }

    return;
  }

  // ---- Web Speech API -------------------------------------------------------
  try {
    await unlockWebSpeech(voiceName);
  } catch {}

  if (mySession !== sessionCounter) return;

  hardCancelSpeechSynthesis(false);

  await new Promise<void>((r) => setTimeout(r, 0));
  await new Promise<void>((r) =>
    requestAnimationFrame(() => r())
  );

  if (mySession !== sessionCounter) return;

  await waitForVoices();
  if (mySession !== sessionCounter) return;

  const pick = pickVoice(voiceName);
  const chunks = splitJaSentences(text);
  if (chunks.length === 0) return;

  await new Promise<void>((resolve) => {
    let i = 0;

    const playNext = () => {
      if (mySession !== sessionCounter) {
        speaking = false;
        return resolve();
      }

      if (i >= chunks.length) {
        speaking = false;
        return resolve();
      }

      const utterance = new SpeechSynthesisUtterance(chunks[i++]);

      utterance.lang = "ja-JP";
      if (pick) utterance.voice = pick;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      utterance.onend = () => {
        if (mySession !== sessionCounter) {
          speaking = false;
          return resolve();
        }
        setTimeout(playNext, 40);
      };

      utterance.onerror = () => {
        if (mySession !== sessionCounter) {
          speaking = false;
          return resolve();
        }
        setTimeout(playNext, 0);
      };

      speaking = true;

      try {
        window.speechSynthesis.speak(utterance);
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

  try {
    stopPiper();
  } catch {}

  hardCancelSpeechSynthesis(true);
}

export function isSpeaking() {
  return speaking;
}

export async function prewarmTTS(): Promise<void> {
  if (getTtsEngine() === "piper") {
    try {
      await prewarmPiper();
    } catch (error) {
      console.warn("Piper prewarm failed:", error);
    }
    return;
  }

  try {
    const name =
      localStorage.getItem("tts:webspeech:voiceName") || undefined;

    await waitForVoices();

    const u = new SpeechSynthesisUtterance(" ");
    u.lang = "ja-JP";
    u.volume = 0;
    u.rate = 1;
    u.pitch = 1;

    if (name) {
      const hit = window.speechSynthesis
        .getVoices()
        .find((v) => v.name === name);
      if (hit) u.voice = hit;
    }

    hardCancelSpeechSynthesis(false);
    window.speechSynthesis.speak(u);
    __wsUnlocked = true;
  } catch {
    // ignore
  }
}
