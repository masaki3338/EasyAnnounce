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

type PiperDiagnosticListener = (logs: string[]) => void;

// 診断表示は本番版では無効化。
// 既存画面から参照されていてもエラーにならないよう、公開関数だけ残す。
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

  addPiperDiagnostic(
    "[AudioContext] 作成",
    {
      state: audioContext.state,
      sampleRate: audioContext.sampleRate,
    }
  );

  return audioContext;
}

async function resumeAudioContext() {
  let ctx = getAudioContext();

  addPiperDiagnostic(
    "[AudioContext] resume前",
    ctx.state
  );

  try {
    if (ctx.state === "closed") {
      addPiperDiagnostic(
        "[AudioContext] closedのため再作成"
      );

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

  addPiperDiagnostic(
    "[AudioContext] resume後",
    ctx.state
  );

  if (ctx.state !== "running") {
    addPiperDiagnostic(
      "[警告] AudioContextがrunningではありません",
      ctx.state
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
  addPiperDiagnostic(
    "[ORT] wasmPaths",
    String(ort.env.wasm.wasmPaths)
  );

  if (!enginePromise) {
    const modelUrl = getModelUrl();

    addPiperDiagnostic(
      "[Piper] 初期化開始",
      modelUrl
    );

    const wasmG2pUrl = new URL(
      "/piper-wasm/piper_plus_wasm.js",
      window.location.origin
    ).href;

    addPiperDiagnostic(
      "[Piper] 日本語G2P WASM URL",
      wasmG2pUrl
    );

    // piper-plus の実装には wasmG2pUrl が存在するが、
    // 一部バージョンの型定義には未記載のため any で渡す。
    enginePromise = PiperPlus.initialize({
      model: modelUrl,
      ort,
      wasmG2pUrl,
      onProgress: (
        info: PiperProgressInfo
      ) => {
        try {
          piperProgressListener?.(info);
        } catch {}

        // ★ 本番でも確認できるようDEV判定を外す

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
          "[Piper] 初期化完了"
        );
        return engine;
      })
      .catch((error: unknown) => {
        enginePromise = null;

        console.error(
          "[Piper-Plus] initialization failed:",
          error
        );

        addPiperDiagnostic(
          "[Piper] 初期化失敗",
          error
        );

        throw error;
      });
  } else {
    addPiperDiagnostic(
      "[Piper] 初期化済みエンジンを再利用"
    );
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

  // 途中で絶対に切らない語句
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
    text: string,
    cut: number
  ): number => {
    for (const word of protectedWords) {
      let start = text.indexOf(word);

      while (start !== -1) {
        const end = start + word.length;

        if (start < cut && cut < end) {
          return end;
        }

        start = text.indexOf(word, start + 1);
      }
    }

    return cut;
  };

  while (rest.length > 0) {
    const maxLen = first ? 22 : 42;

    if (rest.length <= maxLen) {
      chunks.push(rest.trim());
      break;
    }

    const searchLen = Math.min(
      rest.length,
      maxLen + 10
    );

    const head = rest.slice(0, searchLen);
    let cut = -1;

    // 1. 文末を最優先
    const sentenceBreaks = [
      head.lastIndexOf("。"),
      head.lastIndexOf("！"),
      head.lastIndexOf("？"),
      head.lastIndexOf("!"),
      head.lastIndexOf("?"),
      head.lastIndexOf("\n"),
    ];

    const sentenceCut = Math.max(...sentenceBreaks);

    if (
      sentenceCut >=
      Math.floor(maxLen * 0.4)
    ) {
      cut = sentenceCut + 1;
    }

    // 2. 読点
    if (cut < 0) {
      const commaBreaks = [
        head.lastIndexOf("、"),
        head.lastIndexOf("，"),
        head.lastIndexOf(","),
      ];

      const commaCut = Math.max(...commaBreaks);

      if (
        commaCut >=
        Math.floor(maxLen * 0.45)
      ) {
        cut = commaCut + 1;
      }
    }

    // 3. 野球アナウンスで自然に切れる語句
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

      for (const word of preferredWords) {
        const pos = head.lastIndexOf(word);

        if (
          pos >=
          Math.floor(maxLen * 0.45)
        ) {
          const candidate = pos + word.length;

          if (candidate > bestCut) {
            bestCut = candidate;
          }
        }
      }

      if (bestCut > 0) {
        cut = bestCut;
      }
    }

    // 4. 空白
    if (cut < 0) {
      const spaceCut = head.lastIndexOf(" ");

      if (
        spaceCut >=
        Math.floor(maxLen * 0.5)
      ) {
        cut = spaceCut + 1;
      }
    }

    // 5. どうしても区切りが無ければ最大文字数付近
    if (cut < 0) {
      cut = maxLen;
    }

    // 「ください」「行います」などの単語途中なら後ろへずらす
    cut = moveCutAfterProtectedWord(
      rest,
      cut
    );

    cut = Math.max(
      1,
      Math.min(cut, rest.length)
    );

    const chunk = rest
      .slice(0, cut)
      .trim();

    if (chunk) {
      chunks.push(chunk);
    }

    rest = rest
      .slice(cut)
      .trimStart();

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

  addPiperDiagnostic(
    "[生成] 開始",
    {
      text,
      length: text.length,
      speedScale,
    }
  );

  let result: any;

  try {
    result = await engine.synthesize(
      text,
      {
        language: "ja",
        lengthScale: 1 / speedScale,
      }
    );
  } catch (error) {
    addPiperDiagnostic(
      "[生成] 失敗",
      error
    );
    throw error;
  }

  if (myGenerationId !== generationId) {
    return null;
  }

  if (!result || !result.samples) {
    throw new Error(
      "Piper-Plusから音声データが返されませんでした。"
    );
  }

  const samples =
    result.samples instanceof Float32Array
      ? result.samples
      : new Float32Array(result.samples);

  const sampleRate =
    Number(result.sampleRate || 22050);

  addPiperDiagnostic(
    "[生成] 完了",
    {
      samples: samples.length,
      sampleRate,
      seconds:
        sampleRate > 0
          ? Number((samples.length / sampleRate).toFixed(2))
          : 0,
    }
  );

  return {
    samples,
    sampleRate,
  };
}

async function playSamples(
  samples: Float32Array,
  sampleRate: number,
  volume: number,
  myGenerationId: number
) {
  const ctx = await resumeAudioContext();

  addPiperDiagnostic(
    "[再生] playSamples開始",
    {
      state: ctx.state,
      samples: samples.length,
      sampleRate,
      volume,
    }
  );

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
        addPiperDiagnostic(
          "[再生] 終了"
        );

        if (currentSource === source) {
          currentSource = null;
          currentGain = null;
        }

        resolve();
      };

      try {

        addPiperDiagnostic(
          "[再生] source.start",
          ctx.state
        );

        source.start();

        addPiperDiagnostic(
          "[再生] source.start成功"
        );
      } catch (error) {
        addPiperDiagnostic(
          "[再生] source.start失敗",
          error
        );

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

  addPiperDiagnostic(
    "[読み上げ] 開始",
    {
      text: cleanText,
      length: cleanText.length,
    }
  );

  const myGenerationId =
    ++generationId;

  await resumeAudioContext();

  let engine: any;

  try {
    engine = await getEngine();
  } catch (error) {
    addPiperDiagnostic(
      "[読み上げ] エンジン取得失敗",
      error
    );
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

  addPiperDiagnostic(
    "[読み上げ] チャンク分割",
    {
      count: chunks.length,
      chunks,
    }
  );

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
      addPiperDiagnostic(
        "[読み上げ] generationId変更により終了"
      );
      return;
    }
  }

  addPiperDiagnostic(
    "[読み上げ] 全チャンク完了"
  );
}

export function stopPiper() {
  addPiperDiagnostic(
    "[停止] stopPiper"
  );

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
  addPiperDiagnostic(
    "[Prewarm] 開始"
  );

  try {
    await getEngine();

    addPiperDiagnostic(
      "[Prewarm] 完了"
    );
  } catch (error) {
    addPiperDiagnostic(
      "[Prewarm] 失敗",
      error
    );
    throw error;
  }
}
