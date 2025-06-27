// SeatIntroduction.tsx
import React from "react";

const SeatIntroduction: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="p-6 text-center min-h-screen">
      <h1 className="text-3xl font-bold mb-6">シート紹介</h1>
      <p className="text-lg mb-6">ここにシート紹介の内容を表示します。</p>
      <button
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        onClick={onBack}
      >
        戻る
      </button>
    </div>
  );
};

export default SeatIntroduction;
