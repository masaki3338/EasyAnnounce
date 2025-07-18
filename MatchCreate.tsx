import React, { useState, useEffect } from "react";
import localForage from "localforage";

type MatchCreateProps = {
  onBack: () => void;
  onGoToLineup: () => void;
};

const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onGoToLineup }) => {
  const [tournamentName, setTournamentName] = useState("");
  const [matchNumber, setMatchNumber] = useState(1);
  const [opponentTeam, setOpponentTeam] = useState("");
  const [isHome, setIsHome] = useState("先攻");
  const [benchSide, setBenchSide] = useState("1塁側");

  const [umpires, setUmpires] = useState([
    { role: "球審", name: "", furigana: "" },
    { role: "1塁審", name: "", furigana: "" },
    { role: "2塁審", name: "", furigana: "" },
    { role: "3塁審", name: "", furigana: "" },
  ]);

  useEffect(() => {
    const loadMatchInfo = async () => {
      const saved = await localForage.getItem<{
        tournamentName: string;
        matchNumber: number;
        opponentTeam: string;
        isHome: string;
        benchSide: string;
        umpires: { role: string; name: string; furigana: string }[];
      }>("matchInfo");

      if (saved) {
        setTournamentName(saved.tournamentName ?? "");
        setMatchNumber(saved.matchNumber ?? 1);
        setOpponentTeam(saved.opponentTeam ?? "");
        setIsHome(saved.isHome ?? "先攻");
        setBenchSide(saved.benchSide ?? "1塁側");

        if (saved.umpires?.length === 4) {
          setUmpires(saved.umpires);
        }
      }
    };
    loadMatchInfo();
  }, []);

  const handleUmpireChange = (
    index: number,
    field: "name" | "furigana",
    value: string
  ) => {
    const updated = [...umpires];
    updated[index][field] = value;
    setUmpires(updated);
  };

  const handleSave = async () => {
    const matchInfo = {
      tournamentName,
      matchNumber,
      opponentTeam,
      isHome: isHome === "後攻", // ✅ booleanとして保存
      benchSide,
      umpires,
      inning: 1,         // ✅ 初期イニングを追加
      isTop: true        // ✅ 初期は「表」に設定
    };

    await localForage.setItem("matchInfo", matchInfo);
    alert("\u2705 試合情報を保存しました");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 overflow-auto">
      <button
        onClick={onBack}
        className="mb-4 px-4 py-3 bg-gray-300 rounded-lg hover:bg-gray-400 text-base"
      >
        ← メニューに戻る
      </button>

      <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">
        試合情報入力
      </h2>

      <div className="space-y-5">
        <div>
          <label className="block font-semibold text-lg mb-1">大会名</label>
          <div className="flex items-center space-x-4">
            <input
              type="text"
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              className="flex-1 p-3 border rounded-lg text-lg"
              placeholder="大会名を入力"
            />
            <div className="flex items-center space-x-2">
              <span className="text-lg">本日の</span>
              <select
                value={matchNumber}
                onChange={(e) => setMatchNumber(Number(e.target.value))}
                className="p-2 border rounded-lg text-lg"
              >
                {[1, 2, 3, 4, 5].map((num) => (
                  <option key={num} value={num}>
                    第{num}試合
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-lg mb-1">相手チーム名</label>
          <input
            type="text"
            value={opponentTeam}
            onChange={(e) => setOpponentTeam(e.target.value)}
            className="w-full p-3 border rounded-lg text-lg"
            placeholder="相手チーム名を入力"
          />
        </div>

        <div>
          <label className="block font-semibold text-lg mb-2">自チーム情報</label>
          <div className="flex space-x-4">
            <select
              value={isHome}
              onChange={(e) => setIsHome(e.target.value)}
              className="flex-1 p-3 border rounded-lg text-lg"
            >
              <option>先攻</option>
              <option>後攻</option>
            </select>

            <select
              value={benchSide}
              onChange={(e) => setBenchSide(e.target.value)}
              className="flex-1 p-3 border rounded-lg text-lg"
            >
              <option>1塁側</option>
              <option>3塁側</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-lg mb-3">審判</label>
          <div className="space-y-3">
            {umpires.map((umpire, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row sm:items-center sm:space-x-3"
              >
                <span className="w-full sm:w-20 font-medium text-base mb-1 sm:mb-0">
                  {umpire.role}
                </span>
                <input
                  type="text"
                  placeholder="氏名"
                  value={umpire.name}
                  onChange={(e) =>
                    handleUmpireChange(index, "name", e.target.value)
                  }
                  className="flex-1 p-3 border rounded-lg text-base mb-2 sm:mb-0"
                />
                <input
                  type="text"
                  placeholder="ふりがな"
                  value={umpire.furigana}
                  onChange={(e) =>
                    handleUmpireChange(index, "furigana", e.target.value)
                  }
                  className="flex-1 p-3 border rounded-lg text-base"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
        <button
          onClick={handleSave}
          className="w-full sm:w-auto px-6 py-4 bg-green-600 text-white rounded-lg text-lg hover:bg-green-700"
        >
          保存する
        </button>

        <button
          onClick={async () => {
            const matchInfo = {
              tournamentName,
              matchNumber,
              opponentTeam,
              isHome: isHome === "後攻", // ✅ booleanとして保存
              benchSide,
              umpires,
              inning: 1,
              isTop: true,
            };
            await localForage.setItem("matchInfo", matchInfo);
            onGoToLineup();
          }}
          className="w-full sm:w-auto px-6 py-4 bg-blue-600 text-white rounded-lg text-lg hover:bg-blue-700"
        >
         スタメン設定
        </button>
      </div>
    </div>
  );
};

export default MatchCreate;
