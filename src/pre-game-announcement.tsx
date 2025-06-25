import React from "react";

// ScreenTypeをここに定義 or 別ファイルからインポートしてください
export type ScreenType =
  | "menu"
  | "teamRegister"
  | "matchCreate"
  | "startingLineup"
  | "startGame"
  | "announcement"
  | "warmup"
  | "sheetKnock"
  | "announceStartingLineup"
  | "templateEdit"
  | "offense"
  | "defense";

interface Props {
  onNavigate: (step: ScreenType) => void;
  onBack: () => void;
}

const PreGameAnnouncement: React.FC<Props> = ({ onNavigate, onBack }) => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-6 py-10">
      <h1 className="text-3xl font-bold mb-10 text-center">
        試合前アナウンス メニュー
      </h1>

      <div className="w-full max-w-md space-y-6">
        <button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg text-lg font-semibold"
          onClick={() => onNavigate("warmup")}
        >
          ウォーミングアップ
        </button>

        <button
          className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-lg text-lg font-semibold"
          onClick={() => onNavigate("sheetKnock")}
        >
          シートノック
        </button>

        <button
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-lg text-lg font-semibold"
          onClick={() => onNavigate("announceStartingLineup")}
        >
          スタメン発表
        </button>

        <button
          className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 py-3 rounded-lg text-base mt-8"
          onClick={onBack}
        >
          ← 試合開始画面に戻る
        </button>
      </div>
    </div>
  );
};

export default PreGameAnnouncement;
