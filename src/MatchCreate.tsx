import React, { useState, useEffect } from "react";
import localForage from "localforage";

type MatchCreateProps = {
  onBack: () => void;
  onGoToLineup: () => void;
};

const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onGoToLineup }) => {
  const [tournamentName, setTournamentName] = useState("");
  const [recentTournaments, setRecentTournaments] = useState<string[]>([""]);
  const [matchNumber, setMatchNumber] = useState(1);
  const [opponentTeam, setOpponentTeam] = useState("");
  const [isHome, setIsHome] = useState("先攻");
  const [benchSide, setBenchSide] = useState("1塁側");
  const [showExchangeModal, setShowExchangeModal] = useState(false);

  const [umpires, setUmpires] = useState([
    { role: "球審", name: "", furigana: "" },
    { role: "1塁審", name: "", furigana: "" },
    { role: "2塁審", name: "", furigana: "" },
    { role: "3塁審", name: "", furigana: "" },
  ]);

useEffect(() => {
  const loadMatchInfo = async () => {
    // 大会名リスト（5件＋先頭空白）をロード
    const savedList = await localForage.getItem<string[]>("recentTournaments");
    if (savedList && Array.isArray(savedList) && savedList.length > 0) {
      // 先頭は必ず空白に補正
      const normalized = ["", ...savedList.filter((x) => x && x.trim() !== "")].slice(0, 6);
      setRecentTournaments(normalized);
    } else {
      setRecentTournaments([""]);
    }

    // 既存の試合情報をロード
    const saved = await localForage.getItem<{
      tournamentName: string;
      matchNumber: number;
      opponentTeam: string;
      isHome: string | boolean; // 過去互換
      benchSide: string;
      umpires: { role: string; name: string; furigana: string }[];
    }>("matchInfo");

    if (saved) {
      setTournamentName(saved.tournamentName ?? "");
      setMatchNumber(Number(saved.matchNumber ?? 1));
      setOpponentTeam(saved.opponentTeam ?? "");
      // 既存コードは "後攻" を boolean にマッピングしているので過去互換で吸収
      setIsHome(saved.isHome ? "後攻" : "先攻");
      setBenchSide(saved.benchSide ?? "1塁側");

      if (saved.umpires?.length === 4) {
        setUmpires(saved.umpires);
      }
    }
  };
  loadMatchInfo();
}, []);

// 大会名を「5件まで（先頭は空白）」で更新して保存するヘルパー
const upsertRecentTournaments = async (name: string) => {
  const trimmed = (name ?? "").trim();

  // 先頭空白以外は何も入力していない場合は保存スキップ
  if (trimmed === "") {
    setTournamentName("");
    return;
  }

  // 現在のリストから空白と重複を取り除き、先頭に今回を追加
  let list = recentTournaments.filter((t) => t !== "" && t !== trimmed);
  list.unshift(trimmed);                // 先頭に新規
  list = list.slice(0, 5);              // 最大5件
  const finalList = ["", ...list];      // 先頭は必ず空白

  setRecentTournaments(finalList);
  await localForage.setItem("recentTournaments", finalList);
};

  const speakExchangeMessage = () => {
  const msg = new SpeechSynthesisUtterance(
    `${tournamentName} 本日の第一試合、両チームのメンバー交換を行います。両チームのキャプテンと全てのベンチ入り指導者は、ボール3個とメンバー表とピッチングレコードを持って本部席付近にお集まりください。ベンチ入りのスコアラー、審判員、球場責任者、EasyScore担当、公式記録員、アナウンスもお集まりください。メンバーチェックと道具チェックはシートノックの間に行います。`
  );
  speechSynthesis.speak(msg);
};

const stopExchangeMessage = () => {
  speechSynthesis.cancel();
};

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
  // まず大会名リストを更新（5件上限、先頭空白維持）
  await upsertRecentTournaments(tournamentName);

  // 既存の試合情報保存は維持
  const team = await localForage.getItem<any>("team"); 
  const matchInfo = {
    tournamentName,
    matchNumber,
    opponentTeam,
    isHome: isHome === "後攻", // ✅ booleanとして保存（既存仕様）
    benchSide,
    umpires,
    inning: 1,         // ✅ 初期イニング
    isTop: true,       // ✅ 初期は表
    teamName: team?.name ?? ""
  };

  await localForage.setItem("matchInfo", matchInfo);
  await localForage.setItem("matchNumberStash", matchNumber);

  alert("✅ 試合情報を保存しました");
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
    {/* 左側：大会名リスト + 手入力（上書き） */}
    <div className="flex-1 space-y-2">
      <select
        value={tournamentName}
        onChange={(e) => setTournamentName(e.target.value)}
        className="w-full p-3 border rounded-lg text-lg"
      >
        {recentTournaments.map((name, i) => (
          <option key={i} value={name}>
            {name === "" ? "　" : name}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={tournamentName}
        onChange={(e) => setTournamentName(e.target.value)}
        className="w-full p-3 border rounded-lg text-lg"
        placeholder="大会名を入力（上書き可）"
      />
    </div>

    {/* 右側：本日の 第n試合（既存ロジックそのまま） */}
    <div className="flex items-center space-x-2">
      <span className="text-lg">本日の</span>
      <select
        value={matchNumber}
        onChange={async (e) => {
          const num = Number(e.target.value);
          setMatchNumber(num);

          // 既存：matchInfoへ即保存（マージ）
          const existing = await localForage.getItem<any>("matchInfo");
          await localForage.setItem("matchInfo", { ...(existing || {}), matchNumber: num });

          // ★ 追加：スタッシュにも保存（他画面で上書きされても復旧できる）
          await localForage.setItem("matchNumberStash", num);

          console.log("[MC:change] matchNumber saved →", num);
        }}
        className="p-2 border rounded-lg text-lg"
      >
        {[1, 2, 3, 4, 5].map((num) => (
          <option key={num} value={num}>第{num}試合</option>
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

{matchNumber === 1 && benchSide === "1塁側" && (
  <div className="mt-6">
    <button
      onClick={() => setShowExchangeModal(true)}
      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-base"
    >
      メンバー交換
    </button>
  </div>
)}

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
            // 先に大会名リストを更新
            await upsertRecentTournaments(tournamentName);

            const team = await localForage.getItem<any>("team");
            const matchInfo = {
              tournamentName,
              matchNumber,
              opponentTeam,
              isHome: isHome === "後攻",
              benchSide,
              umpires,
              inning: 1,
              isTop: true,
              teamName: team?.name ?? "" 
            };
            await localForage.setItem("matchInfo", matchInfo);
            await localForage.setItem("matchNumberStash", matchNumber);

            onGoToLineup();
          }}

          className="w-full sm:w-auto px-6 py-4 bg-blue-600 text-white rounded-lg text-lg hover:bg-blue-700"
        >
         スタメン設定
        </button>
      </div>

{showExchangeModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full space-y-4 text-base">
     {/* ✅ 注意表示ブロック */}
      <div className="flex items-center gap-2">
        <span className="font-semibold bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-2 py-1 rounded">
        <span className="text-2xl">⚠️</span>
          試合開始45分前に🎤
        </span>
        <button className="bg-white border border-gray-300 px-4 py-1 rounded-full text-sm">
          1塁側チーム🎤
        </button>
      </div>

      <div className="flex items-start leading-tight">
        <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mr-2" />
        <p className="whitespace-pre-line text-red-600 font-bold">
          <strong>{tournamentName}</strong>{"\n"}
          本日の第一試合、両チームのメンバー交換を行います。{"\n"}
          両チームのキャプテンと全てのベンチ入り指導者は、ボール3個とメンバー表と
          ピッチングレコードを持って本部席付近にお集まりください。{"\n"}
          ベンチ入りのスコアラー、審判員、球場責任者、EasyScore担当、
          公式記録員、アナウンスもお集まりください。{"\n"}
          メンバーチェックと道具チェックはシートノックの間に行います。
        </p>
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={speakExchangeMessage}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          読み上げ
        </button>
        <button
          onClick={stopExchangeMessage}
          className="px-3 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
        >
          停止
        </button>
        <button
          onClick={() => {
            stopExchangeMessage();
            setShowExchangeModal(false);
          }}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}


    </div>
  );
};

export default MatchCreate;
