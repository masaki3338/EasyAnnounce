import React from "react";
import type { ScreenType } from "../App";

export default function OperationSettings({ onNavigate }: { onNavigate: (s: ScreenType) => void }) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-10">
      <div className="w-full max-w-sm">
        <button className="mb-6 px-4 py-2 bg-gray-200 rounded" onClick={() => onNavigate("menu")}>
          ← メニューに戻る
        </button>

        <h1 className="text-2xl font-bold text-center mb-8">運用設定</h1>

        <div className="space-y-5">
          <button className="w-full py-5 rounded-2xl bg-gray-600 text-white font-semibold shadow active:scale-95"
                  onClick={() => onNavigate("pitchLimit")}>
            規定投球数
          </button>
          <button className="w-full py-5 rounded-2xl bg-gray-600 text-white font-semibold shadow active:scale-95"
                  onClick={() => onNavigate("tiebreakRule")}>
            タイブレークルール
          </button>
          
          <button
          className="w-full py-5 rounded-2xl bg-gray-600 text-white font-semibold shadow active:scale-95"
          onClick={() => window.open("/manual.pdf", "_blank")}
        >
          連盟アナウンスマニュアル
        </button>

          <button className="w-full py-5 rounded-2xl bg-gray-600 text-white font-semibold shadow active:scale-95"
                  onClick={() => onNavigate("contact")}>
            お問い合わせ
          </button>
          <button className="w-full py-5 rounded-2xl bg-gray-600 text-white font-semibold shadow active:scale-95"
                  onClick={() => onNavigate("versionInfo")}>
            バージョン情報
          </button>
        </div>
      </div>
    </div>
  );
}
