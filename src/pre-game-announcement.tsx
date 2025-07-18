import React, { useEffect, useState } from "react";
import localForage from "localforage";

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
  | "defense"
  | "gather"
  | "startGreeting"
  | "seatIntroduction";

interface Props {
  onNavigate: (step: ScreenType) => void;
  onBack: () => void;
}

const PreGameAnnouncement: React.FC<Props> = ({ onNavigate, onBack }) => {
  const [isHome, setIsHome] = useState<"先攻" | "後攻">("先攻");

  useEffect(() => {
    const load = async () => {
      const matchInfo = await localForage.getItem("matchInfo");
      if (matchInfo && typeof matchInfo === "object") {
        const info = matchInfo as any;
        setIsHome(info.isHome || "先攻");
      }
    };
    load();
  }, []);

  const isFirst = isHome === "先攻";
  const grayClass = "bg-gray-300 text-gray-500 hover:bg-gray-300";
  const greenClass = "bg-green-600 text-white hover:bg-green-700";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-6 py-10">
      <h1 className="text-3xl font-bold mb-10 text-center">
        試合前アナウンス メニュー
      </h1>

      <div className="w-full max-w-md space-y-6">
        <button
          className={`w-full py-4 rounded-lg text-lg font-semibold ${!isFirst ? greenClass : grayClass}`}
          onClick={() => onNavigate("warmup")}
        >
          ウォーミングアップ（後攻チームアナウンス）
        </button>

        <button
          className={`w-full py-4 rounded-lg text-lg font-semibold ${greenClass}`}
          onClick={() => onNavigate("sheetKnock")}
        >
          シートノック
        </button>

        <button
          className={`w-full py-4 rounded-lg text-lg font-semibold ${greenClass}`}
          onClick={() => onNavigate("announceStartingLineup")}
        >
          スタメン発表
        </button>

        <button
          className={`w-full px-4 py-3 rounded-lg text-lg font-semibold ${isFirst ? greenClass : grayClass}`}
          onClick={() => onNavigate("gather")}
        >
          集合（先攻チームアナウンス）
        </button>

        <button
          className={`w-full px-4 py-3 rounded-lg text-lg font-semibold ${isFirst ? greenClass : grayClass}`}
          onClick={() => onNavigate("startGreeting")}
        >
          試合開始挨拶（先攻チームアナウンス）
        </button>

        <button
         className={`w-full px-4 py-3 rounded-lg text-lg font-semibold ${!isFirst ? greenClass : grayClass}`}
         onClick={() => onNavigate("seatIntroduction")}
        >
          シート紹介（後攻チームアナウンス）
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
