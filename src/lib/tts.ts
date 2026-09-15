import {
  prefetchMatcha,
  prewarmMatcha,
  speakMatcha,
  stopMatcha,
  unlockMatchaAudioForIOS,
} from "./matchaTts";

// src/lib/tts.ts
// Web Speech API + Easyアナウンス Matcha-TTS

type SpeakOptions = {
  progressive?: boolean; // 互換用
  cache?: boolean;       // 互換用
  speaker?: number;      // 互換用
  speedScale?: number;
  voiceName?: string;
  pitch?: number;
  volume?: number;
};

let __wsUnlocked = false;
let sessionCounter = 0;
let speaking = false;

function getTtsEngine(): "webspeech" | "matcha" {
  const engine = localStorage.getItem("tts:engine");

  // 旧Piper設定からの移行。
  if (engine === "piper") {
    try {
      localStorage.setItem("tts:engine", "matcha");
    } catch {}
    return "matcha";
  }

  if (engine === "matcha") return "matcha";
  return "webspeech";
}

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iP(hone|ad|od)/.test(ua) ||
    (/Macintosh/.test(ua) &&
      typeof document !== "undefined" &&
      "ontouchend" in document)
  );
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
  return s.replace(/[０-９]/g, (c) =>
    String(c.charCodeAt(0) - 0xfee0)
  );
}

export function preserveNameReading(input: string): string {
  return String(input ?? "").replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

function numberToJapaneseReading(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 999) return String(n);
  if (n === 0) return "ゼロ";

  const ones: Record<number, string> = {
    1: "いち",
    2: "に",
    3: "さん",
    4: "よん",
    5: "ご",
    6: "ろく",
    7: "なな",
    8: "はち",
    9: "きゅう",
  };

  let x = Math.floor(n);
  let out = "";

  if (x >= 100) {
    const h = Math.floor(x / 100);
    out +=
      h === 1
        ? "ひゃく"
        : h === 3
        ? "さんびゃく"
        : h === 6
        ? "ろっぴゃく"
        : h === 8
        ? "はっぴゃく"
        : `${ones[h]}ひゃく`;
    x %= 100;
  }

  if (x >= 10) {
    const d = Math.floor(x / 10);
    out += d === 1 ? "じゅう" : `${ones[d]}じゅう`;
    x %= 10;
  }

  if (x > 0) out += ones[x];
  return out;
}

function normalizeSpeechText(input: string): string {
  let t = String(input ?? "");

  // 画面側に残っている旧補正もここで吸収
  t = t.replace(/ノック時間\s*[、,]\s*は/g, "ノック時間は");

  // 固定語
  t = t.replace(/明日以降に/g, "あすいこうに");
  // ウォーミングアップ開始案内は固定1文。
  // 「に」をカタカナ化して単語境界は明確にするが、
  // スペース・読点は入れず、1チャンクで連続発音させる。
  t = t.replace(
    /りょうチームはウォーミングアップ\s*に\s*入ってください/g,
    "りょうチームはウォーミングアップニ入ってください"
  );
  t = t.replace(/おりはら/g, "オリハラ");
  t = t.replace(/よしかわ/g, "ヨシカワ");

  // 「○番」
  t = t.replace(/[0-9０-９]\s*番/g, (m) => {
    const d = toHalfWidthDigits(
      m.replace(/\s/g, "").replace("番", "")
    );
    const kana = ORDER_KANA[d];
    return kana ? `${kana}ばん` : m;
  });

  // 8, 18, 28...球は「はちきゅう」系を明示する
  t = t.replace(/([0-9０-９]+)\s*球/g, (m, raw) => {
    const digits = toHalfWidthDigits(String(raw));
    const n = Number(digits);

    if (!Number.isFinite(n)) return m;

    if (n % 10 === 8) {
      // Matchaで「はち」が「わち」のように聞こえる場合があるため、
      // ひらがなではなくカタカナで連続発音させる。
      // 区切りは入れないので「ハチキュウ」を滑らかに読む。
      return `${preserveNameReading(numberToJapaneseReading(n))}キュウ`;
    }

    return m;
  });

  // 単独の0
  t = t.replace(
    /(^|[^0-9０-９])0(?![0-9０-９])/g,
    "$1ゼロ"
  );

  // 第○試合
  const gameRead: Record<string, string> = {
    "1": "だいいちしあい",
    "2": "だいにしあい",
    "3": "だいさんしあい",
    "4": "だいよんしあい",
    "5": "だいごしあい",
    "6": "だいろくしあい",
    "7": "だいななしあい",
    "8": "だいはちしあい",
    "9": "だいきゅうしあい",
  };

  t = t.replace(/第([1-9１-９])試合/g, (m, d) => {
    const half = toHalfWidthDigits(String(d));
    return gameRead[half] ?? m;
  });

  // 野球アナウンスで固定したい語
  t = t.replace(/メンバー表/g, "めんばーひょう");
  t = t.replace(/先攻/g, "せんこう");
  t = t.replace(/後攻/g, "こうこう");
  t = t.replace(/四氏/g, "よんし");
  t = t.replace(/行方/g, "ゆくえ");
  t = t.replace(/尚/g, "なお");
  t = t.replace(/1回/g, "いっかい");
  t = t.replace(/表/g, "おもて");
  t = t.replace(/Easyscore/gi, "イージースコア");
  t = t.replace(/お知らせいたします/g, "お知らせ致します");
  t = t.replace(/下さい/g, "ください");

  // 読点重複を整理
  t = t.replace(/、、+/g, "、");

  return t;
}

// ---- utilities -------------------------------------------------------------

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAutoAdjustedRate(text: string, baseRate: number): number {
  const normalized = String(text)
    .replace(/\s/g, "")
    .replace(/[、。！？!?]/g, "");

  const len = normalized.length;
  let adjusted = baseRate;

  if (len >= 100) {
    adjusted = baseRate + 0.08;
  } else if (len >= 60) {
    adjusted = baseRate + 0.04;
  }

  return clamp(adjusted, 0.5, 2.0);
}

function hardCancelSpeechSynthesis(deferred = false) {
  try {
    window.speechSynthesis.cancel();
  } catch {}

  if (deferred) {
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
    if (voices && voices.length > 0) {
      resolve();
      return;
    }

    let iv = 0;

    const timer = window.setTimeout(() => {
      if (iv) window.clearInterval(iv);
      resolve();
    }, maxWaitMs);

    iv = window.setInterval(() => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        window.clearInterval(iv);
        window.clearTimeout(timer);
        resolve();
      }
    }, 50);
  });
}

function pickVoice(
  preferredName?: string
): SpeechSynthesisVoice | undefined {
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
      if (i % 2 === 0) {
        acc.push(cur + (arr[i + 1] || ""));
      }
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
  } catch {}
}

function loadCommonOptions(options: SpeakOptions) {
  const DEFAULT_RATE = 1.0;
  const DEFAULT_PITCH = 1.0;
  const DEFAULT_VOLUME = 0.8;

  const lsSpeed = Number(
    localStorage.getItem("tts:speedScale")
  );
  const lsWSName =
    localStorage.getItem("tts:webspeech:voiceName") ||
    undefined;
  const lsPitch = Number(
    localStorage.getItem("tts:pitch")
  );
  const lsVolume = Number(
    localStorage.getItem("tts:volume")
  );

  const voiceName = options.voiceName ?? lsWSName;

  const baseRate = Number.isFinite(options.speedScale)
    ? clamp(Number(options.speedScale), 0.5, 2.0)
    : Number.isFinite(lsSpeed)
    ? clamp(lsSpeed, 0.5, 2.0)
    : DEFAULT_RATE;

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

  return {
    voiceName,
    baseRate,
    pitch,
    volume,
  };
}

// ---- public API ------------------------------------------------------------

export async function speak(
  text: string,
  options: SpeakOptions = {}
) {
  if (!text || !text.trim()) return;

  if (
    getTtsEngine() === "matcha" &&
    isIOSDevice()
  ) {
    unlockMatchaAudioForIOS();
  }

  const normalizedText =
    normalizeSpeechText(text);

  const {
    voiceName,
    baseRate,
    pitch,
    volume,
  } = loadCommonOptions(options);

  if (getTtsEngine() === "matcha") {
    speaking = true;

    try {
      await speakMatcha(
        normalizedText,
        {
          speedScale: baseRate,
          volume,
        }
      );
    } finally {
      speaking = false;
    }

    return;
  }

  try {
    await unlockWebSpeech(voiceName);
  } catch {}

  sessionCounter++;
  speaking = false;
  hardCancelSpeechSynthesis(false);

  await new Promise<void>((r) =>
    window.setTimeout(r, 0)
  );

  await new Promise<void>((r) =>
    requestAnimationFrame(() => r())
  );

  const mySession = sessionCounter;

  await waitForVoices();

  const pick = pickVoice(voiceName);

  const rate =
    getAutoAdjustedRate(
      normalizedText,
      baseRate
    );

  const chunks =
    splitJaSentences(normalizedText);

  if (!chunks.length) return;

  await new Promise<void>((resolve) => {
    let i = 0;

    const playNext = () => {
      if (mySession !== sessionCounter) {
        resolve();
        return;
      }

      if (i >= chunks.length) {
        speaking = false;
        resolve();
        return;
      }

      const u =
        new SpeechSynthesisUtterance(
          chunks[i++]
        );

      u.lang = "ja-JP";
      if (pick) u.voice = pick;
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;

      u.onend = () => {
        if (mySession !== sessionCounter) {
          resolve();
          return;
        }
        window.setTimeout(playNext, 0);
      };

      u.onerror = () => {
        if (mySession !== sessionCounter) {
          resolve();
          return;
        }
        window.setTimeout(playNext, 0);
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

export async function speakSegments(
  segments: string[],
  options: SpeakOptions = {}
) {
  const cleaned = (segments || [])
    .map((s) =>
      normalizeSpeechText(
        String(s ?? "")
      ).trim()
    )
    .filter(Boolean);

  if (!cleaned.length) return;

  if (
    getTtsEngine() === "matcha" &&
    isIOSDevice()
  ) {
    unlockMatchaAudioForIOS();
  }

  const {
    voiceName,
    baseRate,
    pitch,
    volume,
  } = loadCommonOptions(options);

  if (getTtsEngine() === "matcha") {
    speaking = true;

    try {
      for (const segment of cleaned) {
        await speakMatcha(
          segment,
          {
            speedScale: baseRate,
            volume,
          }
        );
      }
    } finally {
      speaking = false;
    }

    return;
  }

  try {
    await unlockWebSpeech(voiceName);
  } catch {}

  sessionCounter++;
  speaking = false;
  hardCancelSpeechSynthesis(false);

  await new Promise<void>((r) =>
    window.setTimeout(r, 0)
  );

  await new Promise<void>((r) =>
    requestAnimationFrame(() => r())
  );

  const mySession = sessionCounter;

  await waitForVoices();
  const pick = pickVoice(voiceName);

  await new Promise<void>((resolve) => {
    let i = 0;

    const playNext = () => {
      if (mySession !== sessionCounter) {
        resolve();
        return;
      }

      if (i >= cleaned.length) {
        speaking = false;
        resolve();
        return;
      }

      const segment = cleaned[i++];

      const u =
        new SpeechSynthesisUtterance(
          segment
        );

      u.lang = "ja-JP";
      if (pick) u.voice = pick;
      u.rate =
        getAutoAdjustedRate(
          segment,
          baseRate
        );
      u.pitch = pitch;
      u.volume = volume;

      u.onend = () => {
        if (mySession !== sessionCounter) {
          resolve();
          return;
        }
        playNext();
      };

      u.onerror = () => {
        if (mySession !== sessionCounter) {
          resolve();
          return;
        }
        playNext();
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

export async function prefetchTTS(
  text: string,
  options: SpeakOptions = {}
): Promise<void> {
  if (!text || !text.trim()) return;
  if (getTtsEngine() !== "matcha") return;

  const normalized =
    normalizeSpeechText(text);

  const lsSpeed = Number(
    localStorage.getItem(
      "tts:speedScale"
    )
  );

  const speedScale =
    Number.isFinite(options.speedScale)
      ? clamp(
          Number(options.speedScale),
          0.5,
          2.0
        )
      : Number.isFinite(lsSpeed)
      ? clamp(lsSpeed, 0.5, 2.0)
      : 1.0;

  await prefetchMatcha(
    normalized,
    { speedScale }
  );
}

export function stop() {
  sessionCounter++;
  stopMatcha();
  speaking = false;
  hardCancelSpeechSynthesis(true);
}

export function isSpeaking() {
  return speaking;
}

export async function prewarmTTS(): Promise<void> {
  try {
    if (getTtsEngine() === "matcha") {
      try {
        await prewarmMatcha();
      } catch (error) {
        console.warn(
          "Matcha prewarm failed:",
          error
        );
      }
      return;
    }

    const name =
      localStorage.getItem(
        "tts:webspeech:voiceName"
      ) || undefined;

    await waitForVoices();

    const u =
      new SpeechSynthesisUtterance(" ");

    u.lang = "ja-JP";
    u.volume = 0;
    u.rate = 1;
    u.pitch = 1;

    if (name) {
      const hit =
        window.speechSynthesis
          .getVoices()
          .find(
            (v) => v.name === name
          );

      if (hit) u.voice = hit;
    }

    hardCancelSpeechSynthesis(false);
    window.speechSynthesis.speak(u);
    __wsUnlocked = true;
  } catch {}
}

// 画面を先に表示してから空き時間にMatchaを準備する。
if (typeof window !== "undefined") {
  const startAiPrewarm = () => {
    if (getTtsEngine() !== "matcha") {
      return;
    }

    void prewarmTTS();
  };

  const w =
    window as typeof window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout?: number }
      ) => number;
    };

  if (
    typeof w.requestIdleCallback ===
    "function"
  ) {
    w.requestIdleCallback(
      startAiPrewarm,
      { timeout: 5000 }
    );
  } else {
    window.setTimeout(
      startAiPrewarm,
      2000
    );
  }

  // 既存画面との互換。
  (
    window as typeof window & {
      prefetchTTS?: (
        text: string
      ) => void;
    }
  ).prefetchTTS = (
    text: string
  ) => {
    void prefetchTTS(text);
  };
}
