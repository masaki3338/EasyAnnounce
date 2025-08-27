import React, { useEffect, useState } from "react";
import localForage from "localforage";

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

  const handleSelect = async (g: "female" | "male") => {
    setTtsGender(g);
    await localForage.setItem("ttsGender", g);
    await localForage.setItem("ttsDefaultSpeaker", g === "male" ? 13 : 30);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {/* ヘッダ */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => (onBack ? onBack() : onNavigate?.("operation-settings"))}
          className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
        >
          ← 戻る
        </button>
        <h1 className="text-xl font-bold">読み上げ設定</h1>
      </div>

      {/* 本体カード */}
      <div className="rounded-2xl bg-white shadow p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleSelect("female")}
            className={`py-3 rounded-xl border font-semibold ${
              ttsGender === "female"
                ? "bg-pink-600 text-white border-pink-600"
                : "bg-gray-100 text-gray-800 border-gray-300"
            }`}
          >
            女性
          </button>
          <button
            onClick={() => handleSelect("male")}
            className={`py-3 rounded-xl border font-semibold ${
              ttsGender === "male"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-gray-100 text-gray-800 border-gray-300"
            }`}
          >
            男性
          </button>
        </div>
      </div>
    </div>
  );
}
