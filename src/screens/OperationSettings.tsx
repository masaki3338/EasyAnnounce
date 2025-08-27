import type { ScreenType } from "../App";
import React, { useEffect, useState } from "react";
import localForage from "localforage";


type Props = {
  onNavigate: (s: ScreenType) => void;
  onOpenManual?: () => void; // ← 追加（AppのManualViewerを開くコールバック）
};

export default function OperationSettings({ onNavigate, onOpenManual }: Props) {

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

          {/* ▼ 連盟アナウンスマニュアル（Appのモーダルを開く） */}
          <button
            className="w-full py-5 rounded-2xl bg-gray-600 text-white font-semibold shadow active:scale-95"
            onClick={() => {
              if (onOpenManual) {
                onOpenManual(); // App.tsx の ManualViewer モーダルを起動
              } else {
                // フォールバック（props未提供なら別タブで開く）
                const url = `${window.location.origin}/manual.pdf#zoom=page-fit`;
                const win = window.open(url, "_blank", "noopener");
                if (!win) window.location.href = url;
              }
            }}
          >
            連盟アナウンスマニュアル
          </button>


          {/* ▼ 読み上げ設定（別画面へ） */}
          <button
            className="w-full py-5 rounded-2xl bg-gray-600 text-white font-semibold shadow active:scale-95"
            onClick={() => onNavigate?.("tts-settings")}
          >
            読み上げ設定
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
