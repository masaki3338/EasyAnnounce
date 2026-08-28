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

export type PiperModelId = "easy-announce";

export const PIPER_MODELS = {
  "easy-announce": {
    id: "easy-announce" as PiperModelId,
    label: "Easyアナウンス AI音声（Piper-Plus）",
  },
} as const;

type PiperProgressListener = (info: PiperProgressInfo) => void;

const MODEL_PATH = "/models/easy-announce/easy_announce.onnx";

let piperProgressListener: PiperProgressListener | null = null;
let selectedPiperModel: PiperModelId = "easy-announce";

let enginePromise: Promise<any> | null = null;

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;

let generationId = 0;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getModelUrl(): string {
  return new URL(MODEL_PATH, window.location.origin).href;
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

  return audioContext;
}

async function resumeAudioContext() {
  const ctx = getAudioContext();

  if (ctx.state !== "running") {
    await ctx.resume();
  }

  if (ctx.state !== "running") {
    throw new Error(
      `AudioContextを開始できませんでした。state=${ctx.state}`
    );
  }

  return ctx;
}

export function setSelectedPiperModel(
  model: PiperModelId | string
) {
  selectedPiperModel =
    model === "easy-announce"
      ? "easy-announce"
      : "easy-announce";

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

  // ★ 本番VercelでもORTを確実に取得
  ort.env.wasm.wasmPaths = "/ort/";

  console.log("[Piper-Plus] ORT wasmPaths:", ort.env.wasm.wasmPaths);

  if (!enginePromise) {
    const modelUrl = getModelUrl();

    console.log(
      "[Piper-Plus] model URL:",
      modelUrl
    );

    enginePromise = PiperPlus.initialize({
      model: modelUrl,
      ort,
      onProgress: (
        info: PiperProgressInfo
      ) => {
        try {
          piperProgressListener?.(info);
        } catch {}

        // ★ 本番でも確認できるようDEV判定を外す
        console.log(
          "[Piper-Plus]",
          info.stage,
          info.progress,
          info.message
        );
      },
    }).catch((error: unknown) => {
      enginePromise = null;

      console.error(
        "[Piper-Plus] initialization failed:",
        error
      );

      throw error;
    });
  }

  return enginePromise;
}

/**
 * 長文をPiper用に分割する。
 *
 * ポイント:
 * - 1つ目は短めにして、読み上げ開始までの待ち時間を減らす
 * - 「、」「。」など自然な区切りを優先する
 * - 区切りが全くない長文だけ最大文字数で分割する
 */
function splitPiperText(text: string): string[] {
  const source = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!source) return [];

  const chunks: string[] = [];
  let rest = source;
  let first = true;

  while (rest.length > 0) {
    const maxLen = first ? 22 : 42;

    if (rest.length <= maxLen) {
      chunks.push(rest.trim());
      break;
    }

    const head = rest.slice(0, maxLen + 1);

    // まず文末を優先
    const sentenceBreaks = [
      head.lastIndexOf("。"),
      head.lastIndexOf("！"),
      head.lastIndexOf("？"),
      head.lastIndexOf("!"),
      head.lastIndexOf("?"),
      head.lastIndexOf("\n"),
    ];

    let cut = Math.max(...sentenceBreaks);

    // 文末が無ければ読点・空白を使う
    if (cut < Math.floor(maxLen * 0.45)) {
      const softBreaks = [
        head.lastIndexOf("、"),
        head.lastIndexOf("，"),
        head.lastIndexOf(","),
        head.lastIndexOf(" "),
      ];
      cut = Math.max(...softBreaks);
    }

    // 不自然に短すぎる位置しか無い場合は最大長で切る
    if (cut < Math.floor(maxLen * 0.35)) {
      cut = maxLen - 1;
    }

    // 区切り文字を前チャンク側に含める
    const end = cut + 1;
    const chunk = rest.slice(0, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    rest = rest.slice(end).trimStart();
    first = false;
  }

  return chunks.filter(Boolean);
}

type SynthesizedChunk = {
  samples: Float32Array;
  sampleRate: number;
};

async function synthesizeChunk(
  engine: any,
  text: string,
  speedScale: number,
  myGenerationId: number
): Promise<SynthesizedChunk | null> {
  if (myGenerationId !== generationId) {
    return null;
  }

  const result = await engine.synthesize(
    text,
    {
      language: "ja",
      lengthScale: 1 / speedScale,
    }
  );

  if (myGenerationId !== generationId) {
    return null;
  }

  if (!result || !result.samples) {
    throw new Error(
      "Piper-Plusから音声データが返されませんでした。"
    );
  }

  return {
    samples:
      result.samples instanceof Float32Array
        ? result.samples
        : new Float32Array(result.samples),
    sampleRate: Number(result.sampleRate || 22050),
  };
}

async function playSamples(
  samples: Float32Array,
  sampleRate: number,
  volume: number,
  myGenerationId: number
) {
  const ctx = await resumeAudioContext();

  if (myGenerationId !== generationId) {
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

  const buffer = ctx.createBuffer(
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
        if (currentSource === source) {
          currentSource = null;
          currentGain = null;
        }

        resolve();
      };

      try {
        source.start();
      } catch (error) {
        if (currentSource === source) {
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

  if (!cleanText) {
    return;
  }

  const myGenerationId =
    ++generationId;

  await resumeAudioContext();

  const engine =
    await getEngine();

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
          0.5,
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

  const chunks = splitPiperText(cleanText);

  if (!chunks.length) {
    return;
  }

  /*
   * 低遅延再生:
   * 1. 最初の短いチャンクだけ生成
   * 2. できたらすぐ再生
   * 3. 再生中に次チャンクを先行生成
   *
   * これにより長文全体の生成完了を待たずに読み上げを開始できる。
   */
  let nextChunkPromise =
    synthesizeChunk(
      engine,
      chunks[0],
      speedScale,
      myGenerationId
    );

  for (let i = 0; i < chunks.length; i++) {
    const current =
      await nextChunkPromise;

    if (
      myGenerationId !== generationId ||
      !current
    ) {
      return;
    }

    // 現在チャンクを再生する前に、次の生成を開始しておく。
    // AudioContext再生中に次のPiper推論を進める。
    if (i + 1 < chunks.length) {
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

export function stopPiper() {
  generationId++;

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
  await getEngine();
}
