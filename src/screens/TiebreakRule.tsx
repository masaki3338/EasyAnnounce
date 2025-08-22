import React from "react";

export default function TiebreakRule({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-10 px-6">
      <div className="w-full max-w-2xl">
        <button className="mb-6 px-4 py-2 bg-gray-200 rounded" onClick={onBack}>
          ← 運用設定に戻る
        </button>
        <h2 className="text-2xl font-bold text-center mb-6">タイブレークルール</h2>
        <div className="p-6 rounded-xl bg-white shadow text-center text-gray-600">
          <p className="font-semibold">未実装の画面です（今後作成予定）</p>
        </div>
      </div>
    </div>
  );
}
