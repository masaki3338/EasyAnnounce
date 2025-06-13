import React, { useState } from 'react';

const mockBattingOrder = [
  { name: '山田太郎', number: 10 },
  { name: '佐藤健', number: 3 },
  { name: '鈴木翔', number: 7 },
  { name: '田中悠', number: 5 },
  { name: '高橋陸', number: 8 },
  { name: '伊藤蓮', number: 2 },
  { name: '中村豪', number: 1 },
  { name: '小林海', number: 9 },
  { name: '加藤駿', number: 6 },
];

const OffenseScreen: React.FC = () => {
  const [currentBatterIndex, setCurrentBatterIndex] = useState(0);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const speak = (text: string) => {
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    synth.speak(utter);
  };

  const showAnnouncement = (text: string) => {
    setAnnouncement(text);
    speak(text);
    setTimeout(() => setAnnouncement(null), 3000);
  };

  const handleNextBatter = () => {
    const nextIndex = (currentBatterIndex + 1) % mockBattingOrder.length;
    const batter = mockBattingOrder[nextIndex];
    setCurrentBatterIndex(nextIndex);
    showAnnouncement(`次の打者、${batter.name}、背番号${batter.number}`);
  };

  const handlePrevBatter = () => {
    const prevIndex =
      (currentBatterIndex - 1 + mockBattingOrder.length) % mockBattingOrder.length;
    const batter = mockBattingOrder[prevIndex];
    setCurrentBatterIndex(prevIndex);
    showAnnouncement(`前の打者、${batter.name}、背番号${batter.number}`);
  };

  const handleFoul = () => {
    showAnnouncement('ファールボール');
  };

  return (
    <div className="space-y-4">
      {/* アナウンスポップアップ */}
      {announcement && (
        <div className="bg-yellow-200 text-center py-2 px-4 rounded shadow text-lg font-bold">
          {announcement}
        </div>
      )}

      {/* 打順リスト */}
      <div className="grid grid-cols-1 gap-1">
        {mockBattingOrder.map((batter, index) => (
          <div
            key={index}
            className={`px-4 py-2 rounded ${
              index === currentBatterIndex
                ? 'bg-blue-500 text-white font-bold'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {index + 1}番　{batter.name}（{batter.number}）
          </div>
        ))}
      </div>

      {/* ナビゲーションボタン */}
      <div className="flex justify-around mt-2">
        <button
          onClick={handlePrevBatter}
          className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded shadow"
        >
          前打者へ
        </button>
        <button
          onClick={handleNextBatter}
          className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded shadow"
        >
          次打者へ
        </button>
      </div>

      {/* ファールボールボタン */}
      <div className="text-center mt-4">
        <button
          onClick={handleFoul}
          className="bg-red-600 hover:bg-red-700 text-white text-xl font-bold px-6 py-3 rounded-full shadow-lg"
        >
          ファールボール
        </button>
      </div>
    </div>
  );
};

export default OffenseScreen;
