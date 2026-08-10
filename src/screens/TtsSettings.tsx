// src/components/TtsSettings.tsx  ← 使っている場所に合わせてパス調整OK
import React, { useEffect, useMemo, useRef, useState } from "react";
import { speak } from "../lib/tts";
import {
  PIPER_MODELS,
  PiperModelId,
  prewarmPiper,
  setPiperProgressListener,
  setSelectedPiperModel,
} from "../lib/piperTts";
import { useWebSpeechVoices } from "../hooks/useWebSpeechVoices";

const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);

// 一部ボイス（例: Microsoft ○○ Online (Natural)）は pitch/volume が効きにくい
function isPitchLikelyUnsupported(voiceName?: string) {
  if (!voiceName) return false;
  const n = voiceName.toLowerCase();
  return n.includes("microsoft") && n.includes("online") && n.includes("natural");
}

type Props = {
  onNavigate?: (screen: string) => void;
  onBack?: () => void;
};

export default function TtsSettings({ onNavigate, onBack }: Props) {
  // 日本語のみ表示（端末/ブラウザが公開する ja 系ボイス）
  const { voices, ready } = useWebSpeechVoices("ja");

  // 既定値（LS未設定時）: 速度1.3 / ピッチ1.0 / 音量0.8
  const DEFAULT_RATE = 1.3;
  const DEFAULT_PITCH = 1.0;
  const DEFAULT_VOLUME = 0.8;

  // 設定値（localStorage 永続化）
  const [speed, setSpeed] = useState<number>(() => {
    const v = Number(localStorage.getItem("tts:speedScale"));
    return Number.isFinite(v) ? Math.min(2, Math.max(0.5, v)) : DEFAULT_RATE;
  });
  const [pitch, setPitch] = useState<number>(() => {
    const v = Number(localStorage.getItem("tts:pitch"));
    return Number.isFinite(v) ? Math.min(2, Math.max(0.0, v)) : DEFAULT_PITCH;
  });
  const [volume, setVolume] = useState<number>(() => {
    const v = Number(localStorage.getItem("tts:volume"));
    return Number.isFinite(v) ? Math.min(1.0, Math.max(0.0, v)) : DEFAULT_VOLUME;
  });
  const [selectedName, setSelectedName] = useState<string | "">(localStorage.getItem("tts:webspeech:voiceName") || "");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [piperReady, setPiperReady] = useState(false);
  const [piperLoading, setPiperLoading] = useState(false);
  const [piperProgress, setPiperProgress] = useState(0);
  const [piperStatus, setPiperStatus] = useState("");
  const [piperError, setPiperError] = useState("");

  const [engine, setEngine] = useState<"webspeech" | "piper">(() =>
    localStorage.getItem("tts:engine") === "piper" ? "piper" : "webspeech"
  );

  const [piperModel, setPiperModel] = useState<PiperModelId>(() => {
    const v = localStorage.getItem("tts:piper:model");
    return v === "tsukuyomi" || v === "css10" || v === "uguisu" ? v : "uguisu";
  });

  const handleEngineChange = (value: "webspeech" | "piper") => {
    setEngine(value);
    localStorage.setItem("tts:engine", value);
  };

  const handlePiperModelChange = (value: PiperModelId) => {
    setPiperModel(value);
    setSelectedPiperModel(value);
    setPiperReady(false);
    setPiperError("");
  };

  // 初回：保存が空ならデフォルトを選択
  const onceRef = useRef(false);
  useEffect(() => {
    if (!ready || onceRef.current) return;
    onceRef.current = true;
    if (!selectedName && voices.length > 0) {
      const def = voices.find(v => v.default) || voices[0];
      setSelectedName(def.name);
      localStorage.setItem("tts:webspeech:voiceName", def.name);
    }
  }, [ready, voices, selectedName]);

  const selectedLabel = useMemo(() => {
    const v = voices.find(v => v.name === selectedName);
    return v ? `${v.name} (${v.lang})` : "未選択";
  }, [voices, selectedName]);

  const pitchUnsupported = isPitchLikelyUnsupported(selectedName || undefined);

  const handleSelectVoice = (name: string) => {
    setSelectedName(name);
    localStorage.setItem("tts:webspeech:voiceName", name);
  };
  const handleSpeedChange = (v: number) => {
    const clamped = Math.min(2.0, Math.max(0.5, v));
    setSpeed(clamped);
    localStorage.setItem("tts:speedScale", String(clamped));
  };
  const handlePitchChange = (v: number) => {
    const clamped = Math.min(2.0, Math.max(0.0, v));
    setPitch(clamped);
    localStorage.setItem("tts:pitch", String(clamped));
  };
  const handleVolumeChange = (v: number) => {
    const clamped = Math.min(1.0, Math.max(0.0, v));
    setVolume(clamped);
    localStorage.setItem("tts:volume", String(clamped));
  };


  // Piper選択時に先読みして、実際のアナウンス開始を速くする
  useEffect(() => {
    if (engine !== "piper") return;

    let cancelled = false;

    setPiperProgressListener(({ stage, progress, message }) => {
      if (cancelled) return;
      setPiperProgress(Math.round(progress * 100));

      if (stage === "model") {
        setPiperStatus(progress >= 0.7 ? "音声モデルを読み込みました" : "音声モデルを準備しています");
      } else if (stage === "phonemizer") {
        setPiperStatus("日本語読み上げを準備しています");
      } else if (stage === "ready") {
        setPiperStatus("準備完了");
      } else {
        setPiperStatus(message || "準備しています");
      }
    });

    setPiperLoading(true);
    setPiperError("");
    setPiperStatus("Piper-Plusを準備しています");

    prewarmPiper(piperModel)
      .then(() => {
        if (cancelled) return;
        setPiperReady(true);
        setPiperProgress(100);
        setPiperStatus("準備完了");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Piper prewarm error:", error);
        setPiperError("Piper-Plusの準備に失敗しました。通信環境を確認して再度お試しください。");
        setPiperStatus("");
      })
      .finally(() => {
        if (!cancelled) setPiperLoading(false);
      });

    return () => {
      cancelled = true;
      setPiperProgressListener(null);
    };
  }, [engine, piperModel]);

  const handleTest = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      await speak("ファウルボールの行方にご注意ください", {
        voiceName: selectedName || undefined,
        speedScale: speed,
        pitch,
        volume,
      });
    } catch (error) {
      console.error("TTS test error:", error);
      if (engine === "piper") {
        setPiperError("テスト読み上げに失敗しました。もう一度お試しください。");
      }
    } finally {
      setIsSpeaking(false);
    }
  };


  return (
    <div
      className="min-h-[100svh] bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col items-center px-5"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full max-w-[720px]">
        {/* ヘッダ */}
        <div className="w-[100svw] -mx-5 md:mx-0 md:w-full flex items-center justify-between mb-3">
          <button
            onClick={() => (onBack ? onBack() : onNavigate?.("operation-settings"))}
            className="flex items-center gap-1 text-white/95 active:scale-95 px-3 py-2 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm shadow-sm"
          >
            <IconBack />
            <span className="text-sm">運用設定に戻る</span>
          </button>
          <div className="w-10" />
        </div>

        {/* タイトル */}
        <div className="mt-1 text-center select-none mb-3 w-full">
          <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-wide leading-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
              🔊 読み上げ設定
            </span>
          </h1>
          <p className="text-white/70 text-sm mt-1">端末音声またはPiper-Plusを選択して読み上げをカスタマイズ</p>
        </div>

        {/* カード全体 */}
        <section className="w-[100svw] -mx-5 md:mx-0 md:w-full rounded-none md:rounded-3xl p-4 md:p-6 bg-white/5 border border-white/10 ring-1 ring-inset ring-white/10 shadow-xl shadow-black/20 backdrop-blur-md">
          {/* 読み上げ方式 */}
          <div className="rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.03] border border-white/10 p-4 md:p-5 shadow-md shadow-black/20">
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-sky-500/20 ring-1 ring-inset ring-sky-300/30 shadow-inner">
                  🗣️
                </span>
                <h2 className="text-lg md:text-xl font-bold tracking-wide">
                  使う音声
                </h2>
              </div>
            </div>

            <select
              className="w-full rounded-2xl bg-white text-gray-800 p-3 pr-10 shadow-inner focus:outline-none focus:ring-4 focus:ring-sky-400/40"
              value={engine}
              onChange={(e) => handleEngineChange(e.target.value as "webspeech" | "piper")}
            >
              <option value="webspeech">端末の日本語音声（今まで通り）</option>
              <option value="piper">Piper-Plus（音声モデルを選択）</option>
            </select>

            {engine === "webspeech" ? (
              <>
                <div className="mt-4 text-sm font-semibold text-white/90">端末音声</div>
                <select
                  className="mt-2 w-full rounded-2xl bg-white text-gray-800 p-3 pr-10 shadow-inner focus:outline-none focus:ring-4 focus:ring-sky-400/40"
                  value={selectedName}
                  onChange={(e) => handleSelectVoice(e.target.value)}
                >
                  {voices.length === 0 && <option value="">（利用可能な音声が見つかりません）</option>}
                  {voices.map(v => (
                    <option key={`${v.name}__${v.voiceURI}`} value={v.name}>
                      {v.default ? "★ " : ""}{v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-sm text-white/85">
                  現在の選択：<span className="font-semibold">{selectedLabel}</span>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 text-sm font-semibold text-emerald-300">
                  ⚾ Piper-Plus 音声モデル
                </div>

                <select
                  className="mt-2 w-full rounded-2xl bg-white text-gray-800 p-3 pr-10 shadow-inner focus:outline-none focus:ring-4 focus:ring-emerald-400/40"
                  value={piperModel}
                  onChange={(e) => handlePiperModelChange(e.target.value as PiperModelId)}
                >
                  <option value="tsukuyomi">つくよみちゃん</option>
                  <option value="css10">CSS10 日本語女性</option>
                  <option value="uguisu">ウグイス嬢（テスト）</option>
                </select>

                <div className="mt-2 text-sm text-white/85">
                  現在の選択：<span className="font-semibold">{PIPER_MODELS[piperModel].label}</span>
                </div>

                <div className="mt-3 rounded-2xl bg-black/15 border border-white/10 p-3">
                  {piperReady ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-300 font-semibold">
                      <span>✓</span>
                      <span>準備完了</span>
                    </div>
                  ) : piperLoading ? (
                    <>
                      <div className="flex items-center justify-between gap-3 text-xs text-white/75">
                        <span>{piperStatus || "準備しています"}</span>
                        <span>{piperProgress}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-300"
                          style={{ width: `${Math.max(3, piperProgress)}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-white/65">
                      Piper-Plusを選択すると音声モデルを準備します。
                    </div>
                  )}

                  {piperError && (
                    <p className="text-xs text-rose-300 mt-2 leading-relaxed">
                      {piperError}
                    </p>
                  )}
                </div>

                <p className="text-xs text-white/60 mt-2 leading-relaxed">
                  ※ 初回のみ音声モデルの読み込みに時間がかかります。
                  2回目以降は端末内キャッシュを利用します。
                </p>
              </>
            )}
          </div>

          {/* 読み上げ速度 */}
          <div className="rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.03] border border-white/10 p-4 md:p-5 shadow-md shadow-black/20 mt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-emerald-500/20 ring-1 ring-inset ring-emerald-300/30 shadow-inner">
                  ⏩
                </span>
                <h2 className="text-lg md:text-xl font-bold tracking-wide">
                  読み上げ速度
                </h2>
              </div>
              <div className="text-sm text-white/80">x{speed.toFixed(1)}</div>
            </div>

            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="w-full accent-sky-400"
            />
          </div>

          {engine === "webspeech" && (
            <>
              {/* ピッチ（声の高さ） */}
          <div className="rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.03] border border-white/10 p-4 md:p-5 shadow-md shadow-black/20 mt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-fuchsia-500/20 ring-1 ring-inset ring-fuchsia-300/30 shadow-inner">
                  🎚️
                </span>
                <h2 className="text-lg md:text-xl font-bold tracking-wide">
                  声の高さ（ピッチ）
                </h2>
              </div>
              <div className="text-sm text-white/80">{pitch.toFixed(1)}</div>
            </div>

            <input
              type="range"
              min={0.0}
              max={2.0}
              step={0.1}
              value={pitch}
              onChange={(e) => handlePitchChange(Number(e.target.value))}
              className={`w-full accent-fuchsia-400 ${pitchUnsupported ? "opacity-70" : ""}`}
            />

            {isPitchLikelyUnsupported(selectedName || undefined) && (
              <p className="text-xs text-amber-300 mt-2 leading-relaxed">
                ※ この音声はピッチが反映されない場合があります。別の日本語音声をお試しください。
              </p>
            )}
          </div>

            </>
          )}

          {/* 音量（このアプリの読み上げのみ） */}
          <div className="rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.03] border border-white/10 p-4 md:p-5 shadow-md shadow-black/20 mt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-orange-500/20 ring-1 ring-inset ring-orange-300/30 shadow-inner">
                  🔈
                </span>
                <h2 className="text-lg md:text-xl font-bold tracking-wide">
                  音量（このアプリの読み上げのみ）
                </h2>
              </div>
              <div className="text-sm text-white/80">{volume.toFixed(2)}</div>
            </div>

            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-full accent-orange-400"
            />
          </div>

          {/* テスト読み上げ */}
          <div className="mt-6">
            <button
              onClick={handleTest}
              disabled={isSpeaking || (engine === "piper" && piperLoading)}
              className={`w-full h-12 rounded-2xl text-white font-semibold tracking-wide shadow-lg shadow-black/30 active:scale-[0.99] transition-transform ${
                (isSpeaking || (engine === "piper" && piperLoading)) ? "bg-gray-500/60 cursor-not-allowed" : "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500"
              }`}
              title="現在の設定で読み上げテスト"
            >
              {engine === "piper" && piperLoading ? "Piper-Plusを準備中..." : isSpeaking ? "読み上げ中..." : "現在の設定でテスト読み上げ"}
            </button>
            <p className="text-[11px] text-white/60 mt-2 leading-relaxed">
              ※ Piper-Plusはブラウザ内で動作します。初回はモデル読み込みのため少し時間がかかります。
            </p>
          </div>
        </section>


      </div>
    </div>
  );
}
