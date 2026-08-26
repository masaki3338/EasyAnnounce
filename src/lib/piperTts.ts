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

  if (ctx.state === "suspended") {
    await ctx.resume();
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

        if (import.meta.env.DEV) {
          console.log(
            "[Piper-Plus]",
            info.stage,
            info.progress,
            info.message
          );
        }
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

  const result =
    await engine.synthesize(
      cleanText,
      {
        language: "ja",
        lengthScale:
          1 / speedScale,
      }
    );

  if (
    myGenerationId !== generationId
  ) {
    return;
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
      result.sampleRate ||
        22050
    );

  await playSamples(
    samples,
    sampleRate,
    volume,
    myGenerationId
  );
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
  await resumeAudioContext();
  await getEngine();
}
