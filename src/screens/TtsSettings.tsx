// src/components/TtsSettings.tsx  ← 使っている場所に合わせてパス調整OK
import React, { useEffect, useMemo, useRef, useState } from "react";
import { speak } from "../lib/tts";
import { discoverPiperModels, makePiperModelInfo, setSelectedPiperModel, type PiperModelInfo } from "../lib/piperTts";
import { useWebSpeechVoices } from "../hooks/useWebSpeechVoices";

const PIPER_VALUE_PREFIX = "__easy_announce_piper_";

function piperModelToValue(modelId: string): string {
  const match = modelId.match(/^easy-announce-(\d+)$/);
  const index = match ? Number(match[1]) : 1;
  return `${PIPER_VALUE_PREFIX}${index}__`;
}

function piperValueToModelId(value: string): string | null {
  const match = value.match(/^__easy_announce_piper_(\d+)__$/);
  return match ? `easy-announce-${Number(match[1])}` : null;
}

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

  const [piperModels, setPiperModels] = useState<PiperModelInfo[]>([
    makePiperModelInfo(1),
    makePiperModelInfo(2),
  ]);

  // public/models/easy-announce/uguisuN/easy_announce.onnx を自動検出。
  useEffect(() => {
    let cancelled = false;

    void discoverPiperModels().then((models) => {
      if (!cancelled && models.length > 0) {
        setPiperModels(models);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

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

  const [selectedName, setSelectedName] = useState<string | "">(() => {
    if (localStorage.getItem("tts:engine") === "piper") {
      const savedModel =
        localStorage.getItem("tts:piper:model") ||
        "easy-announce-1";

      return piperModelToValue(savedModel);
    }

    return localStorage.getItem("tts:webspeech:voiceName") || "";
  });

  const [isSpeaking, setIsSpeaking] = useState(false);

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
    const piperModelId =
      piperValueToModelId(selectedName);

    if (piperModelId) {
      return (
        piperModels.find(
          (model) => model.id === piperModelId
        )?.label ||
        makePiperModelInfo(
          Number(
            piperModelId.replace("easy-announce-", "")
          ) || 1
        ).label
      );
    }

    const v = voices.find(v => v.name === selectedName);
    return v ? `${v.name} (${v.lang})` : "未選択";
  }, [voices, selectedName, piperModels]);

  const isPiperVoice =
    piperValueToModelId(selectedName) !== null;

  const pitchUnsupported =
    !isPiperVoice &&
    isPitchLikelyUnsupported(selectedName || undefined);

  const handleSelectVoice = (name: string) => {
    setSelectedName(name);

    const piperModelId =
      piperValueToModelId(name);

    if (piperModelId) {
      localStorage.setItem("tts:engine", "piper");
      localStorage.setItem(
        "tts:piper:model",
        piperModelId
      );
      setSelectedPiperModel(piperModelId);
      return;
    }

    localStorage.setItem("tts:engine", "webspeech");
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

  const handleTest = async () => {
    if (isSpeaking) return;

    setIsSpeaking(true);
    try {
      await speak("ファウルボールの行方にご注意ください", {
        voiceName: isPiperVoice ? undefined : (selectedName || undefined),
        speedScale: speed,
        pitch,
        volume,
      });
    } catch {
      // noop
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
          <p className="text-white/70 text-sm mt-1">
            端末音声またはEasyアナウンスAI音声を選択し、読み上げを調整
          </p>
        </div>

        {/* カード全体 */}
        <section className="w-[100svw] -mx-5 md:mx-0 md:w-full rounded-none md:rounded-3xl p-4 md:p-6 bg-white/5 border border-white/10 ring-1 ring-inset ring-white/10 shadow-xl shadow-black/20 backdrop-blur-md">
          {/* 使う音声 */}
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
              value={selectedName}
              onChange={(e) => handleSelectVoice(e.target.value)}
            >
              {piperModels.map((model) => (
                <option
                  key={model.id}
                  value={piperModelToValue(model.id)}
                >
                  ★ {model.label}
                </option>
              ))}

              {voices.length === 0 && (
                <option value="">（利用可能な端末音声が見つかりません）</option>
              )}

              {voices.map(v => (
                <option key={`${v.name}__${v.voiceURI}`} value={v.name}>
                  {v.default ? "★ " : ""}{v.name} ({v.lang})
                </option>
              ))}
            </select>

            <div className="mt-2 text-sm text-white/85">
              現在の選択：<span className="font-semibold">{selectedLabel}</span>
            </div>
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

            {pitchUnsupported && (
              <p className="text-xs text-amber-300 mt-2 leading-relaxed">
                ※ この音声はピッチが反映されない場合があります。別の日本語音声をお試しください。
              </p>
            )}
          </div>

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
              disabled={isSpeaking}
              className={`w-full h-12 rounded-2xl text-white font-semibold tracking-wide shadow-lg shadow-black/30 active:scale-[0.99] transition-transform ${
                isSpeaking
                  ? "bg-gray-500/60 cursor-not-allowed"
                  : "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500"
              }`}
              title="現在の設定で読み上げテスト"
            >
              現在の設定でテスト読み上げ
            </button>

            <p className="text-[11px] text-white/60 mt-2 leading-relaxed">
              ※ 一部の音声は、ピッチ/音量の反映が弱い・無効の場合があります。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
