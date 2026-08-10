// src/lib/piperTts.ts
// Easyアナウンス 本番用 Piper-Plus ブラウザWASM版
// Vercel / PWA対応・PCローカルサーバー不要

import { PiperPlus } from "piper-plus";
import * as ort from "onnxruntime-web/wasm";

export type PiperModelId = "uguisu" | "tsukuyomi" | "css10";

export const PIPER_MODELS: Record<PiperModelId, {
  label: string;
  model: string;
  noiseScale: number;
  noiseW: number;
  needsUguisuConfigPatch?: boolean;
}> = {
  uguisu: {
    label: "ウグイス嬢（テスト）",
    model: "EasyAnnounce/easyannounce-uguisu",
    noiseScale: 0.4,
    noiseW: 0.5,
    needsUguisuConfigPatch: true,
  },
  tsukuyomi: {
    label: "つくよみちゃん",
    model: "ayousanz/piper-plus-tsukuyomi-chan",
    noiseScale: 0.667,
    noiseW: 0.8,
  },
  css10: {
    label: "CSS10 日本語女性",
    model: "ayousanz/piper-plus-css10-ja-6lang",
    noiseScale: 0.667,
    noiseW: 0.8,
  },
};

const DEFAULT_PIPER_MODEL: PiperModelId = "uguisu";

export function getSelectedPiperModel(): PiperModelId {
  const value = localStorage.getItem("tts:piper:model");
  return value === "tsukuyomi" || value === "css10" || value === "uguisu"
    ? value
    : DEFAULT_PIPER_MODEL;
}

export function setSelectedPiperModel(modelId: PiperModelId): void {
  localStorage.setItem("tts:piper:model", modelId);
}

/**
 * 今回の学習済みconfigは multilingual / 173音素ですが、
 * single-speaker fine-tuning後のconfigには language_id_map がありません。
 *
 * piper-plus@0.6.0 は language_id_map が無いと日本語をJS側G2Pへ回し、
 * @piper-plus/g2p の JapaneseG2P が openjtalkModule を要求します。
 *
 * 初期化時にHugging Faceのconfigだけを一時的に補正して、
 * Rust multilingual WASM G2Pを選ばせます。
 *
 * ONNX自体が lid 入力を持たない場合は、後段のrunパッチで lid を除去します。
 */
async function initializePiperModel(
  options: Parameters<typeof PiperPlus.initialize>[0],
  modelId: PiperModelId
): Promise<PiperPlus> {
  const originalFetch = globalThis.fetch.bind(globalThis);

  const patchedFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);

    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const shouldPatchUguisuConfig =
      modelId === "uguisu" &&
      url.includes("EasyAnnounce/easyannounce-uguisu") &&
      /config\.json(?:\?|$)/i.test(url);

    if (!shouldPatchUguisuConfig || !response.ok) {
      return response;
    }

    try {
      const json = await response.clone().json();

      // 日本語だけを使うEasyアナウンスでは ja のみで十分。
      // これにより piper-plus が Rust WASM G2P を初期化する。
      if (!json.language_id_map) {
        json.language_id_map = { ja: 0 };
      }

      return new Response(JSON.stringify(json), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  };

  globalThis.fetch = patchedFetch;

  try {
    return await PiperPlus.initialize(options);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

if (ort.env?.wasm) {
  // スマホ/PWAでは安定性を優先
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "";

  // vite.config.ts 側で /ort/ に配置したランタイムを使用
  ort.env.wasm.wasmPaths = {
    wasm: `${origin}/ort/ort-wasm-simd-threaded.wasm`,
    mjs: `${origin}/ort/ort-wasm-simd-threaded.mjs`,
  };
}

const enginePromises = new Map<PiperModelId, Promise<PiperPlus>>();
let currentAudio: HTMLAudioElement | null = null;
let synthInProgress = false;

export type PiperProgress = {
  stage: string;
  progress: number;
  message: string;
};

let progressListener: ((p: PiperProgress) => void) | null = null;

export function setPiperProgressListener(
  listener: ((p: PiperProgress) => void) | null
) {
  progressListener = listener;
}

function getMetaShape(meta: any): number[] | undefined {
  const shape = meta?.dimensions ?? meta?.shape ?? meta?.dims;
  return Array.isArray(shape) ? shape : undefined;
}

function findInputMeta(session: any, name: string): any {
  const metadata = session?.inputMetadata;
  if (!metadata) return undefined;

  if (Array.isArray(metadata)) {
    return metadata.find((m: any) => m?.name === name);
  }

  return metadata[name];
}

function positiveDim(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * piper-plus@0.6.0 の一部モデルでは
 * speaker_embedding / speaker_embedding_mask がONNX必須入力でも、
 * 通常の synthesize() では未指定になる場合がある。
 *
 * Easyアナウンスでは単一話者モデルを使用するため、
 * ゼロembedding + mask=0 を補完して既定話者で推論する。
 */
function patchSingleSpeakerInputs(engine: any): void {
  const session = engine?._session;
  if (!session || session.__easyAnnounceSpeakerPatch) return;

  const inputNames: string[] = Array.isArray(session.inputNames)
    ? session.inputNames
    : [];

  const needsEmbedding = inputNames.includes("speaker_embedding");
  const needsMask = inputNames.includes("speaker_embedding_mask");

  // 重要:
  // speaker_embedding が不要なモデルでも run() のパッチは必ず入れる。
  // 今回のウグイス嬢ONNXは lid 入力を持たない一方、
  // Rust multilingual G2Pを有効にするためconfig側には一時的に
  // language_id_map = { ja: 0 } を追加している。
  // PiperPlus._infer() はそのconfigを見て feeds.lid を作るため、
  // ORTへ渡す直前に未知の lid を削除する必要がある。
  const embeddingMeta = findInputMeta(session, "speaker_embedding");
  const embeddingShape = getMetaShape(embeddingMeta);

  const embeddingSize = positiveDim(
    embeddingShape?.[embeddingShape.length - 1],
    256
  );

  const originalRun = session.run.bind(session);

  session.run = async (feeds: Record<string, any>, ...args: any[]) => {
    const patchedFeeds: Record<string, any> = { ...feeds };

    // config補正で ja:0 を追加してRust G2Pを有効化するが、
    // single-speaker ONNXが lid 入力を持たない場合はORTへ渡さない。
    if (
      Object.prototype.hasOwnProperty.call(patchedFeeds, "lid") &&
      !inputNames.includes("lid")
    ) {
      console.debug("[Piper] removing unsupported lid input for single-speaker ONNX");
      delete patchedFeeds.lid;
    }

    if (needsEmbedding && !patchedFeeds.speaker_embedding) {
      patchedFeeds.speaker_embedding = new ort.Tensor(
        "float32",
        new Float32Array(embeddingSize),
        [1, embeddingSize]
      );
    }

    if (needsMask && !patchedFeeds.speaker_embedding_mask) {
      patchedFeeds.speaker_embedding_mask = new ort.Tensor(
        "int64",
        new BigInt64Array([0n]),
        [1, 1]
      );
    }

    return originalRun(patchedFeeds, ...args);
  };

  session.__easyAnnounceSpeakerPatch = true;
}

async function getEngine(modelId: PiperModelId = getSelectedPiperModel()): Promise<PiperPlus> {
  const existing = enginePromises.get(modelId);
  if (existing) return existing;

  if (!ort.InferenceSession) {
    throw new Error("Piper-Plusの音声エンジンを初期化できませんでした。");
  }

  const config = PIPER_MODELS[modelId];

  const promise = initializePiperModel({
    model: config.model,
    ort,
    onProgress: ({ stage, progress, message }) => {
      progressListener?.({ stage, progress, message });
    },
  } as any, modelId)
    .then((engine) => {
      patchSingleSpeakerInputs(engine as any);
      return engine;
    })
    .catch((error) => {
      enginePromises.delete(modelId);
      console.error(`[Piper:${modelId}] initialize failed:`, error);
      throw error;
    });

  enginePromises.set(modelId, promise);
  return promise;
}

/**
 * モデルを先読みする。
 * Piper選択時に設定画面で呼んでおくと、実際のアナウンス開始が速くなる。
 */
export async function prewarmPiper(modelId: PiperModelId = getSelectedPiperModel()): Promise<void> {
  const engine = await getEngine(modelId);
  patchSingleSpeakerInputs(engine as any);
}

export function stopPiper(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}

    currentAudio = null;
  }
}

export function isPiperBusy(): boolean {
  return synthInProgress;
}

type PiperSpeakOptions = { speedScale?: number; volume?: number; modelId?: PiperModelId };


/**
 * Easyアナウンス専用読み補正。
 * 表示文は変えず、Piperへ渡す文字列だけ補正する。
 */
function normalizeBaseballReading(text: string): string {
  return String(text)
    .replace(/([0-9０-９一二三四五六七八九十]+)\s*回\s*の\s*表/g, "$1回のおもて")
    .replace(/([0-9０-９一二三四五六七八九十]+)\s*回\s*表/g, "$1回おもて")
    .replace(/([0-9０-９一二三四五六七八九十]+)\s*回\s*の\s*裏/g, "$1回のうら")
    .replace(/([0-9０-９一二三四五六七八九十]+)\s*回\s*裏/g, "$1回うら");
}

function splitPiperText(text: string, maxChars = 26): string[] {
  const normalized = text.replace(/\r?\n+/g, "。").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^。！？!?、，,]+[。！？!?、，,]?/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const s = current.trim();
    if (s) chunks.push(s);
    current = "";
  };

  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;

    if ((current + part).length <= maxChars) {
      current += part;
      continue;
    }
    flush();

    if (part.length <= maxChars) {
      current = part;
      continue;
    }

    let rest = part;
    while (rest.length > maxChars) {
      let cut = maxChars;
      const w = rest.slice(0, maxChars + 1);
      for (const token of ["、", "，", ",", " "]) {
        const pos = w.lastIndexOf(token);
        if (pos >= Math.floor(maxChars * 0.55)) {
          cut = pos + token.length;
          break;
        }
      }
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) current = rest;
  }
  flush();
  return chunks;
}

async function synthesizePiperChunk(
  engine: PiperPlus,
  text: string,
  speedScale: number,
  modelId: PiperModelId
): Promise<Blob> {
  patchSingleSpeakerInputs(engine as any);
  const lengthScale = Math.min(2, Math.max(0.5, 1 / speedScale));
  const modelConfig = PIPER_MODELS[modelId];
  const result = await engine.synthesize(text, {
    language: "ja",
    noiseScale: modelConfig.noiseScale,
    lengthScale,
    noiseW: modelConfig.noiseW,
  });
  return result.toBlob();
}

async function playPiperBlob(blob: Blob, volume: number): Promise<void> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  audio.preload = "auto";
  audio.volume = volume;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new Error("Piper-Plus音声の再生に失敗しました。")); };
    audio.play().catch((e) => { cleanup(); reject(e); });
  });
}

/**
 * 長文低遅延版:
 * 最初の短いチャンクだけ生成して再生開始し、
 * 再生中に次チャンクを先行生成する。
 */
export async function speakPiper(
  text: string,
  options: PiperSpeakOptions = {}
): Promise<void> {
  if (!text?.trim() || synthInProgress) return;

  synthInProgress = true;
  stopPiper();

  try {
    const modelId = options.modelId ?? getSelectedPiperModel();
    const engine = await getEngine(modelId);
    patchSingleSpeakerInputs(engine as any);

    const speedScale = Math.min(2, Math.max(0.5, Number(options.speedScale ?? 1)));
    const volume = Math.min(1, Math.max(0, Number(options.volume ?? 0.8)));
    const chunks = splitPiperText(normalizeBaseballReading(text));
    if (!chunks.length) return;

    // 1チャンク目だけ待つので、長文全体の生成完了を待たない
    let nextBlobPromise = synthesizePiperChunk(engine, chunks[0], speedScale, modelId);

    for (let i = 0; i < chunks.length; i++) {
      const blob = await nextBlobPromise;

      // 再生中に次の音声を生成
      if (i + 1 < chunks.length) {
        nextBlobPromise = synthesizePiperChunk(engine, chunks[i + 1], speedScale, modelId);
      }

      await playPiperBlob(blob, volume);
    }
  } finally {
    synthInProgress = false;
  }
}
