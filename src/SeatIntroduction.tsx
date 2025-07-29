import React, { useEffect, useState, useRef } from "react";
import localForage from "localforage";
import { ScreenType } from "./pre-game-announcement";

interface Props {
  onNavigate: (screen: ScreenType) => void;
  onBack?: () => void; // ← ✅ これを追加
  fromGame?: boolean; // ✅ 追加
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

  const inning = isHome ? "1回の表" : "1回の裏";

  useEffect(() => {
    const loadData = async () => {
      const team = await localForage.getItem<any>("team");
      const assignments = await localForage.getItem<{ [pos: string]: number }>("lineupAssignments");
      const matchInfo = await localForage.getItem<any>("matchInfo");

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

      if (!teamName) {
        return <div className="text-center mt-10 text-gray-500">読み込み中...</div>;
      }
  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-6 space-y-6">
      {/* 戻るボタン */}


      {/* タイトル */}
      <h1 className="text-2xl font-bold text-center mb-2">シート紹介</h1>



     {/* アナウンス表示 */}
      <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
        {/* ✅ マイク＋注意文を flex で横並びに */}
        <div className="flex items-center space-x-4 mb-2">
          {/* マイクアイコン */}
          <img src="/icons/mic-red.png" alt="mic" className="w-10 h-10" />

          {/* 注意文 */}
          <div className="bg-yellow-100 text-yellow-800 px-2 py-1 text-sm font-semibold text-left rounded border-l-4 border-yellow-500">
            <span className="mr-2 text-2xl">⚠️</span> ピッチャーが練習球を1球投げてから
          </div>
        </div>

        {/* アナウンス文 */}
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
