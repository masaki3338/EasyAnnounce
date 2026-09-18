import {
  prefetchMatcha,
  prewarmMatcha,
  speakMatcha,
  synthesizeMatchaPcmForJoin,
  playJoinedMatchaPcm,
  stopMatcha,
  unlockMatchaAudioForIOS,
  type MatchaPcmAudio,
} from "./matchaTts";

// src/lib/tts.ts
// Easyアナウンス Matcha-TTS
// - 1スレッドWorkerを維持して安定動作を優先
// - 起動時prewarmをバックグラウンド実行
// - 各画面のprefetchTTS()で読み上げ音声を先読み
// - 読み上げボタン自体は先読み完了待ちで無効化しない
// - 固定MP3はAI音声ごとのフォルダから最優先再生

type SpeakOptions = {
  progressive?: boolean;
  cache?: boolean;
  speaker?: number;
  speedScale?: number;
  voiceName?: string;
  pitch?: number;
  volume?: number;
};

let sessionCounter = 0;
let speaking = false;
let __wsUnlocked = false;

// -----------------------------------------------------------------------------
// 固定MP3（AI音声選択時のみ最優先）
// 谷保さん = public/audio/1/
// ウグイス嬢 = public/audio/2/
// 文末の句点の有無は問いません。長文中に含まれる固定文言もMP3を優先します。
// -----------------------------------------------------------------------------
let fixedAudioElement: HTMLAudioElement | null = null;
let fixedAudioFinish: (() => void) | null = null;

type FixedAudioEntry = {
  text: string;
  files: string[];
};

const FIXED_AUDIO_ENTRIES: ReadonlyArray<FixedAudioEntry> = [
  { text: "8番", files: ["0008"] },
  { text: "この試合は、ただ今で打ち切り、継続試合となります。明日以降に中断した時点から再開いたします。あしからずご了承くださいませ", files: ["413"] },
  { text: "本日は気温が高く、熱中症が心配されますので、水分をこまめにとり、体調に気を付けてください", files: ["425"] },
  { text: "シートノックの準備に入ってください", files: ["0330"] },
  { text: "ファウルボールの行方には十分ご注意ください", files: ["0378"] },
  { text: "ファールボールの行方には十分ご注意ください", files: ["0378"] },
  // 現行録音番号0379を優先。旧番号0329も残してフォールバック。
  { text: "ウォーミングアップを終了してください", files: ["0379", "0329"] },
  { text: "ノックを終了してください", files: ["0334"] },
  { text: "ただいまの試合は、ご覧のように", files: ["426"] },
  { text: "なおこの試合の終了時刻は", files: ["416"] },
  { text: "審判員の皆様、ありがとうございました", files: ["417"] },
  { text: "健闘しました両チームの選手に、盛大な拍手をお願いいたします", files: ["418"] },
  { text: "両チームの監督、キャプテンはピッチングレコードを記載の上、バックネット前にお集まりください", files: ["419"] },
  { text: "これより、ピッチングレコードの確認を行います", files: ["420"] },
  { text: "球審、EasyScore担当、公式記録員、球場役員もお集まりください", files: ["421"] },
];

function getSelectedMatchaVoice(): "taniho" | "uguisu" {
  try {
    const saved =
      localStorage.getItem("tts:matcha:voice") ||
      localStorage.getItem("tts:matcha:model") ||
      localStorage.getItem("tts:piper:model") ||
      "";

    if (saved === "uguisu" || saved === "easy-announce-2") {
      return "uguisu";
    }
  } catch {}
  return "taniho";
}

function getFixedAudioFolder(): string {
  return getSelectedMatchaVoice() === "uguisu" ? "2" : "1";
}

function getFixedAudioSrc(baseName: string): string {
  return `/audio/${getFixedAudioFolder()}/${baseName}.mp3`;
}

const fixedAudioPrefetchInFlight = new Map<string, Promise<boolean>>();


// 回先頭の分割結合再生でも固定MP3を使えるよう、MP3をPCMへdecodeして保持する。
// Matcha/Vocosは22.05kHzなので、固定MP3も22.05kHzのmono PCMへ揃える。
const JOIN_SAMPLE_RATE = 22050;
const fixedPcmCache = new Map<string, Promise<MatchaPcmAudio | null>>();
let fixedDecodeContext: AudioContext | null = null;

function getFixedDecodeContext(): AudioContext {
  if (fixedDecodeContext) return fixedDecodeContext;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) throw new Error('AudioContextが利用できません。');
  fixedDecodeContext = new Ctx();
  return fixedDecodeContext;
}

function resampleMonoLinear(
  input: Float32Array,
  inputRate: number,
  outputRate: number
): Float32Array {
  if (inputRate === outputRate) return input.slice();
  if (!input.length) return new Float32Array(0);

  const outLength = Math.max(1, Math.round(input.length * outputRate / inputRate));
  const out = new Float32Array(outLength);
  const ratio = inputRate / outputRate;

  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }

  return out;
}

async function decodeFixedAudioToPcm(baseName: string): Promise<MatchaPcmAudio | null> {
  const src = getFixedAudioSrc(baseName);
  const cached = fixedPcmCache.get(src);
  if (cached) return cached;

  const promise = (async (): Promise<MatchaPcmAudio | null> => {
    try {
      const response = await fetch(src, { cache: 'force-cache' });
      if (!response.ok) return null;

      const arrayBuffer = await response.arrayBuffer();
      const ctx = getFixedDecodeContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

      // ステレオでもmonoへ平均化する。
      const mono = new Float32Array(decoded.length);
      const channels = Math.max(1, decoded.numberOfChannels);
      for (let ch = 0; ch < channels; ch++) {
        const data = decoded.getChannelData(ch);
        for (let i = 0; i < data.length; i++) mono[i] += data[i] / channels;
      }

      const samples = resampleMonoLinear(mono, decoded.sampleRate, JOIN_SAMPLE_RATE);
      console.log('[TTS JOIN FIXED] decoded', {
        voice: getSelectedMatchaVoice(),
        src,
        inputRate: decoded.sampleRate,
        outputRate: JOIN_SAMPLE_RATE,
        durationSec: Math.round((samples.length / JOIN_SAMPLE_RATE) * 100) / 100,
      });

      return { samples, sampleRate: JOIN_SAMPLE_RATE };
    } catch (error) {
      console.warn('[TTS JOIN FIXED] decode failed', { src, error });
      return null;
    }
  })();

  fixedPcmCache.set(src, promise);
  return promise;
}

async function prefetchFixedAudioFile(baseName: string): Promise<boolean> {
  const src = getFixedAudioSrc(baseName);
  const existing = fixedAudioPrefetchInFlight.get(src);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const response = await fetch(src, { cache: "force-cache" });
      return response.ok;
    } catch {
      return false;
    }
  })();

  fixedAudioPrefetchInFlight.set(src, promise);
  try {
    return await promise;
  } finally {
    fixedAudioPrefetchInFlight.delete(src);
  }
}

function stopFixedAudio() {
  const finish = fixedAudioFinish;
  fixedAudioFinish = null;

  if (fixedAudioElement) {
    try { fixedAudioElement.pause(); } catch {}
    try { fixedAudioElement.currentTime = 0; } catch {}
    fixedAudioElement = null;
  }

  if (finish) {
    try { finish(); } catch {}
  }
}

async function playFixedAudioFile(
  baseName: string,
  volume: number
): Promise<void> {
  stopFixedAudio();

  const src = getFixedAudioSrc(baseName);
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = clamp(volume, 0, 1);
  fixedAudioElement = audio;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
      if (fixedAudioFinish === finish) fixedAudioFinish = null;
      if (fixedAudioElement === audio) fixedAudioElement = null;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    fixedAudioFinish = finish;
    audio.onended = finish;
    audio.onerror = () => fail(new Error(`固定音声の再生に失敗しました: ${src}`));

    try {
      const promise = audio.play();
      if (promise && typeof promise.catch === "function") {
        void promise.catch(fail);
      }
    } catch (error) {
      fail(error);
    }
  });
}

type HybridSegment =
  | { type: "tts"; text: string }
  | { type: "fixed"; text: string; files: string[] };

function splitByFixedAudio(originalText: string): HybridSegment[] {
  const source = String(originalText ?? "");
  const result: HybridSegment[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    let bestIndex = -1;
    let bestEntry: FixedAudioEntry | null = null;

    for (const entry of FIXED_AUDIO_ENTRIES) {
      const index = source.indexOf(entry.text, cursor);
      if (index < 0) continue;

      if (
        bestIndex < 0 ||
        index < bestIndex ||
        (index === bestIndex && bestEntry && entry.text.length > bestEntry.text.length)
      ) {
        bestIndex = index;
        bestEntry = entry;
      }
    }

    if (bestIndex < 0 || !bestEntry) {
      result.push({ type: "tts", text: source.slice(cursor) });
      break;
    }

    if (bestIndex > cursor) {
      result.push({ type: "tts", text: source.slice(cursor, bestIndex) });
    }

    result.push({
      type: "fixed",
      text: bestEntry.text,
      files: [...bestEntry.files],
    });
    cursor = bestIndex + bestEntry.text.length;
  }

  return result;
}

function hasSpeakableCharacters(text: string): boolean {
  return String(text ?? "")
    .replace(/[\s、。．,.！？!?「」『』（）()・…ー\-]/g, "")
    .length > 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getTtsEngine(): "webspeech" | "matcha" {
  try {
    const engine = localStorage.getItem("tts:engine");

    // 旧Piper設定はMatchaへ移行。
    if (engine === "piper") {
      localStorage.setItem("tts:engine", "matcha");
      return "matcha";
    }

    if (engine === "matcha") return "matcha";
    return "webspeech";
  } catch {
    return "webspeech";
  }
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
      h === 1 ? "ひゃく" :
      h === 3 ? "さんびゃく" :
      h === 6 ? "ろっぴゃく" :
      h === 8 ? "はっぴゃく" :
      `${ones[h]}ひゃく`;
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

  t = t.replace(/ノック時間\s*[、,]\s*は/g, "ノック時間は");
  t = t.replace(/明日以降に/g, "あすいこうに");
  t = t.replace(
    /りょうチームはウォーミングアップ\s*に\s*入ってください/g,
    "りょうチームはウォーミングアップニ入ってください"
  );
  t = t.replace(/おりはら/g, "オリハラ");
  t = t.replace(/よしかわ/g, "ヨシカワ");

  t = t.replace(/[0-9０-９]\s*番/g, (m) => {
    const d = toHalfWidthDigits(
      m.replace(/\s/g, "").replace("番", "")
    );
    const kana = ORDER_KANA[d];
    if (!kana) return m;

    // Matchaで「8番」の語頭が弱くなり「わちばん」のように聞こえることがあるため、
    // 8番だけ「はち」と「ばん」の語境界を空白で明示する。
    // 読点は入れないので、大きなポーズは作らない。
    if (d === "8") return "はちばん";

    return `${kana}ばん`;
  });

  t = t.replace(/([0-9０-９]+)\s*球/g, (m, raw) => {
    const n = Number(toHalfWidthDigits(String(raw)));
    if (!Number.isFinite(n)) return m;
    if (n % 10 === 8) {
      return `${preserveNameReading(numberToJapaneseReading(n))}キュウ`;
    }
    return m;
  });

  t = t.replace(/(^|[^0-9０-９])0(?![0-9０-９])/g, "$1ゼロ");

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
  t = t.replace(/、、+/g, "、");

  return t;
}

function getAutoAdjustedRate(text: string, baseRate: number): number {
  const len = String(text)
    .replace(/\s/g, "")
    .replace(/[、。！？!?]/g, "")
    .length;

  if (len >= 100) return clamp(baseRate + 0.08, 0.5, 2.0);
  if (len >= 60) return clamp(baseRate + 0.04, 0.5, 2.0);
  return clamp(baseRate, 0.5, 2.0);
}

function loadCommonOptions(options: SpeakOptions) {
  const readStoredNumber = (key: string): number | null => {
    const raw = localStorage.getItem(key);
    if (raw == null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const lsSpeed = readStoredNumber("tts:speedScale");
  const lsPitch = readStoredNumber("tts:pitch");
  const lsVolume = readStoredNumber("tts:volume");
  const lsVoice = localStorage.getItem("tts:webspeech:voiceName") || undefined;

  return {
    voiceName: options.voiceName ?? lsVoice,
    baseRate: Number.isFinite(options.speedScale)
      ? clamp(Number(options.speedScale), 0.5, 2.0)
      : lsSpeed != null
      ? clamp(lsSpeed, 0.5, 2.0)
      : 1.0,
    pitch: Number.isFinite(options.pitch)
      ? clamp(Number(options.pitch), 0, 2)
      : lsPitch != null
      ? clamp(lsPitch, 0, 2)
      : 1.0,
    volume: Number.isFinite(options.volume)
      ? clamp(Number(options.volume), 0, 1)
      : lsVolume != null
      ? clamp(lsVolume, 0, 1)
      : 0.8,
  };
}

function hardCancelSpeechSynthesis() {
  try {
    window.speechSynthesis.cancel();
  } catch {}
}

async function waitForVoices(maxWaitMs = 1000): Promise<void> {
  if (window.speechSynthesis.getVoices().length > 0) return;

  await new Promise<void>((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (
        window.speechSynthesis.getVoices().length > 0 ||
        Date.now() - started >= maxWaitMs
      ) {
        window.clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

function pickVoice(name?: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices() || [];
  if (name) {
    const hit = voices.find((v) => v.name === name);
    if (hit) return hit;
  }
  return (
    voices.find((v) => (v.lang || "").toLowerCase().startsWith("ja")) ||
    voices[0]
  );
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
    hardCancelSpeechSynthesis();
    window.speechSynthesis.speak(u);
    __wsUnlocked = true;
  } catch {}
}

async function speakWebSpeech(
  text: string,
  options: ReturnType<typeof loadCommonOptions>
): Promise<void> {
  await unlockWebSpeech(options.voiceName);

  sessionCounter++;
  const mySession = sessionCounter;
  hardCancelSpeechSynthesis();

  await new Promise<void>((r) => window.setTimeout(r, 0));
  await waitForVoices();

  const voice = pickVoice(options.voiceName);
  const rate = getAutoAdjustedRate(text, options.baseRate);

  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = options.pitch;
    u.volume = options.volume;

    u.onend = () => resolve();
    u.onerror = () => resolve();

    if (mySession !== sessionCounter) {
      resolve();
      return;
    }

    speaking = true;
    try {
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

function showMatchaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[TTS] Matcha読み上げ失敗:", error);

  try {
    window.alert(
      `AI音声の読み上げに失敗しました。\n\n${message}`
    );
  } catch {}
}

export async function speak(
  text: string,
  options: SpeakOptions = {}
): Promise<void> {
  const requestStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const originalText = String(text ?? "");
  if (!originalText.trim()) return;

  const common = loadCommonOptions(options);

  if (getTtsEngine() === "matcha") {
    console.log("[TTS LATENCY] speak requested", {
      voice: getSelectedMatchaVoice(),
      textLength: originalText.length,
      at: Math.round(requestStartedAt * 10) / 10,
    });
    speaking = true;
    const mySession = ++sessionCounter;

    try {
      if (isIOSDevice()) {
        unlockMatchaAudioForIOS();
      }

      // 固定文言が含まれる場合は、その部分だけMP3を最優先で再生。
      // 固定MP3が無い/再生失敗の場合は、その部分もMatchaへフォールバック。
      const segments = splitByFixedAudio(originalText);

      for (const segment of segments) {
        if (mySession !== sessionCounter) return;

        if (segment.type === "fixed") {
          let played = false;

          for (const baseName of segment.files) {
            try {
              console.log("[TTS FIXED] try", {
                voice: getSelectedMatchaVoice(),
                src: getFixedAudioSrc(baseName),
                text: segment.text,
              });
              await playFixedAudioFile(baseName, common.volume);
              played = true;
              console.log("[TTS FIXED] played", {
                voice: getSelectedMatchaVoice(),
                src: getFixedAudioSrc(baseName),
              });
              break;
            } catch (error) {
              console.warn("[TTS FIXED] failed; try fallback", {
                src: getFixedAudioSrc(baseName),
                error,
              });
            }
          }

          if (played) continue;
        }

        const normalized = normalizeSpeechText(segment.text).trim();
        if (!normalized || !hasSpeakableCharacters(normalized)) continue;

        await speakMatcha(normalized, {
          speedScale: common.baseRate,
          volume: common.volume,
        });
      }
    } catch (error) {
      showMatchaError(error);
      throw error;
    } finally {
      speaking = false;
    }
    return;
  }

  const normalized = normalizeSpeechText(originalText).trim();
  if (!normalized) return;

  speaking = true;
  try {
    await speakWebSpeech(normalized, common);
  } finally {
    speaking = false;
  }
}


// 回先頭など、別々に先読みした短い音声を1本のPCMへ結合して再生する。
// Matcha以外の端末音声では従来どおり1つの文章として読み上げる。
export async function speakJoinedTTS(
  parts: string[],
  options: SpeakOptions = {}
): Promise<void> {
  const originalParts = (parts || [])
    .map((part) => String(part ?? ''))
    .filter((part) => part.trim().length > 0);

  if (!originalParts.length) return;

  if (getTtsEngine() !== 'matcha') {
    await speak(originalParts.join(''), options);
    return;
  }

  const common = loadCommonOptions(options);

  // 重要：normalizeSpeechText() より前に固定MP3判定する。
  // 例: 「8番」が先に「はちばん」へ変換されると FIXED_AUDIO_ENTRIES に一致しなくなるため。
  const hybridSegments: HybridSegment[] = [];
  for (const part of originalParts) {
    hybridSegments.push(...splitByFixedAudio(part));
  }

  console.log('[TTS JOIN] request', {
    voice: getSelectedMatchaVoice(),
    segments: hybridSegments.length,
    previews: hybridSegments.map((s) => `${s.type}:${s.text.slice(0, 28)}`),
  });

  speaking = true;
  ++sessionCounter;

  try {
    if (isIOSDevice()) unlockMatchaAudioForIOS();

    const pcmParts: MatchaPcmAudio[] = [];

    for (const segment of hybridSegments) {
      if (segment.type === 'fixed') {
        let fixedPcm: MatchaPcmAudio | null = null;

        for (const baseName of segment.files) {
          fixedPcm = await decodeFixedAudioToPcm(baseName);
          if (fixedPcm) {
            console.log('[TTS JOIN FIXED] use', {
              voice: getSelectedMatchaVoice(),
              src: getFixedAudioSrc(baseName),
              text: segment.text,
            });
            break;
          }
        }

        if (fixedPcm) {
          pcmParts.push(fixedPcm);
          continue;
        }
        // MP3が無い場合はこの固定文言もMatchaへフォールバック。
      }

      const normalized = normalizeSpeechText(segment.text).trim();
      if (!normalized || !hasSpeakableCharacters(normalized)) continue;

      const pcm = await synthesizeMatchaPcmForJoin(normalized, {
        speedScale: common.baseRate,
        volume: common.volume,
      });
      if (pcm) pcmParts.push(pcm);
    }

    if (!pcmParts.length) return;

    await playJoinedMatchaPcm(
      pcmParts,
      {
        speedScale: common.baseRate,
        volume: common.volume,
      },
      35
    );
  } catch (error) {
    showMatchaError(error);
    throw error;
  } finally {
    speaking = false;
  }
}

export async function speakSegments(
  segments: string[],
  options: SpeakOptions = {}
): Promise<void> {
  const cleaned = (segments || [])
    .map((s) => normalizeSpeechText(String(s ?? "")).trim())
    .filter(Boolean);

  if (!cleaned.length) return;

  // 復旧優先: Matchaでも先読み/並列生成せず、順番に直接読む。
  for (const segment of cleaned) {
    await speak(segment, options);
  }
}

export async function prefetchTTS(
  text: string,
  options: SpeakOptions = {}
): Promise<void> {
  const originalText = String(text ?? "");
  if (!originalText.trim()) return;
  if (getTtsEngine() !== "matcha") return;

  const common = loadCommonOptions(options);
  const segments = splitByFixedAudio(originalText);
  const prefetchStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  console.log("[TTS PREFETCH] request", {
    voice: getSelectedMatchaVoice(),
    speedScale: Number(common.baseRate.toFixed(3)),
    textLength: originalText.length,
    textPreview: originalText.replace(/\s+/g, " ").slice(0, 48),
  });

  // 固定MP3はHTTPキャッシュへ先読み。
  // MP3が存在しない場合だけMatcha側のフォールバック音声も生成しておく。
  for (const segment of segments) {
    if (segment.type === "fixed") {
      let fixedAvailable = false;
      for (const baseName of segment.files) {
        if (await prefetchFixedAudioFile(baseName)) {
          fixedAvailable = true;
          break;
        }
      }

      if (fixedAvailable) {
        // 結合再生ではdecode待ちも削りたいので、HTTPキャッシュだけでなくPCMも先に作る。
        for (const baseName of segment.files) {
          const pcm = await decodeFixedAudioToPcm(baseName);
          if (pcm) break;
        }
        continue;
      }
    }

    const normalized = normalizeSpeechText(segment.text).trim();
    if (!normalized || !hasSpeakableCharacters(normalized)) continue;

    await prefetchMatcha(normalized, {
      speedScale: common.baseRate,
      volume: common.volume,
    });
  }

  const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  console.log("[TTS PREFETCH] ready", {
    voice: getSelectedMatchaVoice(),
    speedScale: Number(common.baseRate.toFixed(3)),
    totalMs: Math.round((finishedAt - prefetchStartedAt) * 10) / 10,
    textPreview: originalText.replace(/\s+/g, " ").slice(0, 48),
  });
}

export async function prewarmTTS(): Promise<void> {
  if (getTtsEngine() !== "matcha") return;

  try {
    await prewarmMatcha();
  } catch (error) {
    // 起動時準備はバックグラウンド処理。失敗してもUIや読み上げボタンを塞がない。
    console.warn("[TTS] background prewarm failed:", error);
  }
}

export function stop() {
  sessionCounter++;
  stopFixedAudio();
  stopMatcha();
  speaking = false;
  hardCancelSpeechSynthesis();
}

export function isSpeaking() {
  return speaking;
}

// 既存画面からの先読み呼び出しを有効化。
// 起動直後のUI描画を邪魔しないよう、少し遅らせてAI音声の準備を開始する。
if (typeof window !== "undefined") {
  (
    window as typeof window & {
      prefetchTTS?: (text: string) => void;
    }
  ).prefetchTTS = (text: string) => {
    void prefetchTTS(text);
  };

  const startBackgroundPrewarm = () => {
    if (getTtsEngine() !== "matcha") return;
    void prewarmTTS();
  };

  // Phase 1高速化: モジュール読込直後の次タスクで準備開始。
  // UI操作は止めない。1スレッドWorkerなので4スレッド時のSession作成停止は起こさない。
  window.setTimeout(startBackgroundPrewarm, 0);
}
