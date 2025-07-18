import React, { useState, useEffect } from "react";
import localForage from "localforage";

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDrag, useDrop } from "react-dnd";

type OffenseScreenProps = {
  onSwitchToDefense: () => void;
  onBack?: () => void;
};

type MatchInfo = {
  opponentTeam: string;
  inning?: number;
  isTop?: boolean;
  isDefense?: boolean;
  isHome?: boolean; // ✅ ←追加
};

const DraggablePlayer = ({ player }: { player: any }) => {
  const [, drag] = useDrag({
    type: "player",
    item: { player },
  });
  return (
    <div
      ref={drag}
      className="cursor-pointer hover:bg-gray-100 border p-2 rounded bg-white"
    >
      {player.lastName} {player.firstName} #{player.number}
    </div>
  );
};

// ⬇️ ドロップ先（1塁・2塁・3塁ランナー）
const DropTarget = ({ base, runnerAssignments, replacedRunners, setRunnerAssignments, setReplacedRunners }: any) => {
  const [, drop] = useDrop({
    accept: "player",
    drop: (item: any) => {
      const replaced = runnerAssignments[base];
      setRunnerAssignments((prev: any) => ({ ...prev, [base]: item.player }));
      setReplacedRunners((prev: any) => ({ ...prev, [base]: replaced || null }));
    },
  });

  const runner = runnerAssignments[base];
  const replaced = replacedRunners[base];

  return (
    <div ref={drop} className="p-2 border rounded bg-gray-100 min-h-[60px]">
      <div className="text-lg font-bold text-red-600">{base}ランナー</div>
      {replaced && (
        <div className="line-through text-black">
          {replaced.lastName} {replaced.firstName} #{replaced.number}
        </div>
      )}
      {runner && (
        <div className="text-red-600">
          {runner.lastName} {runner.firstName} #{runner.number}
        </div>
      )}
    </div>
  );
};

const positionNames: { [key: string]: string } = {
  "投": "ピッチャー",
  "捕": "キャッチャー",
  "一": "ファースト",
  "二": "セカンド",
  "三": "サード",
  "遊": "ショート",
  "左": "レフト",
  "中": "センター",
  "右": "ライト",
};

const OffenseScreen: React.FC<OffenseScreenProps> = ({ onSwitchToDefense, onBack }) => {
  const [players, setPlayers] = useState<any[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [battingOrder, setBattingOrder] = useState<
    { id: number; reason: string }[]
  >([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [currentBatterIndex, setCurrentBatterIndex] = useState(0);
  const [announcement, setAnnouncement] = useState<React.ReactNode>(null);
const [scores, setScores] = useState<{ [inning: number]: { top: number; bottom: number } }>({});
const [isLeadingBatter, setIsLeadingBatter] = useState(true);
const [announcedPlayerIds, setAnnouncedPlayerIds] = useState<number[]>([]);
const [substitutedIndices, setSubstitutedIndices] = useState<number[]>([]);
const [selectedRunnerIndex, setSelectedRunnerIndex] = useState<number | null>(null);
const [selectedSubRunner, setSelectedSubRunner] = useState<any | null>(null);
const [selectedBase, setSelectedBase] = useState<"1塁" | "2塁" | "3塁" | null>(null);
  const [teamName, setTeamName] = useState("");
  const [opponentTeam, setOpponentTeam] = useState("");
  const [inning, setInning] = useState(1);
  const [isTop, setIsTop] = useState(true);
  const [isHome, setIsHome] = useState(false); // 自チームが後攻かどうか

  const [usedPlayerInfo, setUsedPlayerInfo] = useState<Record<number, any>>({});
    useEffect(() => {
    const loadUsedInfo = async () => {
      const info = await localForage.getItem<Record<number, any>>("usedPlayerInfo");
      if (info) {
        setUsedPlayerInfo(info);
        console.log("✅ 読み込んだ usedPlayerInfo:", info);
      }
    };
    loadUsedInfo();
  }, []);

  const [showDefensePrompt, setShowDefensePrompt] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const team = await localForage.getItem("team");
      const order = await localForage.getItem("battingOrder");
      const lineup = await localForage.getItem("lineupAssignments");
      const matchInfo = await localForage.getItem<MatchInfo>("matchInfo");
        const loadBattingOrder = async () => {
    const order = await localForage.getItem<number[]>("battingOrder");
    if (order) setBattingOrder(order);
  };
  //loadBattingOrder();


if (team && typeof team === "object") {
  const all = (team as any).players || [];
  setAllPlayers(all);
  setPlayers(all);
  setTeamName((team as any).name || "");

  const starters = (order as { id: number; reason: string }[]).map(e => e.id);

  const benchOutIds: number[] = await localForage.getItem("benchOutIds") || [];

  const bench = all.filter((p: any) =>
    !starters.includes(p.id) && !benchOutIds.includes(p.id)
  );

  setBenchPlayers(bench);
}

      if (order && Array.isArray(order)) {
        setBattingOrder(order as { id: number; reason: string }[]);

        // ✅ 前回の打者を取得して次の先頭打者に設定
        const lastBatter = await localForage.getItem<number>("lastBatterIndex");
        if (lastBatter !== null && typeof lastBatter === "number" && order.length > 0) {
          const nextBatterIndex = (lastBatter + 1) % order.length;
          setCurrentBatterIndex(nextBatterIndex);
          setIsLeadingBatter(true); // 先頭打者として認識
        }
      }

      if (lineup && typeof lineup === "object") {
        setAssignments(lineup as { [pos: string]: number | null });
      }
      if (matchInfo) {
        setOpponentTeam(matchInfo.opponentTeam || "");
        setInning(matchInfo.inning || 1);
        setIsTop(matchInfo.isTop ?? true);
        setIsHome(matchInfo.isHome ?? false);
      }
    
      const savedScores = await localForage.getItem("scores");
      if (savedScores && typeof savedScores === "object") {
        setScores(savedScores as any);
      }
      const savedAnnouncedIds = await localForage.getItem<number[]>("announcedPlayerIds");
      if (savedAnnouncedIds) setAnnouncedPlayerIds(savedAnnouncedIds);
    };
    loadData();
  }, []);

  const [showModal, setShowModal] = useState(false);
const [inputScore, setInputScore] = useState("");
const [showSubModal, setShowSubModal] = useState(false);
const [selectedSubPlayer, setSelectedSubPlayer] = useState<any | null>(null);
const [benchPlayers, setBenchPlayers] = useState<any[]>([]);
const [showRunnerModal, setShowRunnerModal] = useState(false);
const [isRunnerConfirmed, setIsRunnerConfirmed] = useState(false);
const [runnerAnnouncement, setRunnerAnnouncement] = useState<string[]>([]);
const [runnerAssignments, setRunnerAssignments] = useState<{ [base: string]: any | null }>({
  "1塁": null,
  "2塁": null,
  "3塁": null,
});
const [replacedRunners, setReplacedRunners] = useState<{ [base: string]: any | null }>({});

const handleScoreInput = (digit: string) => {
  if (inputScore.length < 2) {
    setInputScore(prev => prev + digit);
  }
};

const confirmScore = async () => {
  const score = parseInt(inputScore || "0", 10);
  const updatedScores = { ...scores };
  const index = inning - 1;

  if (!updatedScores[index]) {
    updatedScores[index] = { top: 0, bottom: 0 };
  }

  // ✅ 自チームの攻撃なので、先攻ならtopに、後攻ならbottomに記録
  if (!isHome) {
    updatedScores[index].top = score;
  } else {
    updatedScores[index].bottom = score;
  }

  await localForage.setItem("scores", updatedScores);
  setScores(updatedScores);
  setInputScore("");
  setShowModal(false);

  // ✅ この行を追加（打者インデックスを保存）
  await localForage.setItem("lastBatterIndex", currentBatterIndex);


  // ✅ イニング進行処理
  if (isTop) {
    setIsTop(false);
    await localForage.setItem("matchInfo", {
      opponentTeam,
      inning,
      isTop: false,
      isHome,
    });
  } else {
    const nextInning = inning + 1;
    setIsTop(true);
    setInning(nextInning);
    await localForage.setItem("matchInfo", {
      opponentTeam,
      inning: nextInning,
      isTop: true,
      isHome,
    });
  }

  // 守備画面へ遷移
  onSwitchToDefense();
};


const getPlayer = (id: number) =>
  players.find((p) => p.id === id) || allPlayers.find((p) => p.id === id);
  const getPosition = (id: number): string | null => {
    const entry = Object.entries(assignments).find(([_, pid]) => pid === id);
    const idx = battingOrder.findIndex((entry) => entry.id === id); // ✅ 修正

    if (Object.values(runnerAssignments).some(p => p?.id === id)) return "代走";
    if (substitutedIndices.includes(idx)) return "代打";
    if (entry) return positionNames[entry[0]];
    return null;
  };


const announce = (text: string) => {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ja-JP";
  speechSynthesis.speak(utter);
};

const handleNext = () => {
  const next = (currentBatterIndex + 1) % battingOrder.length;
  setCurrentBatterIndex(next);
  setIsLeadingBatter(false); // ⬅ 追加
};

const handlePrev = () => {
  const prev = (currentBatterIndex - 1 + battingOrder.length) % battingOrder.length;
  setCurrentBatterIndex(prev);
  setIsLeadingBatter(false); // ⬅ 追加
};

const updateAnnouncement = () => {
const entry = battingOrder[currentBatterIndex];
const player = getPlayer(entry?.id);
const pos = getPosition(entry?.id);

  if (player && pos) {
    const number = player.number;
    const honorific = player?.isFemale ? "さん" : "くん";
    const posName = pos;
    const isAnnouncedBefore = announcedPlayerIds.includes(entry.id);

    let lines: React.ReactNode[] = [];

    if (isLeadingBatter) {
      lines.push(
        <div>{`${inning}回${isTop ? "表" : "裏"}、${teamName}の攻撃は、`}</div>
      );
    }

    if (!isAnnouncedBefore) {
      lines.push(
        <div>
          {currentBatterIndex + 1}番 {posName}{" "}
          <ruby>{player.lastName}<rt>{player.lastNameKana}</rt></ruby>
          <ruby>{player.firstName}<rt>{player.firstNameKana}</rt></ruby>
          {honorific}、{posName}{" "}
          <ruby>{player.lastName}<rt>{player.lastNameKana}</rt></ruby>
          {honorific}、背番号{number}。
        </div>
      );
    } else {
      lines.push(
        <div>
          {currentBatterIndex + 1}番 {posName}{" "}
          <ruby>{player.lastName}<rt>{player.lastNameKana}</rt></ruby>
          {honorific}、背番号{number}。
        </div>
      );
    }

    setAnnouncement(<>{lines}</>);
  } else {
    setAnnouncement("⚠️ アナウンスに必要な選手情報が見つかりません。");
  }
};


const handleRead = async () => {
  const entry = battingOrder[currentBatterIndex]; // ✅ 修正
  const player = getPlayer(entry.id);             // ✅ 修正
  const pos = getPosition(entry.id);              // ✅ 修正

  if (player && pos) {
    const fullNameKana = `${player.lastNameKana || player.lastName}${player.firstNameKana || player.firstName}`;
    const lastNameKana = player.lastNameKana || player.lastName;
    const number = player.number;
    const honorific = player?.isFemale ? "さん" : "くん";
    const posName = pos;

    const isAnnouncedBefore = announcedPlayerIds.includes(entry.id);

    let text = "";

    if (!isAnnouncedBefore) {
      text = `${
        isLeadingBatter ? `${inning}回${isTop ? "表" : "裏"}、${teamName}の攻撃は、` : ""
      }${currentBatterIndex + 1}番 ${posName} ${fullNameKana}${honorific}、${posName} ${lastNameKana}${honorific}、背番号${number}。`;
    } else {
      text = `${currentBatterIndex + 1}番 ${posName} ${lastNameKana}${honorific}、背番号${number}。`;
    }

    announce(text);

    if (!isAnnouncedBefore) {
      const updated = [...announcedPlayerIds, entry.id];
      setAnnouncedPlayerIds(updated);
      await localForage.setItem("announcedPlayerIds", updated);
    }
  } else {
    setAnnouncement("⚠️ アナウンスに必要な選手情報が見つかりません。");
  }
};

useEffect(() => {
  updateAnnouncement(); // currentBatterIndexが変わるたびに実行
}, [currentBatterIndex]);

useEffect(() => {
  if (
    players.length > 0 &&
    battingOrder.length > 0 &&
    assignments &&
    teamName !== ""
  ) {
    updateAnnouncement();
  }
}, [players, battingOrder, assignments, teamName]);
   const status = (isHome && !isTop) || (!isHome && isTop) ? "攻撃中" : "守備中";

  return (
<DndProvider backend={HTML5Backend}>
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
        <span>（{teamName}） VS （{opponentTeam}）</span>
        <select value={inning} onChange={(e) => setInning(Number(e.target.value))}>
          {[...Array(9)].map((_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
        <span>回</span>
        <select value={isTop ? "表" : "裏"} onChange={(e) => setIsTop(e.target.value === "表")}>
          <option value="表">表</option>
          <option value="裏">裏</option>
        </select>
        <span>{status}</span>
      </h2>

      <table className="w-full border text-sm">
        <thead>
          <tr>
            <th>　</th>
            {[...Array(9)].map((_, i) => (
              <th key={i}>{i + 1}</th>
            ))}
            <th>計</th>
          </tr>
        </thead>
       <tbody>
        {[teamName, opponentTeam].map((name, rowIndex) => {
          const isMyTeam = rowIndex === (isHome ? 1 : 0); // 自チームが下段（後攻）なら rowIndex === 1

          return (
            <tr key={rowIndex}>
              <td>{name || (rowIndex === 0 ? "先攻チーム名" : "後攻チーム名")}</td>
              {[...Array(9)].map((_, i) => (
                <td
                  key={i}
                  className={`border-2 text-center ${
                    inning === i + 1 &&
                    ((isMyTeam && isTop !== isHome) || (!isMyTeam && isTop === isHome))
                      ? "bg-yellow-200"
                      : ""
                  }`}
                >
                  {
                    isMyTeam
                      ? (isHome ? scores[i]?.bottom : scores[i]?.top) ?? ""
                      : (isHome ? scores[i]?.top : scores[i]?.bottom) ?? ""
                  }
                </td>
              ))}
              <td>
                {Object.values(scores).reduce((sum, s) => {
                  const val = isMyTeam
                    ? isHome
                      ? s.bottom ?? 0
                      : s.top ?? 0
                    : isHome
                    ? s.top ?? 0
                    : s.bottom ?? 0;
                  return sum + Number(val);
                }, 0)}
              </td>
            </tr>
          );
        })}
      </tbody>

      </table>

{showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4">
      <h2 className="text-lg font-bold">得点を入力してください</h2>
      <div className="text-2xl border p-2 w-24 mx-auto">{inputScore || "0"}</div>
      <div className="grid grid-cols-3 gap-2">
        {[..."1234567890"].map((digit) => (
          <button
            key={digit}
            onClick={() => handleScoreInput(digit)}
            className="bg-blue-500 text-white p-2 rounded"
          >
            {digit}
          </button>
        ))}
      </div>
      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={confirmScore}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          OK
        </button>
        <button
          onClick={() => {
            setInputScore("");
            setShowModal(false);
          }}
          className="bg-gray-600 text-white px-4 py-2 rounded"
        >
          キャンセル
        </button>
      </div>
    </div>
    
  </div>
)}


      <div className="space-y-2 text-lg">
    {battingOrder.map((entry, idx) => {
      const player = getPlayer(entry.id);
      const isCurrent = idx === currentBatterIndex;
      const isSubstituted = substitutedIndices.includes(idx);
      const position = getPosition(entry.id); // ✅ 修正

      return (
        <div
          key={entry.id}
          onClick={() => {
            setCurrentBatterIndex(idx);
            setIsLeadingBatter(true);
          }}
          className={`px-2 py-1 border-b cursor-pointer ${
            isCurrent ? "bg-yellow-200" : ""
          }`}
        >
          {idx + 1}　{position ?? "　"}　
          <ruby>
            {player?.lastName ?? "苗字"}
            {player?.lastNameKana && <rt>{player.lastNameKana}</rt>}
          </ruby>
          <ruby>
            {player?.firstName ?? "名前"}
            {player?.firstNameKana && <rt>{player.firstNameKana}</rt>}
          </ruby>
          &nbsp;#{player?.number ?? "番号"}
        </div>
      );
    })}



</div>

      <div className="flex justify-center gap-4 my-2">
        <button onClick={handlePrev} className="bg-green-500 text-white px-4 py-2 rounded">
          前の打者
        </button>
        <button onClick={handleNext} className="bg-green-500 text-white px-4 py-2 rounded">
          次の打者
        </button>
      </div>

      {isLeadingBatter && (
        <div className="flex items-center text-blue-600 font-bold mb-2">
          <img src="/icons/warning-icon.png" alt="注意" className="w-5 h-5 mr-2" />
          <span>攻撃回1人目のバッター紹介は、キャッチャーが2塁に送球後にアナウンス</span>
        </div>
      )}

      <div className="border p-4 bg-red-50">
        <div className="flex items-center mb-2">
          <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mr-2" />
          <span className="text-red-600 font-bold whitespace-pre-line">
            {announcement || "アナウンス文がここに表示されます。"}
          </span>
        </div>
        <div className="flex gap-4">
          <button onClick={handleRead} className="bg-blue-600 text-white px-4 py-2 rounded">
            読み上げ
          </button>
          <button
            onClick={() => speechSynthesis.cancel()}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            停止
          </button>
        </div>
      </div>

<div className="flex justify-end space-x-2 mt-4">
  <button
    onClick={() => setShowRunnerModal(true)}
    className="bg-orange-600 text-white px-6 py-2 rounded"
  >
    代走
  </button>
  <button
    onClick={() => setShowSubModal(true)}
    className="bg-orange-600 text-white px-6 py-2 rounded"
  >
    代打
  </button>
  <button
    onClick={() => setShowModal(true)}
    className="bg-orange-600 text-white px-6 py-2 rounded"
  >
    イニング終了
  </button>
</div>



{showDefensePrompt && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4 max-w-sm w-full">
      <h2 className="text-lg font-bold text-red-600">守備位置の設定</h2>
      <p>代打／代走で出場した選手の守備位置を設定してください。</p>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        onClick={() => {
          setShowDefensePrompt(false);
          onChangeDefense(); // モーダル経由で守備画面へ
        }}
      >
        OK
      </button>
    </div>
  </div>
)}


{/* ✅ 代打　モーダル */}
{showSubModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-gray-200 p-6 rounded-xl shadow-xl text-center max-w-3xl w-full space-y-6">

      {/* タイトル */}
      <h2 className="text-3xl font-bold text-black">代打</h2>

      {/* 打者と代打選手を横並びで表示 */}
      <div className="flex flex-col lg:flex-row justify-center items-center gap-8">
        {/* 現打者（赤） */}
        <div className="text-red-600 font-bold text-xl">
          {currentBatterIndex + 1}番　
          {getPlayer(battingOrder[currentBatterIndex]?.id)?.lastName} {getPlayer(battingOrder[currentBatterIndex]?.id)?.firstName}　
          #{getPlayer(battingOrder[currentBatterIndex]?.id)?.number}
        </div>

        {/* 矢印 */}
        <div className="text-blue-600 text-3xl">⬅</div>

        {/* ベンチ選手（2段表示） */}
{/* ベンチ選手（退場選手はグレースケール） */}
<div className="flex flex-wrap justify-center gap-2 mb-4 max-h-32 overflow-y-auto">
  {benchPlayers.map((p) => {
    const isRetired = p.id in usedPlayerInfo;

    // ✅ ログ出力：選手IDと退場済みかどうか
  console.log(`選手ID ${p.id} - ${p.lastName}${p.firstName} は退場済み？:`, isRetired);
  console.log("✅ usedPlayerInfo keys:", Object.keys(usedPlayerInfo));
  console.log("🔍 checking player:", p.id);
    return (
      <div
        key={p.id}
        onClick={() => !isRetired && setSelectedSubPlayer(p)}
        className={`w-[22%] text-sm px-2 py-1 rounded border font-semibold text-center
          ${isRetired
            ? "bg-gray-300 text-gray-500 line-through cursor-not-allowed"
            : selectedSubPlayer?.id === p.id
              ? "bg-yellow-200 border-yellow-600 cursor-pointer"
              : "bg-gray-100 border-gray-400 cursor-pointer"}`}
      >
        {p.lastName} {p.firstName} #{p.number}
      </div>
    );
  })}
</div>

      </div>

      {/* アナウンス文（赤枠・マイク付き） */}
      <div className="border border-red-500 bg-red-100 text-red-700 p-4 rounded relative text-left">
        <div className="absolute -top-4 left-4 text-2xl">📢</div>
        <span className="whitespace-pre-line text-base font-bold text-red-700 leading-relaxed block mt-2 ml-6">
          {currentBatterIndex + 1}番{" "}
          <ruby>
            {getPlayer(battingOrder[currentBatterIndex]?.id)?.lastName}
            <rt>{getPlayer(battingOrder[currentBatterIndex]?.id)?.lastNameKana}</rt>
          </ruby>{" "}
          くん に代わりまして{" "}
          <ruby>
            {selectedSubPlayer?.lastName}
            <rt>{selectedSubPlayer?.lastNameKana}</rt>
          </ruby>{" "}
          <ruby>
            {selectedSubPlayer?.firstName}
            <rt>{selectedSubPlayer?.firstNameKana}</rt>
          </ruby>{" "}
          くん、バッターは{" "}
          <ruby>
            {selectedSubPlayer?.lastName}
            <rt>{selectedSubPlayer?.lastNameKana}</rt>
          </ruby>{" "}
          くん、背番号 {selectedSubPlayer?.number}
        </span>

        {/* 読み上げ・停止 */}
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={() => {
              const currentPlayer = getPlayer(battingOrder[currentBatterIndex]?.id);
              const sub = selectedSubPlayer;
              if (!currentPlayer || !sub) return;
              const kanaCurrent = currentPlayer.lastNameKana || currentPlayer.lastName || "";
              const kanaSubFull = `${sub.lastNameKana || sub.lastName || ""}${sub.firstNameKana || sub.firstName || ""}`;
              const kanaSubLast = sub.lastNameKana || sub.lastName || "";
              const honorific = sub.isFemale ? "さん" : "くん";

              announce(
                `${currentBatterIndex + 1}番 ${kanaCurrent} ${honorific} に代わりまして、` +
                `${kanaSubFull} ${honorific}、バッターは ${kanaSubLast} ${honorific}、背番号 ${sub.number}`
              );
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            読み上げ
          </button>
          <button
            onClick={() => speechSynthesis.cancel()}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            停止
          </button>
        </div>
      </div>

      {/* 下部の確定・キャンセルボタン */}
      <div className="flex flex-col lg:flex-row justify-center gap-4 mt-2">
<button
  onClick={async () => {
    // 2. UsedPlayerInfo に元選手情報を登録
    const replacedId = battingOrder[currentBatterIndex].id;
    const replaced = getPlayer(replacedId);
    const isStarter = battingOrder.find(e => e.id === replacedId)?.reason === "スタメン";

    if (replaced && selectedSubPlayer) {
      const usedInfo: Record<
        number,
        {
          fromPos: string;
          subId: number;
          reason: "代打" | "代走" | "守備交代";
          order: number;
          wasStarter: boolean;
        }
      > = (await localForage.getItem("usedPlayerInfo")) || {};

      // ✅ フル→略称変換マップ
      const posMap: Record<string, string> = {
        "ピッチャー": "投", "キャッチャー": "捕", "ファースト": "一",
        "セカンド": "二", "サード": "三", "ショート": "遊",
        "レフト": "左", "センター": "中", "ライト": "右",
        "投": "投", "捕": "捕", "一": "一", "二": "二", "三": "三",
        "遊": "遊", "左": "左", "中": "中", "右": "右",
      };

      const fullFromPos = getPosition(replaced.id); // 例: "サード"
      const fromPos = posMap[fullFromPos ?? ""] ?? fullFromPos ?? "";

      usedInfo[replaced.id] = {
        fromPos,                        // 守備位置（略称）
        subId: selectedSubPlayer.id,   // 交代で入った選手
        reason: "代打",                 // ← 今回は代打
        order: currentBatterIndex + 1, // 打順（1始まり）
        wasStarter: isStarter,         // スタメンかどうか
      };

      await localForage.setItem("usedPlayerInfo", usedInfo);
      setUsedPlayerInfo(usedInfo); // ← 明示的に state 更新
        console.log("✅ 攻撃画面で登録された usedPlayerInfo：", usedInfo);
    }


    if (selectedSubPlayer) {
      // 1. 打順の入れ替え
      const newOrder = [...battingOrder];
      newOrder[currentBatterIndex] = {
        id: selectedSubPlayer.id,
        reason: "代打",
      };


      setBattingOrder(newOrder);
      await localForage.setItem("battingOrder", newOrder); // ✅ これでOK

      if (!players.some(p => p.id === selectedSubPlayer.id)) {
        setPlayers(prev => [...prev, selectedSubPlayer]);
      }

      if (!allPlayers.some(p => p.id === selectedSubPlayer.id)) {
        setAllPlayers(prev => [...prev, selectedSubPlayer]);
      }

      if (!substitutedIndices.includes(currentBatterIndex)) {
        setSubstitutedIndices(prev => [...prev, currentBatterIndex]);
      }
      


      //setSelectedSubPlayer(null);
      setShowSubModal(false);
    }
  }}
  className="bg-orange-600 text-white px-6 py-2 rounded"
>
  確定
</button>
        <button
          onClick={() => setShowSubModal(false)}
          className="bg-green-600 text-white px-6 py-2 rounded"
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
)}



{showRunnerModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-xl shadow-xl w-[90%] max-w-4xl space-y-4">
      <h2 className="text-2xl font-bold">代走</h2>
      {/* ランナー表示（ドロップ先） */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <DropTarget
          base="1塁"
          runnerAssignments={runnerAssignments}
          replacedRunners={replacedRunners}
          setRunnerAssignments={setRunnerAssignments}
          setReplacedRunners={setReplacedRunners}
        />
        <DropTarget
          base="2塁"
          runnerAssignments={runnerAssignments}
          replacedRunners={replacedRunners}
          setRunnerAssignments={setRunnerAssignments}
          setReplacedRunners={setReplacedRunners}
        />
        <DropTarget
          base="3塁"
          runnerAssignments={runnerAssignments}
          replacedRunners={replacedRunners}
          setRunnerAssignments={setRunnerAssignments}
          setReplacedRunners={setReplacedRunners}
        />
      </div>
      {/* Step 1: 打順からランナー選択 */}
      {selectedRunnerIndex === null && (
  <div>
    <h3 className="text-lg font-bold mb-2">ランナーとして交代させたい選手を選択</h3>
      <div className="w-1/2 space-y-2">
        <h3 className="text-xl font-bold mb-2">ランナーを選択</h3>
        {battingOrder.map((entry, index) => {
          const player = getPlayer(entry.id); // ← id から teamPlayers を取得
          if (!player) return null;
          return (
            <div
              key={entry.id}
              className={`border p-2 rounded cursor-pointer ${
                selectedRunnerIndex === index ? "bg-yellow-100" : ""
              }`}
              onClick={() => setSelectedRunnerIndex(index)}
            >
              {index + 1}番 {player.lastName} {player.firstName} #{player.number}
            </div>
          );
        })}
      </div>
  </div>
)}


      {/* Step 2: ベンチから代走者選択 */}
      {selectedRunnerIndex !== null && selectedBase === null && (
        <div>
          <h3 className="text-lg font-bold mb-2">このランナーはどの塁にいますか？</h3>
          <div className="flex gap-4">
            {["1塁", "2塁", "3塁"].map((base) => (
              <button
                key={base}
                disabled={runnerAssignments[base] !== null}
                onClick={() => setSelectedBase(base as "1塁" | "2塁" | "3塁")}
                className={`px-4 py-2 border rounded ${
                  runnerAssignments[base] !== null ? "bg-gray-300 cursor-not-allowed" : "bg-white"
                }`}
              >
                {base}ランナー
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: 代走選手を選択して交代 */} 
      {selectedRunnerIndex !== null && selectedBase !== null && (
        <div>
          <h3 className="text-lg font-bold mb-2">代走として出す選手を選択</h3>
          <div className="grid grid-cols-2 gap-2">
            {benchPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => {
  if (selectedRunnerIndex === null || !selectedBase || !selectedSubRunner) return;

  const runnerId = battingOrder[selectedRunnerIndex]?.id;
  if (!runnerId) return;
  const replaced = getPlayer(runnerId);
  const player = selectedSubRunner;

  const baseLabel = selectedBase;
  const honorific = player.isFemale ? "さん" : "くん";

  setRunnerAssignments((prev) => ({
    ...prev,
    [selectedBase]: player,
  }));
  setRunnerAnnouncement((prev) => [
    ...prev,
    `${baseLabel}ランナー ${replaced?.lastName}${replaced?.isFemale ? "さん" : "くん"} に代わりまして、` +
    `${player.lastName}${honorific}、` +
    `${baseLabel}ランナーは ${player.lastName}${honorific}、背番号 ${player.number}`
  ]);
  setReplacedRunners((prev) => ({
    ...prev,
    [selectedBase]: replaced,
  }));
  setSelectedSubRunner(null);
}}

                className="p-2 border rounded hover:bg-gray-100"
              >
                {player.lastName} {player.firstName} #{player.number}
              </button>
            ))}
          </div>

        <button
          onClick={() => {
            setSelectedRunnerIndex(null);
            setSelectedBase(null);
            setSelectedSubRunner(null);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          もう1人
        </button>

        </div>
      )}

      {/* 🔁 クリアボタン：アナウンス文言の直前に移動 */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            setSelectedRunnerIndex(null);
            setSelectedBase(null);
            setSelectedSubRunner(null);
            setRunnerAssignments({ "1塁": null, "2塁": null, "3塁": null });
            setReplacedRunners({ "1塁": null, "2塁": null, "3塁": null });
            setRunnerAnnouncement([]);
          }}
          className="bg-gray-600 text-white px-4 py-2 rounded"
        >
          クリア
        </button>
      </div>
      {/* アナウンス表示（代走） */}
      {runnerAnnouncement && (
        <div className="border p-4 bg-red-50">
          <div className="flex items-center mb-2">
            <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mr-2" />
              <div className="text-red-600 font-bold space-y-1">
                {runnerAnnouncement.map((msg, idx) => (
                  <div key={idx}>{msg}</div>
                ))}
              </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => announce(runnerAnnouncement.join("、"))}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              読み上げ
            </button>
            <button
              onClick={() => speechSynthesis.cancel()}
              className="bg-red-600 text-white px-4 py-2 rounded"
            >
              停止
            </button>
          </div>
        </div>
      )}

      {/* ✅ 最下部に配置：確定＆キャンセルボタン */}
      <div className="flex justify-end gap-4 mt-6">
        <button
          onClick={() => {
            setShowRunnerModal(false);
            setSelectedRunnerIndex(null);
            setSelectedBase(null);
            setSelectedSubRunner(null);
            setIsRunnerConfirmed(true);
             // 🟡 ランナー情報から全ての代走を反映
            const newOrder = [...battingOrder];
            const newSubstituted: number[] = [...substitutedIndices];

            Object.entries(runnerAssignments).forEach(([base, runner]) => {
              const replaced = replacedRunners[base];
              if (runner && replaced) {
                const replacedIndex = battingOrder.findIndex(id => id === replaced.id);
                if (replacedIndex !== -1) {
                  newOrder[replacedIndex] = runner.id;
                  if (!players.some(p => p.id === runner.id)) {
                    setPlayers(prev => [...prev, runner]);
                  }
                  if (!allPlayers.some(p => p.id === runner.id)) {
                    setAllPlayers(prev => [...prev, runner]);
                  }
                  if (!newSubstituted.includes(replacedIndex)) {
                    newSubstituted.push(replacedIndex);
                  }
                }
              }
            });

            setBattingOrder(newOrder);
            setSubstitutedIndices(newSubstituted);
          }}
          className="bg-orange-600 text-white px-4 py-2 rounded"
        >
          確定
        </button>
        <button
          onClick={() => {
            setRunnerAssignments({ "1塁": null, "2塁": null, "3塁": null });
            setReplacedRunners({ "1塁": null, "2塁": null, "3塁": null });
            setSelectedRunnerIndex(null);
            setSelectedBase(null);
            setSelectedSubRunner(null);
            setRunnerAnnouncement([]);
            setShowRunnerModal(false);
          }}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          キャンセル
        </button>
      </div>


    </div>
  </div>
)}

    </div>
     </DndProvider>
  );
};

export default OffenseScreen;
