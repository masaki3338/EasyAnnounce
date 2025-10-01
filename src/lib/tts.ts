// lib/tts.ts — 画面から使う薄いAPI（全画面はこれだけ import してください）
import { bridgedSpeak, bridgedStop, prewarmTTS as bridgePrewarm } from "../ttsBridge";

/** VOICEVOX優先（失敗時 Web Speech）。UIは待たせない運用がおすすめ：void speak(...) */
export async function speak(
  text: string,
  opts?: { progressive?: boolean; cache?: boolean }
) {
  return bridgedSpeak(text, opts);
}

/** すべて停止（VOICEVOX <audio> と Web Speech） */
export function stop() {
  return bridgedStop();
}

/** 初回ウォームアップ（画面の useEffect で 1 回呼ぶと初回が速くなります） */
export async function prewarmTTS() {
  return bridgePrewarm();
}
