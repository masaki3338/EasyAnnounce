// src/components/TtsSettings.tsx  ← 使っている場所に合わせてパスは調整OK
import React, { useEffect, useMemo, useRef, useState } from "react";
import { speak } from "../lib/tts";
import { useWebSpeechVoices } from "../hooks/useWebSpeechVoices";

const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);

type Props = {
  onNavigate?: (screen: string) => void;
  onBack?: () => void;
};

export default function TtsSettings({ onNavigate, onBack }: Props) {
  const { voices, ready } = useWebSpeechVoices("ja"); // 日本語のみ表示
  const [speed, setSpeed] = useState<number>(() => {
    const v = Number(localStorage.getItem("tts:speedScale"));
    return Number.isFinite(v) ? Math.min(2, Math.max(0.5, v)) : 1.0;
  });
  const [selectedName, setSelectedName] = useState<string | "">(localStorage.getItem("tts:webspeech:voiceName") || "");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const onceRef = useRef(false);

  // voices が出揃ったら、保存済みが無ければデフォルトを選ぶ
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

  const handleSelectVoice = (name: string) => {
    setSelectedName(name);
    localStorage.setItem("tts:webspeech:voiceName", name);
  };

  const handleSpeedChange = (v: number) => {
    const clamped = Math.min(2.0, Math.max(0.5, v));
    setSpeed(clamped);
    localStorage.setItem("tts:speedScale", String(clamped));
  };

  const handleTest = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      await speak("ファウルボールの行方にご注意ください", {
        voiceName: selectedName || undefined,
        speedScale: speed,
        // Web Speechのみ運用なので厳しめの開始締切にして即スタート体感を上げる
        healthTimeoutMs: 200,
        synthTimeoutMs: 400,
        startDeadlineMs: 1200,
      });
    } catch {
      // 無視
    } finally {
      setIsSpeaking(false);
    }
  };

  return (
    <div
      className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full">
        <div className="w-[100svw] -mx-6 md:mx-0 md:w-full flex items-center justify-between mb-3">
          <button
            onClick={() => (onBack ? onBack() : onNavigate?.("operation-settings"))}
            className="flex items-center gap-1 text-white/90 active:scale-95 px-3 py-2 rounded-lg bg-white/10 border border-white/10"
          >
            <IconBack />
            <span className="text-sm">運用設定に戻る</span>
          </button>
          <div className="w-10" />
        </div>

        <div className="mt-1 text-center select-none mb-2 w-full">
          <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-wide leading-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
              🔊読み上げ設定（Web Speech）
            </span>
          </h1>
        </div>

        <section className="w-[100svw] -mx-6 md:mx-0 md:w-full rounded-none md:rounded-2xl p-4 md:p-6 bg-white/10 border border-white/10 ring-1 ring-inset ring-white/10 shadow">
          {/* 声の選択 */}
          <div className="max-w-lg mx-auto">
            <label className="block text-sm mb-1">
              使う音声（端末に入っている日本語音声のみ）
            </label>
            <select
              className="w-full rounded-lg bg-white/90 text-gray-800 p-2"
              value={selectedName}
              onChange={(e) => handleSelectVoice(e.target.value)}
            >
              {voices.length === 0 && <option value="">（利用可能な音声が見つかりません）</option>}
              {voices.map(v => (
                <option key={v.name} value={v.name}>
                  {v.default ? "★ " : ""}{v.name} ({v.lang})
                </option>
              ))}
            </select>
            <div className="mt-2 text-sm text-white/80">
              現在の選択：<span className="font-semibold">{selectedLabel}</span>
            </div>

            <div className="text-xs text-white/60 mt-2 leading-relaxed">
              ※ 端末に入っている音声だけが表示されます。<br />
            </div>
          </div>

          {/* 速度スライダー */}
          <div className="max-w-lg mx-auto mt-6">
            <label className="block text-sm mb-1">読み上げ速度</label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-right text-sm mt-1">x{speed.toFixed(1)}</div>
          </div>

          {/* テスト読み上げ */}
          <div className="max-w-lg mx-auto mt-6">
            <button
              onClick={handleTest}
              disabled={isSpeaking}
              className={`w-full h-10 rounded-xl ${
                isSpeaking ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              } text-white`}
            >
              現在の設定でテスト読み上げ
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
