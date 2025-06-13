import React, { useState, useEffect } from "react";
import localForage from "localforage";

type MatchCreateProps = {
  onBack: () => void;
  onGoToLineup: () => void;
};

const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onGoToLineup }) => {
  const [tournamentName, setTournamentName] = useState("");
  const [opponentTeam, setOpponentTeam] = useState("");
  const [isHome, setIsHome] = useState("先攻");
  const [benchSide, setBenchSide] = useState("1塁側");

  const [umpires, setUmpires] = useState([
    { role: "球審", name: "", furigana: "" },
    { role: "1塁審", name: "", furigana: "" },
    { role: "2塁審", name: "", furigana: "" },
    { role: "3塁審", name: "", furigana: "" },
  ]);

  // 画面初期表示時に保存済みデータを読み込む
  useEffect(() => {
    const loadMatchInfo = async () => {
      const saved = await localForage.getItem<{
        tournamentName: string;
        opponentTeam: string;
        isHome: string;
        benchSide: string;
        umpires: { role: string; name: string; furigana: string }[];
      }>("matchInfo");

      if (saved) {
        setTournamentName(saved.tournamentName ?? "");
        setOpponentTeam(saved.opponentTeam ?? "");
        setIsHome(saved.isHome ?? "先攻");
        setBenchSide(saved.benchSide ?? "1塁側");

        // もし審判データがあればセット
        if (saved.umpires && saved.umpires.length === 4) {
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
      opponentTeam,
      isHome,
      benchSide,
      umpires,
    };

    await localForage.setItem("matchInfo", matchInfo);
    alert("✅ 試合情報を保存しました");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
      >
        ← メニューに戻る
      </button>

      <h2 className="text-2xl font-bold mb-6">試合情報入力</h2>

      <div className="space-y-4">
        <div>
          <label className="block font-semibold">大会名</label>
          <input
            type="text"
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label className="block font-semibold">相手チーム名</label>
          <input
            type="text"
            value={opponentTeam}
            onChange={(e) => setOpponentTeam(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label className="block font-semibold">自チーム情報</label>
          <div className="flex space-x-4 mt-2">
            <select
              value={isHome}
              onChange={(e) => setIsHome(e.target.value)}
              className="p-2 border rounded"
            >
              <option>先攻</option>
              <option>後攻</option>
            </select>

            <select
              value={benchSide}
              onChange={(e) => setBenchSide(e.target.value)}
              className="p-2 border rounded"
            >
              <option>1塁側</option>
              <option>3塁側</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block font-semibold mb-2">審判</label>
          <div className="space-y-2">
            {umpires.map((umpire, index) => (
              <div key={index} className="flex space-x-2 items-center">
                <span className="w-14">{umpire.role}</span>
                <input
                  type="text"
                  placeholder="氏名"
                  value={umpire.name}
                  onChange={(e) =>
                    handleUmpireChange(index, "name", e.target.value)
                  }
                  className="flex-1 p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="ふりがな"
                  value={umpire.furigana}
                  onChange={(e) =>
                    handleUmpireChange(index, "furigana", e.target.value)
                  }
                  className="flex-1 p-2 border rounded"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex space-x-4">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
        >
          保存する
        </button>

        <button
          onClick={onGoToLineup}
          className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          スタメン設定
        </button>
      </div>
    </div>
  );
};

export default MatchCreate;
