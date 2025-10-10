import React, { useEffect, useState, useRef } from "react";
import localForage from "localforage";
import { speak } from "../lib/tts";


// ── 見た目用ミニアイコン ──
const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);

type VoiceKey = "femaleA" | "femaleB" | "maleA" | "maleB";

// VOICEVOX の speaker 番号
const VOICES: Record<VoiceKey, { label: string; speaker: number; emoji: string }> = {
  femaleA: { label: "女性A", speaker: 30, emoji: "👩" },
  femaleB: { label: "女性B", speaker: 109, emoji: "👩‍🦰" },
  maleA:   { label: "男性A", speaker: 83, emoji: "👨" },
  maleB:   { label: "男性B", speaker: 99, emoji: "👨‍🦱" },
};

type Props = {
  onNavigate?: (screen: string) => void;
  onBack?: () => void;
};

export default function TtsSettings({ onNavigate, onBack }: Props) {
  const [voice, setVoice] = useState<VoiceKey>("femaleA");
  const [speed, setSpeed] = useState<number>(1.0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const warmupTimerRef = useRef<number | null>(null);

  // 起動時に localStorage から復元
  useEffect(() => {
    const sp = Number(localStorage.getItem("tts:voicevox:speaker"));
    if (sp === 30) setVoice("femaleA");
    else if (sp === 109) setVoice("femaleB");
    else if (sp === 83) setVoice("maleA");
    else if (sp === 99) setVoice("maleB");

    const spd = Number(localStorage.getItem("tts:speedScale"));
    if (Number.isFinite(spd) && spd >= 0.5 && spd <= 2.0) setSpeed(spd);
  }, []);

  // ウォームアップ（合成のみ）
// import { resolveVoxBase } from "@/lib/fastTTS"; を追加
const warmup = async (speaker: number, speedVal: number) => {
  const base = resolveVoxBase();
  // /version は失敗しても無視
  await fetch(`${base}/api/tts-voicevox/version`, { cache: "no-store" }).catch(() => {});
  // 実合成ウォーム（短い文・短いタイムアウト）
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort("warmup-timeout"), 3000);
  await fetch(`${base}/api/tts-voicevox/tts-cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "テスト", speaker, speedScale: speedVal }),
    cache: "no-store",
    signal: ctrl.signal,
  }).catch(() => {});
  clearTimeout(t);
};


  // 声の選択
  const handleSelect = async (key: VoiceKey) => {
    setVoice(key);
    const speaker = VOICES[key].speaker;

    localStorage.setItem("tts:voicevox:speaker", String(speaker));
    localStorage.setItem("ttsDefaultSpeaker", String(speaker));
    localStorage.setItem("ttsGender", key.startsWith("male") ? "male" : "female");
    await localForage.setItem("ttsDefaultSpeaker", speaker);
    await localForage.setItem("ttsGender", key.startsWith("male") ? "male" : "female");

    // ウォームアップ
    await warmup(speaker, speed);
  };

  // 速度変更（デバウンス付きウォームアップ）
  const handleSpeedChange = (v: number) => {
    const clamped = Math.min(2.0, Math.max(0.5, v));
    setSpeed(clamped);
    localStorage.setItem("tts:speedScale", String(clamped));

    const speaker = VOICES[voice].speaker;
    if (warmupTimerRef.current) window.clearTimeout(warmupTimerRef.current);
    warmupTimerRef.current = window.setTimeout(() => {
      warmup(speaker, clamped);
    }, 250);
  };


// テスト読み上げ（連打ガード + 必ず解除）
const handleTest = async () => {
  if (isSpeaking) return; // すでに再生中なら無視（連打防止）

  const speaker = VOICES[voice].speaker;
  localStorage.setItem("tts:voicevox:speaker", String(speaker));
  localStorage.setItem("ttsDefaultSpeaker", String(speaker));
  localStorage.setItem("tts:speedScale", String(speed));

  setIsSpeaking(true);
  try {
    // ※ onend に依存せず、Promise 完了（停止/自然終了/エラー）で解除する
    // ← 人物・速度・締切を明示して渡す（全画面統一の fastSpeak に届く）
    await speak("ファウルボールの行方にご注意ください", {
      speaker,                 // ← 選択中の VOICEVOX 話者ID
      speedScale: speed,       // ← スライダーの速度
      healthTimeoutMs: 300,    // 300msでヘルスNGなら即フォールバック
      synthTimeoutMs: 800,     // 合成800ms超なら即フォールバック
      startDeadlineMs: 1800,   // “最悪≦2秒で開始”の締切
    });
  } catch {
    // エラー時も握りつぶしてOK（finallyで解除）
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
              🔊読み上げ設定
            </span>
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
        </div>

        <section
          className="w-[100svw] -mx-6 md:mx-0 md:w-full rounded-none md:rounded-2xl p-4 md:p-6
                     bg-white/10 border border-white/10 ring-1 ring-inset ring-white/10 shadow"
        >
          {/* 声の選択（4人） */}
          <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
            {(
              [
                ["femaleA", VOICES.femaleA],
                ["femaleB", VOICES.femaleB],
                ["maleA",   VOICES.maleA],
                ["maleB",   VOICES.maleB],
              ] as [VoiceKey, {label:string; speaker:number; emoji:string}][]
            ).map(([key, info]) => (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl border font-semibold active:scale-95
                  ${voice === key
                    ? "bg-sky-600 text-white border-sky-600 shadow"
                    : "bg-white/10 text-white border-white/10 hover:bg-white/15"}`}
                aria-pressed={voice === key}
              >
                <span className="text-2xl leading-none">{info.emoji}</span>
                <span>{info.label}</span>

              </button>
            ))}
          </div>

          <div className="text-center mt-4">
            <span className="inline-block px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-sm">
              現在の選択：<span className="font-semibold">{VOICES[voice].label}</span>
            </span>
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
