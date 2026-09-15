// src/lib/matchaTts.ts
// Easyアナウンス Matcha-TTS-JP + Vocos
//
// public 配置:
//   /models/easy-announce/matcha/easy_announce_matcha_step3.onnx
//   /models/easy-announce/matcha/vocos-22khz-univ.onnx
//
// Matcha-TTS-JP 学習時:
//   text_to_sequence(text, ["jp_cleaners"])
//   + add_blank=true
//
// ブラウザでは openjtalkjs の extractFullContextAsync() を使用し、
// 学習時の matcha/text/jtalk.py (pyopenjtalk.extract_fullcontext) と
// 同じ規則で音素 + アクセント記号へ変換する。
// その後、Matcha-TTS-JP symbols.py のIDへ変換し add_blank=true を適用する。

import * as ort from "onnxruntime-web/wasm";

type MatchaSpeakOptions = {
  speedScale?: number;
  volume?: number;
};

type SynthesizedAudio = {
  samples: Float32Array;
  sampleRate: number;
};

const MATCHA_MODEL_URL =
  "/models/easy-announce/matcha/easy_announce_matcha_step3.onnx";

const VOCOS_MODEL_URL =
  "/models/easy-announce/matcha/vocos-22khz-univ.onnx";

const SAMPLE_RATE = 22050;
const N_FFT = 1024;
const HOP_LENGTH = 256;
const N_BINS = 513;
const MEL_BINS = 80;

const MATCHA_TEMPERATURE = 0.667;

// Matcha-TTS-JP / matcha/text/symbols.py と同じ順番。
// ID=0 は "~"（blank/pad）。
const MATCHA_SYMBOLS = [
  "~",
  "A", "E", "I", "N", "O", "U",
  "a", "b", "by", "ch", "cl", "d", "dy", "e", "f",
  "g", "gy", "h", "hy", "i", "j", "k", "ky", "m",
  "my", "n", "ny", "o", "p", "py", "r", "ry", "s",
  "sh", "t", "ts", "ty", "u", "v", "w", "y", "z",
  "pau", "sil",
  "^", "$", "?", "_", "#", "[", "]",
] as const;

const MATCHA_SYMBOL_TO_ID = new Map<string, number>(
  MATCHA_SYMBOLS.map((symbol, index) => [symbol, index])
);

let matchaSessionPromise: Promise<ort.InferenceSession> | null = null;
let vocosSessionPromise: Promise<ort.InferenceSession> | null = null;
let openJTalkReadyPromise: Promise<void> | null = null;
let prewarmMatchaPromise: Promise<void> | null = null;
let openJTalkBrowserModule: any = null;

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;

let iosAudioElement: HTMLAudioElement | null = null;
let iosAudioObjectUrl: string | null = null;

let generationId = 0;

const synthesizedCache = new Map<string, SynthesizedAudio>();
const synthesizedCacheOrder: string[] = [];

// 同一チャンクの二重生成を防ぐ。
// 画面表示時のprefetch中に「読み上げ」を押した場合は、
// 同じ生成処理をもう一度開始せず、このPromiseをそのまま待つ。
const synthesisInFlight = new Map<
  string,
  Promise<SynthesizedAudio | null>
>();


type InferenceWorkerResponse =
  | { type: "ready"; id: number }
  | { type: "result"; id: number; sampleRate: number; samplesBuffer: ArrayBuffer }
  | { type: "error"; id: number; message: string };

let inferenceWorker: Worker | null = null;
let inferenceWorkerSeq = 0;
const inferenceWorkerPending = new Map<
  number,
  {
    resolve: (value: SynthesizedAudio | null) => void;
    reject: (reason?: unknown) => void;
  }
>();

function rejectAllWorkerPending(error: unknown) {
  for (const pending of inferenceWorkerPending.values()) {
    pending.reject(error);
  }
  inferenceWorkerPending.clear();
}

function getInferenceWorker(): Worker {
  if (inferenceWorker) return inferenceWorker;

  const worker = new Worker(
    new URL("./matchaInferenceWorker.ts", import.meta.url),
    { type: "module", name: "easy-announce-matcha" }
  );

  worker.onmessage = (event: MessageEvent<InferenceWorkerResponse>) => {
    const message = event.data;
    const pending = inferenceWorkerPending.get(message.id);
    if (!pending) return;

    inferenceWorkerPending.delete(message.id);

    if (message.type === "error") {
      pending.reject(new Error(message.message));
      return;
    }

    if (message.type === "ready") {
      pending.resolve(null);
      return;
    }

    pending.resolve({
      samples: new Float32Array(message.samplesBuffer),
      sampleRate: message.sampleRate,
    });
  };

  worker.onerror = (event) => {
    const error = new Error(
      event.message || "Matcha inference worker error"
    );
    rejectAllWorkerPending(error);
    try { worker.terminate(); } catch {}
    if (inferenceWorker === worker) inferenceWorker = null;
  };

  inferenceWorker = worker;
  return worker;
}

function postInferenceWorker(
  message:
    | { type: "init" }
    | { type: "synthesize"; ids: number[]; speedScale: number }
): Promise<SynthesizedAudio | null> {
  const worker = getInferenceWorker();
  const id = ++inferenceWorkerSeq;

  return new Promise((resolve, reject) => {
    inferenceWorkerPending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id });
  });
}

async function initInferenceWorker(): Promise<void> {
  await postInferenceWorker({ type: "init" });
}

const MAX_CACHE_ITEMS = 18;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function bigintArray(
  values: number[]
): BigInt64Array {
  return new BigInt64Array(
    values.map(
      (value) => BigInt(value)
    )
  );
}

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";

  return (
    /iP(hone|ad|od)/.test(ua) ||
    (
      /Macintosh/.test(ua) &&
      typeof document !== "undefined" &&
      "ontouchend" in document
    )
  );
}

function configureOrt() {
  // Proxy Workerは一部のPWA/Vite配布環境で
  // "worker not ready" になるため使用しない。
  // UIを塞がない処理はApp.tsx側で維持する。
  ort.env.wasm.proxy = false;

  const cores =
    typeof navigator !== "undefined"
      ? navigator.hardwareConcurrency || 1
      : 1;

  const canUseThreads =
    typeof self !== "undefined" &&
    self.crossOriginIsolated === true;

  ort.env.wasm.numThreads =
    canUseThreads
      ? Math.max(1, Math.min(2, cores))
      : 1;

  if (typeof window !== "undefined") {
    const origin = window.location.origin;

    ort.env.wasm.wasmPaths = {
      wasm: `${origin}/ort/ort-wasm-simd-threaded.wasm`,
      mjs: `${origin}/ort/ort-wasm-simd-threaded.mjs`,
    } as any;
  }

}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${url} の取得に失敗しました (HTTP ${response.status})`
    );
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
}

async function getMatchaSession(): Promise<ort.InferenceSession> {
  if (!matchaSessionPromise) {
    configureOrt();

    matchaSessionPromise = (async () => {
      const bytes =
        await fetchBytes(MATCHA_MODEL_URL);

      return ort.InferenceSession.create(
        bytes,
        {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        }
      );
    })().catch((error) => {
      matchaSessionPromise = null;
      throw error;
    });
  }

  return matchaSessionPromise;
}

async function getVocosSession(): Promise<ort.InferenceSession> {
  if (!vocosSessionPromise) {
    configureOrt();

    vocosSessionPromise = (async () => {
      const bytes =
        await fetchBytes(VOCOS_MODEL_URL);

      return ort.InferenceSession.create(
        bytes,
        {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        }
      );
    })().catch((error) => {
      vocosSessionPromise = null;
      throw error;
    });
  }

  return vocosSessionPromise;
}



const OPENJTALK_ASSET_BASE = "/openjtalkjs";

async function getOpenJTalkReady(): Promise<void> {
  if (!openJTalkReadyPromise) {
    openJTalkReadyPromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error(
          "Matcha OpenJTalk G2Pはブラウザ環境でのみ使用できます。"
        );
      }

      // Viteにnode_modules内Workerを変換させると、
      // openjtalkjs 0.1.0 のWorker URL解決が壊れる場合がある。
      // そのためブラウザ用runtime一式を public/openjtalk-runtime に
      // そのまま配置し、ブラウザから直接importする。
      const browserModuleUrl =
        "/openjtalk-runtime/browser.js";


      // public配下のJSをViteのimport解析に通すと "?import" が付き、
      // 開発サーバーで500になるため、ブラウザネイティブのimport()を使う。
      const nativeDynamicImport =
        new Function(
          "url",
          "return import(url);"
        ) as (
          url: string
        ) => Promise<any>;

      openJTalkBrowserModule =
        await nativeDynamicImport(
          browserModuleUrl
        );

      if (
        !openJTalkBrowserModule ||
        typeof openJTalkBrowserModule.configure !== "function" ||
        typeof openJTalkBrowserModule.extractFullContextAsync !== "function"
      ) {
        throw new Error(
          "OpenJTalk browser runtimeのAPIを読み込めませんでした。"
        );
      }


      await openJTalkBrowserModule.configure({
        dicUrl: `${OPENJTALK_ASSET_BASE}/dic`,
        voiceUrl: `${OPENJTALK_ASSET_BASE}/voice.htsvoice`,
      });

    })().catch((error: unknown) => {
      openJTalkReadyPromise = null;
      openJTalkBrowserModule = null;

      console.error(
        "[Matcha] OpenJTalk initialization failed:",
        error
      );

      throw error;
    });
  }

  return openJTalkReadyPromise;
}

function numericFeatureByRegex(
  regex: RegExp,
  text: string
): number {
  const match =
    text.match(regex);

  if (!match) {
    return -50;
  }

  return Number.parseInt(
    match[1],
    10
  );
}

// 学習時の Matcha-TTS-JP/matcha/text/jtalk.py の g2p() を
// TypeScriptへそのまま移植。
// drop_unvoiced_vowels=true も学習時と同じ。
function fullContextLabelsToPhonemes(
  labels: string[]
): string[] {
  const results: string[] = [];
  const count = labels.length;

  for (
    let index = 0;
    index < count;
    index++
  ) {
    const label =
      labels[index];

    const phonemeMatch =
      label.match(/-(.*?)\+/);

    if (!phonemeMatch) {
      throw new Error(
        `OpenJTalk labelから音素を取得できません: ${label}`
      );
    }

    let p3 =
      phonemeMatch[1];

    if (
      ["A", "E", "I", "O", "U"].includes(p3)
    ) {
      p3 =
        p3.toLowerCase();
    }

    if (p3 === "sil") {
      if (
        index !== 0 &&
        index !== count - 1
      ) {
        throw new Error(
          "OpenJTalkのsilが文頭/文末以外に現れました。"
        );
      }

      if (index === 0) {
        results.push("^");
      } else {
        const e3 =
          numericFeatureByRegex(
            /!(\d+)_/,
            label
          );

        if (e3 === 0) {
          results.push("$");
        } else if (e3 === 1) {
          results.push("?");
        }
      }

      continue;
    }

    if (p3 === "pau") {
      results.push("_");
      continue;
    }

    results.push(p3);

    const a1 =
      numericFeatureByRegex(
        /\/A:([0-9\-]+)\+/,
        label
      );

    const a2 =
      numericFeatureByRegex(
        /\+(\d+)\+/,
        label
      );

    const a3 =
      numericFeatureByRegex(
        /\+(\d+)\//,
        label
      );

    const f1 =
      numericFeatureByRegex(
        /\/F:(\d+)_/,
        label
      );

    const nextLabel =
      labels[index + 1] ?? "";

    const a2Next =
      numericFeatureByRegex(
        /\+(\d+)\+/,
        nextLabel
      );

    if (
      a3 === 1 &&
      a2Next === 1
    ) {
      results.push("#");
    } else if (
      a1 === 0 &&
      a2Next === a2 + 1 &&
      a2 !== f1
    ) {
      results.push("]");
    } else if (
      a2 === 1 &&
      a2Next === 2
    ) {
      results.push("[");
    }
  }

  return results;
}

async function textToMatchaIds(
  text: string
): Promise<number[]> {
  await getOpenJTalkReady();

  if (
    !openJTalkBrowserModule ||
    typeof openJTalkBrowserModule.extractFullContextAsync !== "function"
  ) {
    throw new Error(
      "OpenJTalk browser runtimeが初期化されていません。"
    );
  }

  const labelsResult =
    await openJTalkBrowserModule.extractFullContextAsync(
      text
    );

  const labels =
    Array.from(
      labelsResult as ArrayLike<string>
    ).map(String);

  if (!labels.length) {
    throw new Error(
      "OpenJTalkからfull-context labelが返されませんでした。"
    );
  }

  const phonemes =
    fullContextLabelsToPhonemes(
      labels
    );


  const ids: number[] = [];

  for (const phoneme of phonemes) {
    const id =
      MATCHA_SYMBOL_TO_ID.get(
        phoneme
      );

    if (id === undefined) {
      throw new Error(
        `Matcha symbols.pyに無い音素が返されました: "${phoneme}"`
      );
    }

    ids.push(id);
  }

  // Matcha-TTS-JP add_blank=true:
  // intersperse(ids, 0) => [0, id, 0, id, ..., 0]
  const idsWithBlank: number[] =
    [0];

  for (const id of ids) {
    idsWithBlank.push(
      id,
      0
    );
  }



  return idsWithBlank;
}

function makeCacheKey(
  text: string,
  speedScale: number
) {
  return `${speedScale.toFixed(3)}::${text}`;
}

function putCache(
  key: string,
  value: SynthesizedAudio
) {
  if (synthesizedCache.has(key)) {
    const index =
      synthesizedCacheOrder.indexOf(key);

    if (index >= 0) {
      synthesizedCacheOrder.splice(
        index,
        1
      );
    }
  }

  synthesizedCache.set(
    key,
    value
  );

  synthesizedCacheOrder.push(
    key
  );

  while (
    synthesizedCacheOrder.length >
    MAX_CACHE_ITEMS
  ) {
    const oldest =
      synthesizedCacheOrder.shift();

    if (oldest) {
      synthesizedCache.delete(
        oldest
      );
    }
  }
}


// -----------------------------------------------------------------------------
// Vocos complex spectrum -> PCM
// 単体ブラウザテストで正常動作確認済みの radix-2 IFFT + Hann ISTFT。
// torch.istft(center=True) と同じように前後 n_fft/2 をトリムする。
// -----------------------------------------------------------------------------

function ifft(
  real: Float64Array,
  imag: Float64Array
): void {
  const n = real.length;

  // bit-reversal permutation
  for (
    let i = 1, j = 0;
    i < n;
    i++
  ) {
    let bit = n >> 1;

    for (
      ;
      j & bit;
      bit >>= 1
    ) {
      j ^= bit;
    }

    j ^= bit;

    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;

      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }

  // radix-2 inverse FFT
  for (
    let len = 2;
    len <= n;
    len <<= 1
  ) {
    const angle =
      (2 * Math.PI) / len;

    const wlenR =
      Math.cos(angle);

    const wlenI =
      Math.sin(angle);

    for (
      let i = 0;
      i < n;
      i += len
    ) {
      let wr = 1;
      let wi = 0;

      for (
        let j = 0;
        j < len / 2;
        j++
      ) {
        const uR =
          real[i + j];

        const uI =
          imag[i + j];

        const vr0 =
          real[
            i +
            j +
            len / 2
          ];

        const vi0 =
          imag[
            i +
            j +
            len / 2
          ];

        const vR =
          vr0 * wr -
          vi0 * wi;

        const vI =
          vr0 * wi +
          vi0 * wr;

        real[i + j] =
          uR + vR;

        imag[i + j] =
          uI + vI;

        real[
          i +
          j +
          len / 2
        ] =
          uR - vR;

        imag[
          i +
          j +
          len / 2
        ] =
          uI - vI;

        const nextWr =
          wr * wlenR -
          wi * wlenI;

        wi =
          wr * wlenI +
          wi * wlenR;

        wr =
          nextWr;
      }
    }
  }

  for (
    let i = 0;
    i < n;
    i++
  ) {
    real[i] /= n;
    imag[i] /= n;
  }
}

function hannWindow(
  n: number
): Float32Array {
  const window =
    new Float32Array(n);

  // torch.hann_window(periodic=True)
  for (
    let i = 0;
    i < n;
    i++
  ) {
    window[i] =
      0.5 -
      0.5 *
        Math.cos(
          (2 * Math.PI * i) /
            n
        );
  }

  return window;
}

function istftFromVocos(
  mag: Float32Array,
  xr: Float32Array,
  yi: Float32Array,
  frames: number
): Float32Array {
  const rawLength =
    N_FFT +
    HOP_LENGTH *
      (frames - 1);

  const output =
    new Float32Array(
      rawLength
    );

  const norm =
    new Float32Array(
      rawLength
    );

  const window =
    hannWindow(N_FFT);

  const real =
    new Float64Array(
      N_FFT
    );

  const imag =
    new Float64Array(
      N_FFT
    );

  // ONNX layout:
  // [1, 513, T]
  // index = bin * frames + frame
  for (
    let t = 0;
    t < frames;
    t++
  ) {
    real.fill(0);
    imag.fill(0);

    for (
      let k = 0;
      k < N_BINS;
      k++
    ) {
      const index =
        k * frames + t;

      real[k] =
        mag[index] *
        xr[index];

      imag[k] =
        mag[index] *
        yi[index];
    }

    // Negative frequencies:
    // conjugate mirror
    for (
      let k = 1;
      k < N_BINS - 1;
      k++
    ) {
      real[N_FFT - k] =
        real[k];

      imag[N_FFT - k] =
        -imag[k];
    }

    ifft(
      real,
      imag
    );

    const base =
      t * HOP_LENGTH;

    for (
      let i = 0;
      i < N_FFT;
      i++
    ) {
      const w =
        window[i];

      output[
        base + i
      ] +=
        real[i] * w;

      norm[
        base + i
      ] +=
        w * w;
    }
  }

  for (
    let i = 0;
    i < rawLength;
    i++
  ) {
    if (
      norm[i] >
      1e-8
    ) {
      output[i] /=
        norm[i];
    }
  }

  // torch.istft(center=True)
  // n_fft/2 を前後から落とす。
  const trim =
    N_FFT / 2;

  return output.slice(
    trim,
    rawLength - trim
  );
}

async function synthesizeMatchaChunkInternal(
  text: string,
  speedScale: number,
  _myGenerationId: number | null
): Promise<SynthesizedAudio | null> {
  const key = makeCacheKey(text, speedScale);
  const cached = synthesizedCache.get(key);
  if (cached) return cached;

  // OpenJTalkだけメイン側で実行。
  // Matcha/Vocos/ISTFTは専用Workerへ渡す。
  let ids: number[];
  try {
    ids = await textToMatchaIds(text);
  } catch (error) {
    console.error("[Matcha] G2P failed:", error);
    throw error;
  }

  let synthesized: SynthesizedAudio | null;
  try {
    synthesized = await postInferenceWorker({
      type: "synthesize",
      ids,
      speedScale,
    });
  } catch (error) {
    console.error("[Matcha] worker inference failed:", error);
    throw error;
  }

  if (!synthesized) return null;
  putCache(key, synthesized);
  return synthesized;
}

async function synthesizeMatchaChunk(
  text: string,
  speedScale: number,
  myGenerationId: number | null
): Promise<SynthesizedAudio | null> {
  const key = makeCacheKey(text, speedScale);

  const cached = synthesizedCache.get(key);
  if (cached) {
    return cached;
  }

  const existing = synthesisInFlight.get(key);
  if (existing) {
    return existing;
  }

  // 生成処理そのものはgenerationIdでキャンセルしない。
  // 途中まで進んだ先読みを読み上げボタン押下で捨てないため。
  const promise = synthesizeMatchaChunkInternal(
    text,
    speedScale,
    null
  );

  synthesisInFlight.set(key, promise);

  try {
    return await promise;
  } finally {
    if (synthesisInFlight.get(key) === promise) {
      synthesisInFlight.delete(key);
    }
  }
}

function takeFastFirstPhrase(source: string): { first: string; rest: string } | null {
  // 最初の音を早く出すため、文章先頭に自然な句読点がある場合は
  // その短いフレーズだけを最優先チャンクにする。
  // 不自然な文字数切りはせず「、。！？」だけを利用する。
  const minFirst = 8;
  const maxFirst = 24;

  if (source.length <= maxFirst) return null;

  for (let i = minFirst - 1; i < Math.min(source.length, maxFirst); i++) {
    if (/[、。！？!?]/.test(source[i])) {
      const first = source.slice(0, i + 1).trim();
      const rest = source.slice(i + 1).trimStart();
      if (first && rest) return { first, rest };
    }
  }

  return null;
}

function splitMatchaText(
  text: string
): string[] {
  const source =
    String(text ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/ノック時間\s*[、,]\s*は/g, "ノック時間は")
      .trim();

  if (!source) return [];

  // 試合終了アナウンス冒頭は、最初の「。」まで必ず1チャンク。
  // 「ただいまの試合は、」だけで切ると初回だけ大きな無音が出るため。
  const endGameOpeningMatch = source.match(
    /^(ただいまの試合は、ご覧のように[^。！？!?]+[。！？!?])/
  );

  if (endGameOpeningMatch) {
    const fixedEndGameSentence =
      endGameOpeningMatch[1].trim();

    const restAfterEndGame =
      source
        .slice(fixedEndGameSentence.length)
        .trimStart();

    const fixedChunks = [fixedEndGameSentence];

    if (restAfterEndGame) {
      fixedChunks.push(
        ...splitMatchaText(restAfterEndGame)
      );
    }

    return fixedChunks;
  }

  // 投球数アナウンスは選手名・球数が変わっても1文1チャンク。
  // 例:
  // 「ピッチャー○○くん、この回のとうきゅうすうは、8球です。」
  // 名前の後ろの読点では絶対に分割しない。
  const pitchAnnouncementMatch = source.match(
    /^(ピッチャー.+?(?:くん|さん)、この回のとうきゅうすうは[、,]?\s*[^。！？!?]+[。！？!?])/
  );
  if (pitchAnnouncementMatch) {
    const fixedPitchSentence = pitchAnnouncementMatch[1].trim();
    const restAfterPitch = source
      .slice(fixedPitchSentence.length)
      .trimStart();

    const fixedChunks = [fixedPitchSentence];

    if (restAfterPitch) {
      fixedChunks.push(
        ...splitMatchaText(restAfterPitch)
      );
    }

    return fixedChunks;
  }

  const warmupFixed = "りょうチームはウォーミングアップニ入ってください。";
  if (source.startsWith(warmupFixed)) {
    const restAfterWarmup = source.slice(warmupFixed.length).trimStart();
    const fixedChunks = [warmupFixed];
    if (restAfterWarmup) {
      // 残りは通常分割へ回す
      const tail = splitMatchaText(restAfterWarmup);
      fixedChunks.push(...tail);
    }
    return fixedChunks;
  }

  const chunks: string[] = [];
  let rest = source;

  // 最初の自然な短句だけを先に生成すると、全文推論完了を待たずに再生できる。
  const fastFirst = takeFastFirstPhrase(rest);
  if (fastFirst) {
    chunks.push(fastFirst.first);
    rest = fastFirst.rest;
  }

  // 1チャンクを極端に長くしない一方、読点だけでは安易に分割しない。
  // 「ノック時間は、」「この回の投球数は、」などを同一チャンクに保つ。
  const targetLength = 36;
  const hardMaxLength = 52;
  const minUsefulLength = 14;

  const protectedPhrases = [
    "りょうチームはウォーミングアップニ入ってください。",
    "ノック時間は",
    "この回の投球数は",
    "合計投球数は",
    "明日以降に",
    "第1試合",
    "第2試合",
    "第3試合",
    "第4試合",
    "第5試合",
  ];

  const movePastProtectedPhrase = (target: string, cut: number): number => {
    for (const phrase of protectedPhrases) {
      let pos = target.indexOf(phrase);
      while (pos >= 0) {
        const phraseEnd = pos + phrase.length;
        if (pos < cut && cut < phraseEnd) return phraseEnd;
        pos = target.indexOf(phrase, pos + 1);
      }
    }
    return cut;
  };

  while (rest.length > 0) {
    if (rest.length <= hardMaxLength) {
      const last = rest.trim();
      if (last) chunks.push(last);
      break;
    }

    const head = rest.slice(0, Math.min(rest.length, hardMaxLength + 1));
    let cut = -1;

    // まず文末・改行を優先
    for (let i = Math.min(head.length - 1, hardMaxLength - 1); i >= minUsefulLength; i--) {
      if (/[。！？!?\n]/.test(head[i])) {
        cut = i + 1;
        break;
      }
    }

    // 文末が無い長文だけ、後半の読点を候補にする
    if (cut < 0) {
      for (let i = Math.min(head.length - 1, hardMaxLength - 1); i >= targetLength; i--) {
        if (/[、，,]/.test(head[i])) {
          cut = i + 1;
          break;
        }
      }
    }

    // それでも無ければtargetLength付近で切る
    if (cut < 0) {
      cut = targetLength;
      const before = rest.slice(0, targetLength);
      const space = before.lastIndexOf(" ");
      if (space >= minUsefulLength) cut = space + 1;
    }

    cut = movePastProtectedPhrase(rest, cut);
    cut = Math.max(1, Math.min(cut, hardMaxLength, rest.length));

    const chunk = rest.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);

    rest = rest.slice(cut).trimStart();
  }


  return chunks.filter(Boolean);
}

function getAudioContext(): AudioContext {
  if (
    audioContext &&
    audioContext.state !== "closed"
  ) {
    return audioContext;
  }

  const Ctor =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!Ctor) {
    throw new Error(
      "AudioContextを利用できません。"
    );
  }

  audioContext =
    new Ctor();

  return audioContext;
}

async function resumeAudioContext(): Promise<AudioContext> {
  const context =
    getAudioContext();

  if (
    context.state !== "running"
  ) {
    try {
      await context.resume();
    } catch {}
  }

  return context;
}

function float32ToWavBlob(
  samples: Float32Array,
  sampleRate: number
): Blob {
  const bytesPerSample = 2;
  const dataSize =
    samples.length *
    bytesPerSample;

  const buffer =
    new ArrayBuffer(
      44 + dataSize
    );

  const view =
    new DataView(buffer);

  const writeString = (
    offset: number,
    value: string
  ) => {
    for (
      let i = 0;
      i < value.length;
      i++
    ) {
      view.setUint8(
        offset + i,
        value.charCodeAt(i)
      );
    }
  };

  writeString(0, "RIFF");
  view.setUint32(
    4,
    36 + dataSize,
    true
  );
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(
    24,
    sampleRate,
    true
  );
  view.setUint32(
    28,
    sampleRate *
      bytesPerSample,
    true
  );
  view.setUint16(
    32,
    bytesPerSample,
    true
  );
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(
    40,
    dataSize,
    true
  );

  let offset = 44;

  for (
    let i = 0;
    i < samples.length;
    i++, offset += 2
  ) {
    const sample =
      clamp(
        samples[i],
        -1,
        1
      );

    view.setInt16(
      offset,
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff,
      true
    );
  }

  return new Blob(
    [buffer],
    { type: "audio/wav" }
  );
}

export function unlockMatchaAudioForIOS(): void {
  if (!isIOSDevice()) return;

  try {
    if (!iosAudioElement) {
      iosAudioElement =
        new Audio();

      iosAudioElement.preload =
        "auto";

      iosAudioElement.playsInline =
        true;
    }

    const silentWav =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=";

    iosAudioElement.src =
      silentWav;

    iosAudioElement.volume = 0;

    const promise =
      iosAudioElement.play();

    if (
      promise &&
      typeof promise.catch === "function"
    ) {
      void promise.catch(
        () => {}
      );
    }
  } catch {}
}

async function playSamplesIOS(
  audio: SynthesizedAudio,
  volume: number,
  myGenerationId: number
): Promise<void> {
  if (
    myGenerationId !== generationId
  ) {
    return;
  }

  if (!iosAudioElement) {
    iosAudioElement =
      new Audio();

    iosAudioElement.preload =
      "auto";

    iosAudioElement.playsInline =
      true;
  }

  try {
    iosAudioElement.pause();
  } catch {}

  if (iosAudioObjectUrl) {
    try {
      URL.revokeObjectURL(
        iosAudioObjectUrl
      );
    } catch {}

    iosAudioObjectUrl = null;
  }

  const blob =
    float32ToWavBlob(
      audio.samples,
      audio.sampleRate
    );

  iosAudioObjectUrl =
    URL.createObjectURL(blob);

  iosAudioElement.src =
    iosAudioObjectUrl;

  iosAudioElement.volume =
    clamp(volume, 0, 1);

  await new Promise<void>(
    (resolve, reject) => {
      const element =
        iosAudioElement!;

      const cleanup = () => {
        element.onended = null;
        element.onerror = null;
      };

      element.onended = () => {
        cleanup();
        resolve();
      };

      element.onerror = () => {
        cleanup();
        reject(
          new Error(
            "iPhoneでMatcha音声の再生に失敗しました。"
          )
        );
      };

      const promise =
        element.play();

      if (
        promise &&
        typeof promise.catch === "function"
      ) {
        void promise.catch(
          (error) => {
            cleanup();
            reject(error);
          }
        );
      }
    }
  );
}

async function playSamplesWebAudio(
  audio: SynthesizedAudio,
  volume: number,
  myGenerationId: number
): Promise<void> {
  const context =
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
    context.createBuffer(
      1,
      audio.samples.length,
      audio.sampleRate
    );

  buffer.copyToChannel(
    audio.samples,
    0
  );

  const source =
    context.createBufferSource();

  const gain =
    context.createGain();

  gain.gain.value =
    clamp(volume, 0, 1);

  source.buffer = buffer;

  source.connect(gain);
  gain.connect(
    context.destination
  );

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

async function playSamples(
  audio: SynthesizedAudio,
  volume: number,
  myGenerationId: number
) {
  if (isIOSDevice()) {
    await playSamplesIOS(
      audio,
      volume,
      myGenerationId
    );

    return;
  }

  await playSamplesWebAudio(
    audio,
    volume,
    myGenerationId
  );
}

export async function speakMatcha(
  text: string,
  options: MatchaSpeakOptions = {}
): Promise<void> {
  const cleanText =
    String(text ?? "").trim();

  if (!cleanText) return;

  const myGenerationId =
    ++generationId;

  if (isIOSDevice()) {
    unlockMatchaAudioForIOS();
  } else {
    await resumeAudioContext();
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

  const chunks =
    splitMatchaText(cleanText);

  if (!chunks.length) {
    return;
  }

  let nextPromise =
    synthesizeMatchaChunk(
      chunks[0],
      speedScale,
      myGenerationId
    );

  for (
    let index = 0;
    index < chunks.length;
    index++
  ) {
    const current =
      await nextPromise;

    if (
      myGenerationId !== generationId ||
      !current
    ) {
      return;
    }

    if (
      index + 1 <
      chunks.length
    ) {
      nextPromise =
        synthesizeMatchaChunk(
          chunks[index + 1],
          speedScale,
          myGenerationId
        );
    }

    await playSamples(
      current,
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

export async function prefetchMatcha(
  text: string,
  options: MatchaSpeakOptions = {}
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
          0.5,
          2.0
        )
      : 1.0;

  try {
    const chunks =
      splitMatchaText(cleanText);

    // 短いアナウンスは全チャンク先読み。
    // スタメン発表などの長文は「最初に再生する1チャンク」だけを
    // 最優先で生成する。先頭4チャンクを連続生成すると、
    // メインスレッドが長時間重くなり、読み上げ開始も遅く感じるため。
    const prefetchChunks =
      cleanText.length <= 140
        ? chunks
        : chunks.slice(0, 2);

    for (
      const chunk of
      prefetchChunks
    ) {
      const key =
        makeCacheKey(
          chunk,
          speedScale
        );

      if (
        synthesizedCache.has(key)
      ) {
        continue;
      }

      await synthesizeMatchaChunk(
        chunk,
        speedScale,
        null
      );
    }
  } catch (error) {
    console.warn(
      "[Matcha] prefetch failed:",
      error
    );
  }
}

export async function prewarmMatcha(): Promise<void> {
  if (prewarmMatchaPromise) return prewarmMatchaPromise;

  prewarmMatchaPromise = (async () => {
    // OpenJTalk準備とWorker内モデル読込を並行。
    await Promise.all([
      getOpenJTalkReady(),
      initInferenceWorker(),
    ]);

    // 初回推論もWorker内で済ませる。
    const key = makeCacheKey("あ。", 1.0);
    if (!synthesizedCache.has(key)) {
      await synthesizeMatchaChunk("あ。", 1.0, null);
    }
  })().catch((error) => {
    prewarmMatchaPromise = null;
    throw error;
  });

  return prewarmMatchaPromise;
}

// Matchaが選択済みなら、画面の初回描画を邪魔しない範囲で
// Workerとモデルの準備だけ早めに開始する。
if (typeof window !== "undefined") {
  window.setTimeout(() => {
    try {
      const engine = localStorage.getItem("tts:engine");
      if (engine === "matcha" || engine === "piper") {
        void prewarmMatcha().catch(() => {});
      }
    } catch {}
  }, 0);
}

export function stopMatcha() {
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

export function clearMatchaAudioCache() {
  synthesizedCache.clear();
  synthesizedCacheOrder.length = 0;
  synthesisInFlight.clear();
}
