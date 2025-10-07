// src/lib/tts.ts  ← 中身を差し替え
import { fastSpeak } from "./fastTTS";

type SpeakOptions = {
  progressive?: boolean; // 互換用(無視でOK)
  cache?: boolean;       // 互換用(無視でOK)
  speaker?: number;
  speedScale?: number;
  voiceName?: string;        // Web Speech用（任意）
  healthTimeoutMs?: number;
  synthTimeoutMs?: number;
  startDeadlineMs?: number;  // “≦2秒で開始”の締切
};

export async function speak(text: string, options: SpeakOptions = {}) {
  // ❶ 設定画面で保存した値を「毎回」既定として読む（ここがキモ）
  const lsSpeaker = Number(localStorage.getItem("tts:voicevox:speaker"));
  const lsSpeed   = Number(localStorage.getItem("tts:speedScale"));
  const lsWSName  = localStorage.getItem("tts:webspeech:voiceName") || undefined;

  const {
    speaker        = Number.isFinite(lsSpeaker) ? lsSpeaker : 1,
    speedScale     = Number.isFinite(lsSpeed)   ? lsSpeed   : 1.0,
    voiceName      = lsWSName,
    healthTimeoutMs= 300,
    synthTimeoutMs = 800,
    startDeadlineMs= 1800,   // ← “最悪≦2秒で必ず開始”
  } = options;

  await fastSpeak(text, {
    speaker, speedScale, voiceName,
    healthTimeoutMs, synthTimeoutMs, startDeadlineMs,
  });
}

export function stop() {
  try { window.speechSynthesis.cancel(); } catch {}
  const a = (window as any).__VOICE_AUDIO__ as HTMLAudioElement | undefined;
  if (a) { try { a.pause(); a.currentTime = 0; } catch {} }
}

// 任意：互換用（何もしなくてOK）
export async function prewarmTTS() { /* no-op */ }
