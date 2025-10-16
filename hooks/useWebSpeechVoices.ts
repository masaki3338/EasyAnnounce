// src/hooks/useWebSpeechVoices.ts
import { useEffect, useState } from "react";

export type WebVoice = SpeechSynthesisVoice;

function sortVoices(a: WebVoice, b: WebVoice) {
  if (a.default && !b.default) return -1;
  if (!a.default && b.default) return 1;
  const al = (a.lang || "").toLowerCase();
  const bl = (b.lang || "").toLowerCase();
  if (al !== bl) return al < bl ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function useWebSpeechVoices(langStartsWith = "ja") {
  const [voices, setVoices] = useState<WebVoice[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let done = false;

    const pick = () => {
      if (!mounted) return;
      const all = window.speechSynthesis?.getVoices?.() || [];
      const filtered = langStartsWith
        ? all.filter(v => (v.lang || "").toLowerCase().startsWith(langStartsWith))
        : all.slice();
      setVoices(filtered.sort(sortVoices));
      // 1回でも取得できたら完了
      if (all.length > 0) { done = true; setReady(true); }
    };

    // 初回反映
    pick();

    // 変更イベント
    const synth: any = window.speechSynthesis;
    const onChanged = () => pick();

    // addEventListener があればそちらを使う
    try { synth.addEventListener?.("voiceschanged", onChanged); } catch {}
    // 互換: プロパティも併用
    try { synth.onvoiceschanged = onChanged; } catch {}

    // 一部環境のための短期ポーリング（最大1秒）
    const started = Date.now();
    const iv = setInterval(() => {
      if (done || Date.now() - started > 1000) {
        clearInterval(iv);
        return;
      }
      pick();
    }, 100);

    return () => {
      mounted = false;
      clearInterval(iv);
      try { synth.removeEventListener?.("voiceschanged", onChanged); } catch {}
      try { synth.onvoiceschanged = null; } catch {}
    };
  }, [langStartsWith]);

  // UIから手動で再取得したいとき用（※ここでも cancel/speak はしない）
  const refresh = () => {
    try { window.speechSynthesis?.getVoices?.(); } catch {}
  };

  return { voices, ready, refresh };
}
