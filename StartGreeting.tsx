// StartGreeting.tsx
import React, { useEffect } from "react";

const StartGreeting: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  useEffect(() => {
    const message = "これより試合を開始いたします。よろしくお願いいたします。";
    const utter = new SpeechSynthesisUtterance(message);
    utter.lang = "ja-JP";
    speechSynthesis.speak(utter);
  }, []);

  return (
    <div className="p-6 text-center">
      <h1 className="text-3xl font-bold mb-6">試合開始挨拶</h1>
      <p className="text-xl mb-6">これより試合を開始いたします。よろしくお願いいたします。</p>
      <button
        className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
        onClick={onBack}
      >
        メニューに戻る
      </button>
    </div>
  );
};

export default StartGreeting;
