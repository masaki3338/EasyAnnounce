import React, { useEffect, useState, useRef } from "react";
import localForage from "localforage";
import { ScreenType } from "./pre-game-announcement";

interface Props {
  onNavigate: (screen: ScreenType) => void;
  onBack?: () => void; // ← ✅ これを追加
}

type PositionInfo = {
  lastName: string;
  lastNameKana: string;
  honorific: string;
};

const SeatIntroduction: React.FC<Props> = ({ onNavigate }) => {
  const [teamName, setTeamName] = useState("");
  const [positions, setPositions] = useState<{ [key: string]: PositionInfo }>({});
  const [isHome, setIsHome] = useState(true); // true → 後攻

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const positionLabels: [string, string][] = [
    ["投", "ピッチャー"],
    ["捕", "キャッチャー"],
    ["一", "ファースト"],
    ["二", "セカンド"],
    ["三", "サード"],
    ["遊", "ショート"],
    ["左", "レフト"],
    ["中", "センター"],
    ["右", "ライト"],
  ];

  const inning = isHome ? "1回の裏" : "1回の表";

  useEffect(() => {
    const loadData = async () => {
      const team = await localForage.getItem<any>("team");
      const assignments = await localForage.getItem<{ [pos: string]: number }>("lineupAssignments");
      const matchInfo = await localForage.getItem<any>("match");

      if (team) setTeamName(team.name || "");
      if (matchInfo) setIsHome(matchInfo.isHome ?? true);

      if (assignments && team?.players) {
        const posMap: { [key: string]: PositionInfo } = {};
        Object.entries(assignments).forEach(([pos, playerId]) => {
          const player = team.players.find((p: any) => p.id === playerId);
          if (player) {
            posMap[pos] = {
              lastName: player.lastName,
              lastNameKana: player.lastNameKana,
              honorific: player.isFemale ? "さん" : "くん",
            };
          }
        });
        setPositions(posMap);
      }
    };
    loadData();
  }, []);

  const speakText = () => {
    stopSpeaking();
    const text = [
      `${inning} 守ります、${teamName} のシートをお知らせします。`,
      ...positionLabels.map(([pos, label]) => {
        const player = positions[pos];
        return `${label} ${player?.lastNameKana || "（みょうじ）"} ${player?.honorific || "くん"}`;
      }),
    ].join("、") + "です。";

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    speechSynthesis.speak(utter);
    utterRef.current = utter;
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    utterRef.current = null;
  };

  const formattedAnnouncement = `${inning}　守ります　${teamName} のシートをお知らせします。\n\n` +
    positionLabels
      .map(([pos, label]) => {
        const player = positions[pos];
        const nameHTML = player?.lastName
          ? `<ruby>${player.lastName}<rt>${player.lastNameKana || ""}</rt></ruby>`
          : "（苗字）";
        return `${label}　${nameHTML}　${player?.honorific || "くん"}`;
      })
      .join("<br />") + "です。";

  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-6 space-y-6">
      {/* 戻るボタン */}
    <button
      onClick={() => onNavigate("announcement")} // ← ✅ 正しい値に修正
      className="mb-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 text-sm text-white"
    >
      ← 試合前アナウンスメニューに戻る
    </button>

      {/* タイトル */}
      <h1 className="text-2xl font-bold text-center mb-2">シート紹介</h1>

      {/* 注意文 */}
      <div className="flex items-center space-x-2 -mt-2 mb-2">
        <img src="/icons/warning-icon.png" alt="注意" className="w-5 h-5" />
        <p className="text-blue-900 text-sm font-semibold">
          ピッチャーが練習球を1球投げてから
        </p>
      </div>

      {/* アナウンス表示 */}
      <div className="flex items-start border border-black bg-red-50 p-4 rounded-md mb-6 w-full max-w-lg">
        <img src="/icons/mic-red.png" alt="mic" className="w-10 h-10 mr-4" />
        <div
          className="text-red-600 font-semibold text-base whitespace-pre-line"
          dangerouslySetInnerHTML={{ __html: formattedAnnouncement }}
        />
      </div>

      {/* 読み上げ・停止 */}
      <div className="flex justify-center space-x-4">
        <button
          onClick={speakText}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded shadow"
        >
          読み上げ
        </button>
        <button
          onClick={stopSpeaking}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded shadow"
        >
          停止
        </button>
      </div>
    </div>
  );
};

export default SeatIntroduction;
