// src/components/TtsSettings.tsx  ← 使っている場所に合わせてパス調整OK
import React, { useEffect, useMemo, useRef, useState } from "react";
import { speak } from "../lib/tts";
import { useWebSpeechVoices } from "../hooks/useWebSpeechVoices";

const MATCHA_VALUE = "__easy_announce_matcha__";
const MATCHA_LABEL = "AI音声（Matcha）";
const DEFAULT_TEST_TEXT =
  "1番、ショート、佐々木かえでくん。ショート、佐々木くん、背番号0。";

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

  const [selectedName, setSelectedName] = useState<string | "">(() => {
    const engine = localStorage.getItem("tts:engine");

    if (engine === "matcha") {
      return MATCHA_VALUE;
    }

    if (engine === "piper") {
      localStorage.setItem("tts:engine", "matcha");
      return MATCHA_VALUE;
    }

    return localStorage.getItem("tts:webspeech:voiceName") || "";
  });

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showAiVoiceNotice, setShowAiVoiceNotice] = useState(false);
  const [testText, setTestText] = useState(DEFAULT_TEST_TEXT);

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
    if (selectedName === MATCHA_VALUE) {
      return MATCHA_LABEL;
    }

    const v = voices.find(v => v.name === selectedName);
    return v ? `${v.name} (${v.lang})` : "未選択";
  }, [voices, selectedName]);

  const isMatchaVoice =
    selectedName === MATCHA_VALUE;

  const isAiVoice = isMatchaVoice;

  const pitchUnsupported =
    !isAiVoice &&
    isPitchLikelyUnsupported(selectedName || undefined);

  const handleSelectVoice = (name: string) => {
    setSelectedName(name);

    if (name === MATCHA_VALUE) {
      localStorage.setItem("tts:engine", "matcha");

      // AI音声を選択した時は毎回案内を表示
      setShowAiVoiceNotice(true);
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

    const text = testText.trim();
    if (!text) {
      window.alert("テスト文章を入力してください。");
      return;
    }

    setIsSpeaking(true);
    try {
      await speak(text, {
        voiceName: isAiVoice ? undefined : (selectedName || undefined),
        speedScale: speed,
        pitch,
        volume,
      });
    } catch (error) {
      console.error("[TTS settings] test speak failed:", error);

      if (isMatchaVoice) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        window.alert(
          `Matcha音声の読み上げに失敗しました。\n\n${message}`
        );
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
              <option value={MATCHA_VALUE}>
                ★ {MATCHA_LABEL}
              </option>


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

            {isMatchaVoice && (
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                ※ Matcha音声では、この「声の高さ」設定は使用しません。
              </p>
            )}

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
          <div className="rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.03] border border-white/10 p-4 md:p-5 shadow-md shadow-black/20 mt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-cyan-500/20 ring-1 ring-inset ring-cyan-300/30 shadow-inner">
                  📝
                </span>
                <h2 className="text-lg md:text-xl font-bold tracking-wide">
                  テスト文章
                </h2>
              </div>
            </div>

            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              rows={4}
              spellCheck={false}
              className="w-full resize-y min-h-[104px] rounded-2xl bg-white text-gray-900 p-3 md:p-4 text-base leading-relaxed shadow-inner focus:outline-none focus:ring-4 focus:ring-cyan-400/40"
              placeholder="読み上げを確認したい文章を入力してください"
              aria-label="テスト読み上げ文章"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setTestText(DEFAULT_TEST_TEXT)}
                disabled={isSpeaking}
                className="shrink-0 px-4 h-10 rounded-xl bg-white/10 border border-white/15 text-sm font-semibold text-white/90 active:scale-[0.98] disabled:opacity-50"
              >
                比較文に戻す
              </button>

              <button
                type="button"
                onClick={() => setTestText("")}
                disabled={isSpeaking}
                className="shrink-0 px-4 h-10 rounded-xl bg-white/10 border border-white/15 text-sm font-semibold text-white/90 active:scale-[0.98] disabled:opacity-50"
              >
                クリア
              </button>
            </div>

            <button
              onClick={handleTest}
              disabled={isSpeaking || !testText.trim()}
              className={`w-full h-12 mt-4 rounded-2xl text-white font-semibold tracking-wide shadow-lg shadow-black/30 active:scale-[0.99] transition-transform ${
                isSpeaking || !testText.trim()
                  ? "bg-gray-500/60 cursor-not-allowed"
                  : "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500"
              }`}
              title="現在の設定で読み上げテスト"
            >
              {isSpeaking ? "読み上げ中..." : "現在の設定でテスト読み上げ"}
            </button>

            <p className="text-[11px] text-white/60 mt-2 leading-relaxed">
              ※ 入力した文章を、現在選択している音声・速度・音量で読み上げます。
            </p>
          </div>
        </section>
      </div>

      {/* AI音声切り替え時の案内 */}
      {showAiVoiceNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-voice-notice-title"
        >
          <div className="w-full max-w-md rounded-3xl bg-slate-800 border border-white/15 shadow-2xl p-5 md:p-6">
            <h2
              id="ai-voice-notice-title"
              className="text-xl font-bold text-white text-center"
            >
              AI音声について
            </h2>

            <div className="mt-4 text-sm md:text-base leading-relaxed text-white/90 space-y-3">
              <p>
                AI音声に切り替えると、初回の読み上げ開始まで少し時間がかかります。
              </p>
              <p>
                次回起動時は「AI音声起動中」と表示され、準備完了後にアプリが起動します。
              </p>

              <div className="mt-4 rounded-2xl border border-amber-300/70 bg-amber-400/15 px-4 py-3 text-amber-100 shadow-inner">
                <p className="font-bold">
                  ⚠ 端末の性能によっては、AI音声の読み上げに遅延が発生する場合があります。
                </p>
                <p className="mt-1 text-amber-50/90">
                  その場合は、AI音声でなく端末音声をご利用ください。
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAiVoiceNotice(false)}
              className="mt-6 w-full h-12 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 text-white font-bold shadow-lg active:scale-[0.99] transition-transform"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
