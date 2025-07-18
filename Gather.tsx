import React, { useEffect, useRef } from "react";

interface Props {
  onNavigate: (screen: string) => void; // 画面遷移用コールバック
}

const Gather: React.FC<Props> = ({ onNavigate }) => {
  const message = "両チームの選手はベンチ前にお集まりください。";
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    speakMessage();
    return () => stopSpeaking();
  }, []);

  const speakMessage = () => {
    stopSpeaking();
    const utter = new SpeechSynthesisUtterance(message);
    utter.lang = "ja-JP";
    speechSynthesis.speak(utter);
    utterRef.current = utter;
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    utterRef.current = null;
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-6 space-y-6">
      {/* 戻るボタン（Warmup.tsxと同じスタイル） */}
      <button
        onClick={() => onNavigate("preGameAnnouncement")}
        className="text-gray-600 hover:underline mb-4 block"
      >
        ← 試合前アナウンスメニューに戻る
      </button>

      {/* タイトル */}
      <h1 className="text-2xl font-bold text-gray-800">集合アナウンス</h1>

      {/* 注意アイコン付き文 */}
      <div className="flex items-center space-x-2 mt-2">
        <img src="/icons/warning-icon.png" alt="注意" className="w-5 h-5" />
        <p className="text-blue-900 text-sm font-semibold">
          グランド整備終了後、選手がベンチ前に待機していない場合のみ
        </p>
      </div>

      {/* アナウンス表示 */}
      <div className="flex items-center border border-black bg-red-50 px-4 py-3 rounded-md">
        <img src="/icons/mic-red.png" alt="Mic" className="w-10 h-10 mr-4" />
        <p className="text-red-600 font-semibold text-lg">{message}</p>
      </div>

      {/* 操作ボタン */}
      <div className="flex space-x-4 mt-4">
        <button
          onClick={speakMessage}
          className="bg-blue-500 text-white px-6 py-2 rounded shadow"
        >
          読み上げ
        </button>
        <button
          onClick={stopSpeaking}
          className="bg-red-500 text-white px-6 py-2 rounded shadow"
        >
          停止
        </button>
      </div>
    </div>
  );
};

export default Gather;
