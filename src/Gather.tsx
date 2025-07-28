import React, { useEffect, useRef } from "react";

interface Props {
  onNavigate: (screen: string) => void; // 画面遷移用コールバック
}

const Gather: React.FC<Props> = ({ onNavigate }) => {
  const message = "両チームの選手はベンチ前にお集まりください。";
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
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


      {/* タイトル */}
      <h1 className="text-2xl font-bold text-gray-800">集合アナウンス</h1>

      {/* 注意アイコン付き文 */}
      <div className="flex items-center space-x-2 mt-2">

        <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold text-left">
          <span className="mr-2 text-2xl">⚠️</span> グランド整備終了後、選手がベンチ前に待機していない場合のみ  ※先攻チーム🎤
        </div>
      </div>

      {/* アナウンス表示 */}
      <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
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
