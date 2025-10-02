import React, { useEffect, useState } from "react";
import localForage from "localforage";

// ── 見た目用ミニアイコン（ロジック非依存） ──
const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);
const IconVoice = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zm-7 9a7 7 0 0014 0h-2a5 5 0 11-10 0H5zM19 14v2h-2v-2h2z"/>
  </svg>
);
const IconFemale = () => <span className="text-lg leading-none">👩</span>;
const IconMale   = () => <span className="text-lg leading-none">👨</span>;



type Props = {
  onNavigate?: (screen: string) => void;
  onBack?: () => void;
};

export default function TtsSettings({ onNavigate, onBack }: Props) {
  const [ttsGender, setTtsGender] = useState<"female" | "male">("female");

  
  useEffect(() => {
    (async () => {
      const saved = (await localForage.getItem<string>("ttsGender")) as
        | "female"
        | "male"
        | null;
      if (saved === "male" || saved === "female") setTtsGender(saved);
    })();
  }, []);

const handleSelect = async (g: "male" | "female") => {
  setTtsGender(g);
  await localForage.setItem("ttsGender", g);
  await localForage.setItem("ttsDefaultSpeaker", g === "male" ? 13 : 30);

  // ★ 追加：ttsBridge が読めるキーに保存
  try {
    localStorage.setItem("ttsGender", g);
    localStorage.setItem("ttsDefaultSpeaker", String(g === "male" ? 13 : 30));
    // 👇 これを必ず追加
    localStorage.setItem("tts:voicevox:speaker", String(g === "male" ? 13 : 30));
  } catch {}
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
      {/* ヘッダー：フルブリード */}
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

      {/* タイトル */}
      <div className="mt-1 text-center select-none mb-2 w-full">
        <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-wide leading-tight">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
            🔊読み上げ設定
          </span>
        </h1>
        <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
      </div>

      {/* 本体カード：横幅めいっぱい（フルブリード） */}
      <section
        className="w-[100svw] -mx-6 md:mx-0 md:w-full rounded-none md:rounded-2xl p-4 md:p-6
                   bg-white/10 border border-white/10 ring-1 ring-inset ring-white/10 shadow"
      >
        {/* 性別セレクタ */}
        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
          <button
            onClick={() => handleSelect("female")}
            className={`flex flex-col items-center gap-2 py-4 rounded-2xl border font-semibold active:scale-95
                        ${ttsGender === "female"
              ? "bg-rose-600 text-white border-rose-600 shadow"
              : "bg-white/10 text-white border-white/10 hover:bg-white/15"}`}
          >
            <IconFemale />
            <span>女性</span>
          </button>

          <button
            onClick={() => handleSelect("male")}
            className={`flex flex-col items-center gap-2 py-4 rounded-2xl border font-semibold active:scale-95
                        ${ttsGender === "male"
              ? "bg-sky-600 text-white border-sky-600 shadow"
              : "bg-white/10 text-white border-white/10 hover:bg-white/15"}`}
          >
            <IconMale />
            <span>男性</span>
          </button>
        </div>

        {/* 現在の選択 */}
        <div className="text-center mt-4">
          <span className="inline-block px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-sm">
            現在の選択：<span className="font-semibold">
              {ttsGender === "male" ? "男性" : "女性"}
            </span>
          </span>
        </div>
      </section>
    </div>
  </div>
);



}
