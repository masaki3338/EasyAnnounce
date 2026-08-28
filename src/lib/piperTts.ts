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

let piperDiagnosticLogs: string[] = [];
let piperDiagnosticListener: PiperDiagnosticListener | null = null;

function formatDiagnosticValue(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}


const PIPER_DIAG_PANEL_ID = "piper-mobile-diagnostic-panel";
const PIPER_DIAG_TEXT_ID = "piper-mobile-diagnostic-text";

function ensurePiperDiagnosticPanel() {
  if (typeof document === "undefined") return;

  let panel = document.getElementById(PIPER_DIAG_PANEL_ID);
  if (panel) return;

  panel = document.createElement("div");
  panel.id = PIPER_DIAG_PANEL_ID;

  Object.assign(panel.style, {
    position: "fixed",
    left: "8px",
    right: "8px",
    bottom: "8px",
    zIndex: "2147483647",
    maxHeight: "42vh",
    background: "rgba(0,0,0,0.90)",
    color: "#fff",
    borderRadius: "10px",
    padding: "8px",
    fontSize: "11px",
    lineHeight: "1.45",
    boxSizing: "border-box",
    fontFamily: "monospace",
    boxShadow: "0 2px 12px rgba(0,0,0,.35)",
  } as Partial<CSSStyleDeclaration>);

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "6px",
  } as Partial<CSSStyleDeclaration>);

  const title = document.createElement("strong");
  title.textContent = "Piper診断";
  title.style.flex = "1";

  const clearButton = document.createElement("button");
  clearButton.textContent = "クリア";
  Object.assign(clearButton.style, {
    border: "0",
    borderRadius: "6px",
    padding: "5px 8px",
    fontSize: "11px",
  } as Partial<CSSStyleDeclaration>);
  clearButton.onclick = () => {
    piperDiagnosticLogs = [];
    renderPiperDiagnosticPanel();
  };

  const hideButton = document.createElement("button");
  hideButton.textContent = "隠す";
  Object.assign(hideButton.style, {
    border: "0",
    borderRadius: "6px",
    padding: "5px 8px",
    fontSize: "11px",
  } as Partial<CSSStyleDeclaration>);
  hideButton.onclick = () => {
    panel!.style.display = "none";
  };

  const body = document.createElement("pre");
  body.id = PIPER_DIAG_TEXT_ID;
  Object.assign(body.style, {
    margin: "0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowY: "auto",
    maxHeight: "34vh",
  } as Partial<CSSStyleDeclaration>);

  header.appendChild(title);
  header.appendChild(clearButton);
  header.appendChild(hideButton);
  panel.appendChild(header);
  panel.appendChild(body);

  document.body.appendChild(panel);
}

function renderPiperDiagnosticPanel() {
  if (typeof document === "undefined") return;

  ensurePiperDiagnosticPanel();

  const panel = document.getElementById(PIPER_DIAG_PANEL_ID);
  const body = document.getElementById(PIPER_DIAG_TEXT_ID);

  if (panel) {
    panel.style.display = "block";
  }

  if (body) {
    body.textContent = piperDiagnosticLogs.join("\n");
    body.scrollTop = body.scrollHeight;
  }
}

export function showPiperDiagnosticPanel() {
  renderPiperDiagnosticPanel();
}

export function hidePiperDiagnosticPanel() {
  if (typeof document === "undefined") return;
  const panel = document.getElementById(PIPER_DIAG_PANEL_ID);
  if (panel) panel.style.display = "none";
}

function addPiperDiagnostic(
  message: string,
  detail?: unknown
) {
  const time = new Date().toLocaleTimeString();
  const line =
    detail === undefined
      ? `${time} ${message}`
      : `${time} ${message} ${formatDiagnosticValue(detail)}`;

  piperDiagnosticLogs = [
    ...piperDiagnosticLogs.slice(-79),
    line,
  ];

  console.log("[Piper-DIAG]", line);

  try {
    piperDiagnosticListener?.([...piperDiagnosticLogs]);
  } catch {}

  try {
    renderPiperDiagnosticPanel();
  } catch {}
}

export function setPiperDiagnosticListener(
  listener: PiperDiagnosticListener | null
) {
  piperDiagnosticListener = listener;

  try {
    listener?.([...piperDiagnosticLogs]);
  } catch {}
}

export function getPiperDiagnosticLogs(): string[] {
  return [...piperDiagnosticLogs];
}

export function getPiperDiagnosticText(): string {
  return piperDiagnosticLogs.join("\n");
}

export function clearPiperDiagnosticLogs() {
  piperDiagnosticLogs = [];
  addPiperDiagnostic("[診断] ログをクリアしました");
}

const MODEL_PATH = "/models/easy-announce/easy_announce.onnx";

let piperProgressListener: PiperProgressListener | null = null;
let selectedPiperModel: PiperModelId = "easy-announce";

let enginePromise: Promise<any> | null = null;

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;

let generationId = 0;

// 診断パネルは最初のPiper処理時に自動表示されます。

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

  console.log("[Piper-Plus] ORT wasmPaths:", ort.env.wasm.wasmPaths);

  addPiperDiagnostic(
    "[ORT] wasmPaths",
    String(ort.env.wasm.wasmPaths)
  );

  if (!enginePromise) {
    const modelUrl = getModelUrl();

    console.log(
      "[Piper-Plus] model URL:",
      modelUrl
    );

    addPiperDiagnostic(
      "[Piper] 初期化開始",
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

  console.log(
    "[Piper-Plus] playSamples",
    {
      state: ctx.state,
      samples: samples.length,
      sampleRate,
    }
  );

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
        console.log(
          "[Piper-Plus] source.start",
          ctx.state
        );

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
