import * as ort from "onnxruntime-web/wasm";
import { PiperPlus } from "piper-plus";

type PiperSpeakOptions = {
  speedScale?: number;
  volume?: number;
};

type PiperProgressInfo = {
  stage?: string;
  progress?: number;
  message?: string;
};

export type PiperModelId = `easy-announce-${number}`;

export type PiperModelInfo = {
  id: PiperModelId;
  index: number;
  label: string;
  path: string;
};

const PIPER_MODEL_SCAN_MAX = 20;

// 表示名はここだけ変更すればOK。
// 未定義の番号は「AI音声（ウグイス嬢N）」で自動表示される。
const PIPER_MODEL_LABELS: Record<number, string> = {
  1: "AI音声（ウグイス嬢風）",
  2: "AI音声（ハマスタ風）",
  3: "AI音声（千葉マリン風）",
};


export function makePiperModelInfo(index: number): PiperModelInfo {
  const safeIndex = Math.max(1, Math.floor(index));

  return {
    id: `easy-announce-${safeIndex}` as PiperModelId,
    index: safeIndex,
    label: PIPER_MODEL_LABELS[safeIndex] ?? `AI音声（ウグイス嬢${safeIndex}）`,
    path: `/models/easy-announce/uguisu${safeIndex}/easy_announce.onnx`,
  };
}

// 既存コードとの互換用。
// 1・2は常に定義し、3以降は discoverPiperModels() で自動検出する。
export const PIPER_MODELS = {
  "easy-announce-1": makePiperModelInfo(1),
  "easy-announce-2": makePiperModelInfo(2),
} as const;

let discoveredPiperModelsPromise: Promise<PiperModelInfo[]> | null = null;

/**
 * public/models/easy-announce/uguisu1 ～ uguisu20 を確認し、
 * easy_announce.onnx が存在するフォルダだけを返す。
 *
 * Vercel / PWA ではフォルダ一覧を直接取得できないため、
 * 各モデルファイルへ HEAD リクエストして存在確認する。
 */
export function discoverPiperModels(
  maxIndex = PIPER_MODEL_SCAN_MAX
): Promise<PiperModelInfo[]> {
  if (discoveredPiperModelsPromise) {
    return discoveredPiperModelsPromise;
  }

  discoveredPiperModelsPromise = (async () => {
    const indexes = Array.from(
      { length: Math.max(2, maxIndex) },
      (_, i) => i + 1
    );

    const checks = await Promise.all(
      indexes.map(async (index) => {
        const info = makePiperModelInfo(index);

        try {
          const url = new URL(
            info.path,
            window.location.origin
          ).href;

          const response = await fetch(url, {
            method: "HEAD",
            cache: "no-store",
          });

          return response.ok ? info : null;
        } catch {
          return null;
        }
      })
    );

    const found = checks
      .filter((item): item is PiperModelInfo => item !== null)
      .sort((a, b) => a.index - b.index);

    // 通信失敗時でも、現在運用中の1・2は設定画面から消さない。
    if (found.length === 0) {
      return [
        makePiperModelInfo(1),
        makePiperModelInfo(2),
      ];
    }

    return found;
  })();

  return discoveredPiperModelsPromise;
}

type PiperProgressListener = (info: PiperProgressInfo) => void;
type PiperDiagnosticListener = (logs: string[]) => void;

// 本番版: 診断ログ表示は無効
export function showPiperDiagnosticPanel() {}
export function hidePiperDiagnosticPanel() {}
export function setPiperDiagnosticListener(
  _listener: PiperDiagnosticListener | null
) {}
export function getPiperDiagnosticLogs(): string[] {
  return [];
}
export function getPiperDiagnosticText(): string {
  return "";
}
export function clearPiperDiagnosticLogs() {}

function addPiperDiagnostic(
  _message: string,
  _detail?: unknown
) {}

let piperProgressListener: PiperProgressListener | null = null;

function normalizePiperModelId(
  model: PiperModelId | string | null | undefined
): PiperModelId {
  const match = String(model ?? "").match(/^easy-announce-(\d+)$/);
  const index = match ? Number(match[1]) : 1;

  return `easy-announce-${Math.max(1, Math.floor(index || 1))}` as PiperModelId;
}

function loadSelectedPiperModel(): PiperModelId {
  try {
    return normalizePiperModelId(
      localStorage.getItem("tts:piper:model")
    );
  } catch {}

  return "easy-announce-1";
}

let selectedPiperModel: PiperModelId = loadSelectedPiperModel();
let enginePromise: Promise<any> | null = null;

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;

// iPhone / iPad Safari は WebAudio の再生制限が厳しいため、
// iOSだけ HTMLAudioElement を使う専用再生経路を持つ。
let iosAudioElement: HTMLAudioElement | null = null;
let iosAudioObjectUrl: string | null = null;

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";

  return /iP(hone|ad|od)/.test(ua) ||
    (
      /Macintosh/.test(ua) &&
      typeof document !== "undefined" &&
      "ontouchend" in document
    );
}

let generationId = 0;

type SynthesizedChunk = {
  samples: Float32Array;
  sampleRate: number;
};

// 生成済み音声を少量だけメモリに保持。
// 低スペック端末で同じ文言を再度読む時の再推論を避ける。
const synthesizedCache = new Map<string, SynthesizedChunk>();
const synthesizedCacheOrder: string[] = [];
const MAX_SYNTH_CACHE_ITEMS = 8;

function makeSynthCacheKey(
  text: string,
  speedScale: number
) {
  // モデルごとに別キャッシュにする。
  return `${selectedPiperModel}::${speedScale.toFixed(3)}::${text}`;
}

function putSynthCache(
  key: string,
  value: SynthesizedChunk
) {
  if (synthesizedCache.has(key)) {
    const idx = synthesizedCacheOrder.indexOf(key);
    if (idx >= 0) synthesizedCacheOrder.splice(idx, 1);
  }

  synthesizedCache.set(key, value);
  synthesizedCacheOrder.push(key);

  while (synthesizedCacheOrder.length > MAX_SYNTH_CACHE_ITEMS) {
    const oldest = synthesizedCacheOrder.shift();
    if (oldest) synthesizedCache.delete(oldest);
  }
}

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.max(min, Math.min(max, value));
}

function getModelUrl(): string {
  const match =
    selectedPiperModel.match(/^easy-announce-(\d+)$/);

  const index =
    match ? Number(match[1]) : 1;

  const model =
    makePiperModelInfo(index);

  return new URL(
    model.path,
    window.location.origin
  ).href;
}

function getAudioContext(): AudioContext {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error(
      "このブラウザではAudioContextを利用できません。"
    );
  }

  audioContext = new AudioContextCtor();

  addPiperDiagnostic(
    "[AudioContext] 作成",
    {
      state: audioContext.state,
      sampleRate: audioContext.sampleRate,
    }
  );

  return audioContext;
}

/**
 * iPhone / iPad Safari 用:
 * ユーザーのタップと同じ同期処理内で HTMLAudioElement をアンロックする。
 */
export function unlockPiperAudioForIOS(): void {
  if (!isIOSDevice()) return;

  try {
    if (!iosAudioElement) {
      iosAudioElement = new Audio();
      iosAudioElement.preload = "auto";
      iosAudioElement.playsInline = true;
    }

    const silentWav =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=";

    iosAudioElement.src = silentWav;
    iosAudioElement.volume = 0;

    const p = iosAudioElement.play();

    if (p && typeof p.catch === "function") {
      void p.catch(() => {});
    }
  } catch {
    // ignore
  }
}

function float32ToWavBlob(
  samples: Float32Array,
  sampleRate: number
): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (
    offset: number,
    value: string
  ) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(
        offset + i,
        value.charCodeAt(i)
      );
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(
    28,
    sampleRate * bytesPerSample,
    true
  );
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;

  for (
    let i = 0;
    i < samples.length;
    i++, offset += 2
  ) {
    const s = Math.max(
      -1,
      Math.min(1, samples[i])
    );

    view.setInt16(
      offset,
      s < 0
        ? s * 0x8000
        : s * 0x7fff,
      true
    );
  }

  return new Blob(
    [buffer],
    { type: "audio/wav" }
  );
}

async function playSamplesIOS(
  samples: Float32Array,
  sampleRate: number,
  volume: number,
  myGenerationId: number
): Promise<void> {
  if (myGenerationId !== generationId) return;

  if (!iosAudioElement) {
    iosAudioElement = new Audio();
    iosAudioElement.preload = "auto";
    iosAudioElement.playsInline = true;
  }

  try {
    iosAudioElement.pause();
  } catch {}

  if (iosAudioObjectUrl) {
    try {
      URL.revokeObjectURL(iosAudioObjectUrl);
    } catch {}

    iosAudioObjectUrl = null;
  }

  const blob = float32ToWavBlob(
    samples,
    sampleRate
  );

  iosAudioObjectUrl =
    URL.createObjectURL(blob);

  iosAudioElement.src =
    iosAudioObjectUrl;

  iosAudioElement.volume =
    clamp(volume, 0, 1);

  await new Promise<void>(
    (resolve, reject) => {
      if (!iosAudioElement) {
        resolve();
        return;
      }

      const audio = iosAudioElement;

      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };

      audio.onerror = () => {
        cleanup();
        reject(
          new Error(
            "iPhoneでAI音声の再生に失敗しました。"
          )
        );
      };

      const p = audio.play();

      if (
        p &&
        typeof p.catch === "function"
      ) {
        void p.catch((error) => {
          cleanup();
          reject(error);
        });
      }
    }
  );
}

async function resumeAudioContext() {
  let ctx = getAudioContext();

  addPiperDiagnostic(
    "[AudioContext] resume前",
    ctx.state
  );

  try {
    if (ctx.state === "closed") {
      audioContext = null;
      ctx = getAudioContext();
    }

    if (ctx.state !== "running") {
      await ctx.resume();
    }
  } catch (error) {
    addPiperDiagnostic(
      "[AudioContext] resume失敗、再作成",
      error
    );

    try {
      await ctx.close();
    } catch {}

    audioContext = null;
    ctx = getAudioContext();

    try {
      await ctx.resume();
    } catch (retryError) {
      addPiperDiagnostic(
        "[AudioContext] 再作成後のresume失敗",
        retryError
      );
    }
  }

  return ctx;
}

export function setSelectedPiperModel(
  model: PiperModelId | string
) {
  const nextModel =
    normalizePiperModelId(model);

  if (selectedPiperModel !== nextModel) {
    // 再生中の旧モデル音声を停止。
    stopPiper();

    selectedPiperModel = nextModel;

    // 旧モデルのエンジンを破棄し、
    // 次回に新しいONNXを初期化する。
    enginePromise = null;

    // 別モデルの生成済み音声を残さない。
    clearPiperAudioCache();
  }

  try {
    localStorage.setItem(
      "tts:piper:model",
      selectedPiperModel
    );
  } catch {}
}

export function setPiperProgressListener(
  listener: PiperProgressListener | null
) {
  piperProgressListener = listener;
}

async function getEngine() {
  ort.env.wasm.proxy = false;
  ort.env.wasm.numThreads = 1;

  const origin =
    window.location.origin;

  ort.env.wasm.wasmPaths = {
    wasm:
      `${origin}/ort/ort-wasm-simd-threaded.wasm`,
    mjs:
      `${origin}/ort/ort-wasm-simd-threaded.mjs`,
  } as any;

  if (!enginePromise) {
    const modelUrl = getModelUrl();

    addPiperDiagnostic(
      "[Piper] 初期化開始",
      {
        model: selectedPiperModel,
        modelUrl,
      }
    );

    const wasmG2pUrl =
      new URL(
        "/piper-wasm/piper_plus_wasm.js",
        window.location.origin
      ).href;

    enginePromise =
      PiperPlus.initialize({
        model: modelUrl,
        ort,
        wasmG2pUrl,
        onProgress: (
          info: PiperProgressInfo
        ) => {
          try {
            piperProgressListener?.(info);
          } catch {}

          addPiperDiagnostic(
            "[Piper] progress",
            {
              stage: info.stage,
              progress: info.progress,
              message: info.message,
            }
          );
        },
      })
        .then((engine: any) => {
          addPiperDiagnostic(
            "[Piper] 初期化完了",
            selectedPiperModel
          );

          return engine;
        })
        .catch(
          (error: unknown) => {
            enginePromise = null;

            console.error(
              "[Piper-Plus] initialization failed:",
              error
            );

            throw error;
          }
        );
  }

  return enginePromise;
}

/**
 * 長文をPiper用に分割する。
 */
function splitPiperText(
  text: string
): string[] {
  const source = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!source) return [];

  const chunks: string[] = [];
  let rest = source;
  let first = true;

  const protectedWords = [
    "ください",
    "行います",
    "いたします",
    "お願いします",
    "お知らせいたします",
    "お知らせ致します",
    "代わりまして",
    "入ります",
    "入りまして",
    "そのまま入り",
  ];

  const moveCutAfterProtectedWord = (
    target: string,
    cut: number
  ): number => {
    for (
      const word of protectedWords
    ) {
      let start =
        target.indexOf(word);

      while (start !== -1) {
        const end =
          start + word.length;

        if (
          start < cut &&
          cut < end
        ) {
          return end;
        }

        start =
          target.indexOf(
            word,
            start + 1
          );
      }
    }

    return cut;
  };

  while (rest.length > 0) {
    const maxLen =
      first ? 22 : 42;

    if (rest.length <= maxLen) {
      chunks.push(rest.trim());
      break;
    }

    const searchLen =
      Math.min(
        rest.length,
        maxLen + 10
      );

    const head =
      rest.slice(0, searchLen);

    let cut = -1;

    const sentenceBreaks = [
      head.lastIndexOf("。"),
      head.lastIndexOf("！"),
      head.lastIndexOf("？"),
      head.lastIndexOf("!"),
      head.lastIndexOf("?"),
      head.lastIndexOf("\n"),
    ];

    const sentenceCut =
      Math.max(...sentenceBreaks);

    if (
      sentenceCut >=
      Math.floor(maxLen * 0.4)
    ) {
      cut =
        sentenceCut + 1;
    }

    if (cut < 0) {
      const commaBreaks = [
        head.lastIndexOf("、"),
        head.lastIndexOf("，"),
        head.lastIndexOf(","),
      ];

      const commaCut =
        Math.max(...commaBreaks);

      if (
        commaCut >=
        Math.floor(maxLen * 0.45)
      ) {
        cut =
          commaCut + 1;
      }
    }

    if (cut < 0) {
      const preferredWords = [
        "ください",
        "行います",
        "いたします",
        "お願いします",
        "代わりまして",
        "入ります",
        "くん",
        "さん",
        "選手",
      ];

      let bestCut = -1;

      for (
        const word of preferredWords
      ) {
        const pos =
          head.lastIndexOf(word);

        if (
          pos >=
          Math.floor(maxLen * 0.45)
        ) {
          const candidate =
            pos + word.length;

          if (candidate > bestCut) {
            bestCut = candidate;
          }
        }
      }

      if (bestCut > 0) {
        cut = bestCut;
      }
    }

    if (cut < 0) {
      const spaceCut =
        head.lastIndexOf(" ");

      if (
        spaceCut >=
        Math.floor(maxLen * 0.5)
      ) {
        cut =
          spaceCut + 1;
      }
    }

    if (cut < 0) {
      cut = maxLen;
    }

    cut =
      moveCutAfterProtectedWord(
        rest,
        cut
      );

    cut = Math.max(
      1,
      Math.min(
        cut,
        rest.length
      )
    );

    const chunk =
      rest
        .slice(0, cut)
        .trim();

    if (chunk) {
      chunks.push(chunk);
    }

    rest =
      rest
        .slice(cut)
        .trimStart();

    first = false;
  }

  return chunks.filter(Boolean);
}

async function synthesizeChunk(
  engine: any,
  text: string,
  speedScale: number,
  myGenerationId: number
): Promise<SynthesizedChunk | null> {
  if (
    myGenerationId !== generationId
  ) {
    return null;
  }

  const cacheKey =
    makeSynthCacheKey(
      text,
      speedScale
    );

  const cached =
    synthesizedCache.get(
      cacheKey
    );

  if (cached) {
    return cached;
  }

  let result: any;

  try {
    result =
      await engine.synthesize(
        text,
        {
          language: "ja",
          lengthScale:
            1 / speedScale,
        }
      );
  } catch (error) {
    throw error;
  }

  if (
    myGenerationId !== generationId
  ) {
    return null;
  }

  if (
    !result ||
    !result.samples
  ) {
    throw new Error(
      "Piper-Plusから音声データが返されませんでした。"
    );
  }

  const samples =
    result.samples instanceof Float32Array
      ? result.samples
      : new Float32Array(
          result.samples
        );

  const sampleRate =
    Number(
      result.sampleRate || 22050
    );

  const synthesized = {
    samples,
    sampleRate,
  };

  putSynthCache(
    cacheKey,
    synthesized
  );

  return synthesized;
}

async function playSamples(
  samples: Float32Array,
  sampleRate: number,
  volume: number,
  myGenerationId: number
) {
  if (isIOSDevice()) {
    await playSamplesIOS(
      samples,
      sampleRate,
      volume,
      myGenerationId
    );

    return;
  }

  const ctx =
    await resumeAudioContext();

  if (
    myGenerationId !== generationId
  ) {
    return;
  }

  try {
    currentSource?.stop();
  } catch {}

  try {
    currentSource?.disconnect();
  } catch {}

  try {
    currentGain?.disconnect();
  } catch {}

  const buffer =
    ctx.createBuffer(
      1,
      samples.length,
      sampleRate
    );

  buffer.copyToChannel(
    samples,
    0
  );

  const source =
    ctx.createBufferSource();

  const gain =
    ctx.createGain();

  gain.gain.value =
    clamp(volume, 0, 1);

  source.buffer = buffer;

  source.connect(gain);
  gain.connect(ctx.destination);

  currentSource = source;
  currentGain = gain;

  await new Promise<void>(
    (resolve, reject) => {
      source.onended = () => {
        if (
          currentSource === source
        ) {
          currentSource = null;
          currentGain = null;
        }

        resolve();
      };

      try {
        source.start();
      } catch (error) {
        if (
          currentSource === source
        ) {
          currentSource = null;
          currentGain = null;
        }

        reject(error);
      }
    }
  );
}

export async function speakPiper(
  text: string,
  options: PiperSpeakOptions = {}
): Promise<void> {
  const cleanText =
    String(text ?? "").trim();

  if (!cleanText) return;

  const myGenerationId =
    ++generationId;

  if (!isIOSDevice()) {
    await resumeAudioContext();
  }

  let engine: any;

  try {
    engine =
      await getEngine();
  } catch (error) {
    throw error;
  }

  if (
    myGenerationId !== generationId
  ) {
    return;
  }

  const speedScale =
    Number.isFinite(
      options.speedScale
    )
      ? clamp(
          Number(
            options.speedScale
          ),
          0.25,
          2.0
        )
      : 1.0;

  const volume =
    Number.isFinite(
      options.volume
    )
      ? clamp(
          Number(
            options.volume
          ),
          0,
          1
        )
      : 0.8;

  const chunks =
    splitPiperText(cleanText);

  if (!chunks.length) {
    return;
  }

  let nextChunkPromise =
    synthesizeChunk(
      engine,
      chunks[0],
      speedScale,
      myGenerationId
    );

  for (
    let i = 0;
    i < chunks.length;
    i++
  ) {
    const current =
      await nextChunkPromise;

    if (
      myGenerationId !== generationId ||
      !current
    ) {
      return;
    }

    if (
      i + 1 <
      chunks.length
    ) {
      nextChunkPromise =
        synthesizeChunk(
          engine,
          chunks[i + 1],
          speedScale,
          myGenerationId
        );
    }

    await playSamples(
      current.samples,
      current.sampleRate,
      volume,
      myGenerationId
    );

    if (
      myGenerationId !== generationId
    ) {
      return;
    }
  }
}

/**
 * 読み上げ予定の文章を先に生成してキャッシュする。
 */
export async function prefetchPiper(
  text: string,
  options: PiperSpeakOptions = {}
): Promise<void> {
  const cleanText =
    String(text ?? "").trim();

  if (!cleanText) return;

  const speedScale =
    Number.isFinite(
      options.speedScale
    )
      ? clamp(
          Number(
            options.speedScale
          ),
          0.25,
          2.0
        )
      : 1.0;

  try {
    const engine =
      await getEngine();

    const chunks =
      splitPiperText(cleanText);

    for (
      const chunk of
      chunks.slice(0, 2)
    ) {
      const key =
        makeSynthCacheKey(
          chunk,
          speedScale
        );

      if (
        synthesizedCache.has(key)
      ) {
        continue;
      }

      const result =
        await engine.synthesize(
          chunk,
          {
            language: "ja",
            lengthScale:
              1 / speedScale,
          }
        );

      if (
        !result?.samples
      ) {
        continue;
      }

      const samples =
        result.samples instanceof Float32Array
          ? result.samples
          : new Float32Array(
              result.samples
            );

      const sampleRate =
        Number(
          result.sampleRate ||
          22050
        );

      putSynthCache(
        key,
        {
          samples,
          sampleRate,
        }
      );
    }
  } catch (error) {
    console.warn(
      "Piper prefetch failed:",
      error
    );
  }
}

export function clearPiperAudioCache() {
  synthesizedCache.clear();
  synthesizedCacheOrder.length = 0;
}

export function stopPiper() {
  generationId++;

  try {
    iosAudioElement?.pause();
  } catch {}

  if (iosAudioElement) {
    try {
      iosAudioElement.currentTime = 0;
    } catch {}
  }

  if (iosAudioObjectUrl) {
    try {
      URL.revokeObjectURL(
        iosAudioObjectUrl
      );
    } catch {}

    iosAudioObjectUrl = null;
  }

  try {
    currentSource?.stop();
  } catch {}

  try {
    currentSource?.disconnect();
  } catch {}

  try {
    currentGain?.disconnect();
  } catch {}

  currentSource = null;
  currentGain = null;
}

export async function prewarmPiper(): Promise<void> {
  try {
    await getEngine();
  } catch (error) {
    throw error;
  }
}
