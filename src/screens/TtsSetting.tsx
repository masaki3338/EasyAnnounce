// src/components/TtsSettings.tsx  ← 使っている場所に合わせてパス調整OK
import React, { useEffect, useMemo, useRef, useState } from "react";
import { speak } from "../lib/tts";
import { useWebSpeechVoices } from "../hooks/useWebSpeechVoices";
import { speakKokoroJapaneseTest, stopKokoroJapaneseTest } from "../lib/kokoroTts";
import PiperTest from "./PiperTest";
import PiperFp32SessionTest from "./PiperFp32SessionTest";
import PiperFp32SpeechTest from "./PiperFp32SpeechTest";

const PIPER_VOICE_VALUE = "__easy_announce_piper__";
const PIPER_VOICE_LABEL = "Easyアナウンス AI音声（Piper-Plus）";

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
    return localStorage.getItem("tts:engine") === "piper"
      ? PIPER_VOICE_VALUE
      : (localStorage.getItem("tts:webspeech:voiceName") || "");
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isKokoroSpeaking, setIsKokoroSpeaking] = useState(false);
  const [kokoroStatus, setKokoroStatus] = useState("");

  // Safari / Web Speech API が実際に公開している音声一覧の診断用
  const [diagnosticVoices, setDiagnosticVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [diagnosticUpdatedAt, setDiagnosticUpdatedAt] = useState("");

  const refreshDiagnosticVoices = () => {
    if (!("speechSynthesis" in window)) {
      setDiagnosticVoices([]);
      setDiagnosticUpdatedAt("Web Speech API 非対応");
      return;
    }

    const list = window.speechSynthesis.getVoices();
    setDiagnosticVoices(list);

    const now = new Date();
    setDiagnosticUpdatedAt(
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
    );
  };

  // Safari側の音声一覧を初回取得＋voiceschangedで更新
  useEffect(() => {
    refreshDiagnosticVoices();

    if (!("speechSynthesis" in window)) return;

    const handler = () => refreshDiagnosticVoices();
    window.speechSynthesis.addEventListener("voiceschanged", handler);

    const timer = window.setTimeout(() => refreshDiagnosticVoices(), 800);

    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
    };
  }, []);

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
    if (selectedName === PIPER_VOICE_VALUE) return PIPER_VOICE_LABEL;
    const v = voices.find(v => v.name === selectedName);
    return v ? `${v.name} (${v.lang})` : "未選択";
  }, [voices, selectedName]);

  const pitchUnsupported = selectedName !== PIPER_VOICE_VALUE && isPitchLikelyUnsupported(selectedName || undefined);

  const handleSelectVoice = (name: string) => {
    setSelectedName(name);

    if (name === PIPER_VOICE_VALUE) {
      localStorage.setItem("tts:engine", "piper");
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
        voiceName: selectedName === PIPER_VOICE_VALUE ? undefined : (selectedName || undefined),
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

const handleKokoroTest = async () => {
  if (isKokoroSpeaking) return;

  setIsKokoroSpeaking(true);
  setKokoroStatus("Kokoroモデルを読み込み中です。初回は時間がかかります。");

  try {
    await speakKokoroJapaneseTest(
      "ファウルボールの行方にご注意ください。選手の交代をお知らせします。"
    );
    setKokoroStatus("Kokoroテスト読み上げが完了しました。");
  } catch (err) {
    console.error("[Kokoro TTS Test]", err);
    setKokoroStatus(
      "Kokoroテスト読み上げに失敗しました。コンソールのエラーを確認してください。"
    );
  } finally {
    setIsKokoroSpeaking(false);
  }
};

const handleKokoroStop = () => {
  stopKokoroJapaneseTest();
  setIsKokoroSpeaking(false);
  setKokoroStatus("Kokoro読み上げを停止しました。");
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
          <p className="text-white/70 text-sm mt-1">端末音声またはEasyアナウンスAI音声を選択し、読み上げを調整</p>
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
              <option value={PIPER_VOICE_VALUE}>★ {PIPER_VOICE_LABEL}</option>
              {voices.length === 0 && <option value="">（利用可能な端末音声が見つかりません）</option>}
              {voices.map(v => (
                <option key={`${v.name}__${v.voiceURI}`} value={v.name}>
                  {v.default ? "★ " : ""}{v.name} ({v.lang})
                </option>
              ))}
            </select>
            <div className="mt-2 text-sm text-white/85">
              現在の選択：<span className="font-semibold">{selectedLabel}</span>
            </div>
            <div className="text-xs text-white/60 mt-2 leading-relaxed">
              ※ Easyアナウンス AI音声（Piper-Plus）はアプリ内蔵TTSとして使用します。その他は端末/ブラウザの日本語音声です。
            </div>
          </div>

          {/* Safari / Web Speech API 音声診断 */}
          <div className="rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.03] border border-white/10 p-4 md:p-5 shadow-md shadow-black/20 mt-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-cyan-500/20 ring-1 ring-inset ring-cyan-300/30 shadow-inner">
                  🔎
                </span>
                <div>
                  <h2 className="text-lg md:text-xl font-bold tracking-wide">
                    Safariで認識している音声
                  </h2>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    Web Speech API が実際に返している一覧
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={refreshDiagnosticVoices}
                className="shrink-0 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold active:scale-95"
              >
                再取得
              </button>
            </div>

            <div className="rounded-xl bg-black/20 border border-white/10 px-3 py-2 mb-3">
              <div className="text-sm text-white/90">
                認識数：
                <span className="font-bold text-cyan-300 ml-1">
                  {diagnosticVoices.length}
                </span>
              </div>
              <div className="text-xs text-white/60 mt-1">
                日本語：
                {diagnosticVoices.filter(v => /^ja(?:-|$)/i.test(v.lang)).length}
                {diagnosticUpdatedAt ? ` ／ 最終取得 ${diagnosticUpdatedAt}` : ""}
              </div>
            </div>

            {diagnosticVoices.length === 0 ? (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/20 px-3 py-3 text-sm text-amber-100">
                Safariから利用可能な音声が取得できませんでした。
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {diagnosticVoices.map((v, index) => {
                  const isJa = /^ja(?:-|$)/i.test(v.lang);

                  return (
                    <div
                      key={`${v.name}__${v.voiceURI}__${index}`}
                      className={`rounded-xl border px-3 py-2 ${
                        isJa
                          ? "bg-emerald-500/10 border-emerald-400/25"
                          : "bg-white/[0.03] border-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-white">
                          {v.name}
                        </span>
                        {isJa && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/20">
                            日本語
                          </span>
                        )}
                        {v.default && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/20">
                            default
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-white/60 mt-1 break-all leading-relaxed">
                        lang: {v.lang || "不明"}
                        {" / "}
                        local: {v.localService ? "true" : "false"}
                        <br />
                        voiceURI: {v.voiceURI || "なし"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-white/60 mt-3 leading-relaxed">
              ※ ここに表示されない音声は、iPhoneの「設定」に存在していても、
              現在のSafari/PWAから直接選択することはできません。
            </p>
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
                isSpeaking ? "bg-gray-500/60 cursor-not-allowed" : "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500"
              }`}
              title="現在の設定で読み上げテスト"
            >
              現在の設定でテスト読み上げ
            </button>
            <p className="text-[11px] text-white/60 mt-2 leading-relaxed">
              ※ 一部の音声は、ピッチ/音量の反映が弱い・無効の場合があります。
            </p>
          </div>

          {/* Kokoro-82M 日本語テスト */}
          <div className="mt-4 rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.03] border border-white/10 p-4 md:p-5 shadow-md shadow-black/20">
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-purple-500/20 ring-1 ring-inset ring-purple-300/30 shadow-inner">
                  🧪
                </span>
                <h2 className="text-lg md:text-xl font-bold tracking-wide">
                  Kokoro-82M 日本語テスト
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleKokoroTest}
                disabled={isKokoroSpeaking}
                className={`w-full h-12 rounded-2xl text-white font-semibold tracking-wide shadow-lg shadow-black/30 active:scale-[0.99] transition-transform ${
                  isKokoroSpeaking
                    ? "bg-gray-500/60 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500"
                }`}
                title="Kokoro-82Mで日本語テスト読み上げ"
              >
                {isKokoroSpeaking ? "Kokoro読み込み/生成中..." : "Kokoroでテスト読み上げ"}
              </button>

              <button
                onClick={handleKokoroStop}
                className="w-full h-12 rounded-2xl text-white font-semibold tracking-wide shadow-lg shadow-black/30 active:scale-[0.99] transition-transform bg-white/10 hover:bg-white/15 border border-white/10"
                title="Kokoro読み上げ停止"
              >
                停止
              </button>
            </div>

            {kokoroStatus && (
              <p className="text-xs text-white/75 mt-3 leading-relaxed">
                {kokoroStatus}
              </p>
            )}

            <p className="text-[11px] text-white/60 mt-2 leading-relaxed">
              ※ 初回はモデルを取得するため時間がかかります。まずは検証用なので、既存の端末読み上げ設定とは別ボタンにしています。
            </p>
          </div>

          {/* Piper-Plus 単独テスト */}
          <div className="mt-5">
            <PiperTest embedded />
          </div>

          {/* Piper-Plus FP32 セッションテスト */}
          <div className="mt-5">
            <PiperFp32SessionTest />
          </div>

          {/* Piper-Plus FP32 音声テスト */}
          <div className="mt-5">
            <PiperFp32SpeechTest />
          </div>
        </section>


      </div>
    </div>
  );
}
