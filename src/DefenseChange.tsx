import React, { useEffect, useState } from "react";
import localForage from "localforage";
import { useNavigate } from "react-router-dom";

type Player = {
  id: number;
  name?: string;
  lastName?: string;
  firstName?: string;
  number: string;
};

const positionStyles: Record<string, React.CSSProperties> = {
  投: { top: "45%", left: "50%" },
  捕: { top: "70%", left: "50%" },
  一: { top: "60%", left: "80%" },
  二: { top: "40%", left: "70%" },
  三: { top: "60%", left: "20%" },
  遊: { top: "40%", left: "30%" },
  左: { top: "20%", left: "10%" },
  中: { top: "10%", left: "50%" },
  右: { top: "20%", left: "90%" },
};

const positions = Object.keys(positionStyles);
const BENCH = "控え";

const formatPlayerLabel = (player?: Player | null): string => {
  if (!player) return "空き";
  if (player.name) return player.name;
  return `${player.lastName ?? ""}${player.firstName ?? ""}（${player.number}）`;
};

const formatLog = (pos: string, player?: Player | null): string =>
  `${pos}：${formatPlayerLabel(player)}`;

const DefenseChange: React.FC = () => {
  const [assignments, setAssignments] = useState<Record<string, number | null>>({});
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [benchPlayers, setBenchPlayers] = useState<Player[]>([]);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [substitutionLogs, setSubstitutionLogs] = useState<string[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const savedAssignments = await localForage.getItem<Record<string, number | null>>("lineupAssignments");
      const savedTeam = await localForage.getItem<{ name: string; players: Player[] }>("team");

      if (savedAssignments) setAssignments(savedAssignments);
      if (savedTeam?.players) {
        setTeamPlayers(savedTeam.players);
        const assignedIds = savedAssignments ? Object.values(savedAssignments).filter((id): id is number => id !== null) : [];
        setBenchPlayers(savedTeam.players.filter((p) => !assignedIds.includes(p.id)));
      }
      setIsLoading(false);
    })();
  }, []);

  const handlePositionDragStart = (pos: string) => setDraggingFrom(pos);

  const handleBenchDragStart = (e: React.DragEvent, playerId: number) => {
    e.dataTransfer.setData("playerId", playerId.toString());
    setDraggingFrom(BENCH);
  };

  const handleDrop = (toPos: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggingFrom) return;

    setAssignments((prev) => {
      const newAssignments = { ...prev };

      if (draggingFrom !== BENCH && toPos !== BENCH && draggingFrom !== toPos) {
        const fromId = newAssignments[draggingFrom] ?? null;
        const toId = newAssignments[toPos] ?? null;

        newAssignments[draggingFrom] = toId;
        newAssignments[toPos] = fromId;

        updateLog(draggingFrom, fromId, toPos, toId);
        return newAssignments;
      }

      if (draggingFrom === BENCH && toPos !== BENCH) {
        const playerIdStr = e.dataTransfer.getData("playerId");
        if (!playerIdStr) return prev;
        const playerId = Number(playerIdStr);

        const replacedId = newAssignments[toPos];

        let updatedBench = [...benchPlayers];
        if (replacedId !== null) {
          const replacedPlayer = teamPlayers.find((p) => p.id === replacedId);
          if (replacedPlayer && !updatedBench.some((p) => p.id === replacedPlayer.id)) {
            updatedBench.push(replacedPlayer);
          }
        }
        updatedBench = updatedBench.filter((p) => p.id !== playerId);

        setBenchPlayers(updatedBench);
        newAssignments[toPos] = playerId;

        updateLog(BENCH, playerId, toPos, replacedId);
        return newAssignments;
      }

      return prev;
    });

    setDraggingFrom(null);
  };

  const updateLog = (
    fromPos: string,
    fromId: number | null,
    toPos: string,
    toId: number | null
  ) => {
    const fromPlayer = teamPlayers.find((p) => p.id === fromId);
    const toPlayer = teamPlayers.find((p) => p.id === toId);

    if (!fromPlayer && !toPlayer) return;
    if (fromId !== null && toId !== null && fromId === toId) return;

    const newLog = `${formatLog(fromPos, fromPlayer)} ⇄ ${formatLog(toPos, toPlayer)}`;
    const reversedLog = `${formatLog(toPos, toPlayer)} ⇄ ${formatLog(fromPos, fromPlayer)}`;

    setSubstitutionLogs((prev) => {
      if (prev.includes(newLog)) return prev;
      if (prev.includes(reversedLog)) return prev.filter((log) => log !== reversedLog);
      return [...prev, newLog];
    });
  };

  const getEffectiveSubstitutionLogs = (logs: string[]): string[] => {
    const filteredLogs = [...logs];
    const toRemove = new Set<number>();

    for (let i = 0; i < filteredLogs.length; i++) {
      if (toRemove.has(i)) continue;
      const log = filteredLogs[i];
      const reversedLog = log.split(" ⇄ ").reverse().join(" ⇄ ");
      for (let j = i + 1; j < filteredLogs.length; j++) {
        if (filteredLogs[j] === reversedLog) {
          toRemove.add(i);
          toRemove.add(j);
          break;
        }
      }
    }

    return filteredLogs.filter((_, idx) => !toRemove.has(idx));
  };

  const confirmChange = async () => {
    const savedAssignments = await localForage.getItem<Record<string, number | null>>("lineupAssignments");
    const isSame = positions.every((pos) => assignments[pos] === savedAssignments?.[pos]);

    if (isSame) {
      await localForage.removeItem("substitutions");
      alert("交代はありません。交代内容を削除しました。");
      navigate(-1);
      return;
    }

    await localForage.setItem("substitutions", substitutionLogs);
    await localForage.setItem("lineupAssignments", assignments);
    setShowSaveModal(true);
  };

  const handleSpeak = () => {
    const effectiveLogs = getEffectiveSubstitutionLogs(substitutionLogs);
    if (effectiveLogs.length === 0) return;

    const text = `守備交代をお知らせします。${effectiveLogs.join("、")}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
  };

  if (isLoading) {
    return <div className="text-center text-gray-500 mt-10">読み込み中...</div>;
  }

  const effectiveLogs = getEffectiveSubstitutionLogs(substitutionLogs);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">守備交代</h1>

      <div className="relative w-full max-w-2xl mx-auto mb-6">
        <img src="/field.jpg" alt="フィールド図" className="w-full rounded shadow" />
        {positions.map((pos) => (
          <div
            key={pos}
            draggable
            onDragStart={() => handlePositionDragStart(pos)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(pos, e)}
            className="absolute text-xs font-bold text-white bg-black bg-opacity-60 rounded px-1 py-0.5 cursor-move"
            style={{ ...positionStyles[pos], transform: "translate(-50%, -50%)" }}
          >
            {pos}: {formatPlayerLabel(teamPlayers.find((p) => p.id === assignments[pos]) ?? null)}
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-2">控え選手</h2>
      <div
        className="flex flex-wrap gap-2 mb-6"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(BENCH, e)}
      >
        {benchPlayers.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => handleBenchDragStart(e, p.id)}
            className="px-2 py-1 bg-gray-200 rounded cursor-move select-none"
          >
            {formatPlayerLabel(p)}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">交代内容</h2>
        {effectiveLogs.length > 0 ? (
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr>
                <th className="border border-gray-300 px-2 py-1">交代元</th>
                <th className="border border-gray-300 px-2 py-1">交代先</th>
              </tr>
            </thead>
            <tbody>
              {effectiveLogs.map((line, index) => (
                <tr key={index}>
                  {line.split(" ⇄ ").map((side, i) => (
                    <td key={i} className="border border-gray-300 px-2 py-1">
                      {side}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500">交代はありません。</p>
        )}
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={confirmChange}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
        >
          交代を確定する
        </button>
      </div>

{showSaveModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded p-6 max-w-md w-full text-left">
      {/* 自チーム名 */}
      <p className="mb-4 font-semibold text-lg">
        選手の交代をお知らせいたします。
      </p>

      {/* 交代詳細 */}
      <div className="mb-6 space-y-3 text-sm">
        {effectiveLogs.map((log, index) => {
          // log は "交代元 ⇄ 交代先" 形式
          const [fromStr, toStr] = log.split(" ⇄ ");

          // fromStr = "ポジション：選手名"
          // toStr = "ポジション：選手名"
          // からポジションと選手名を抽出
          const [fromPos, fromPlayerNameRaw] = fromStr.split("：");
          const [toPos, toPlayerNameRaw] = toStr.split("：");

          // playerNameRaw は「名前（背番号）」形式なので背番号はカッコ内にあると想定
          // 交代先の選手をIDでteamPlayersから検索して詳細取得
          // ただしログは文字列なので playerId は不明。assignmentsから探すのが面倒なので
          // toPlayerNameRawから背番号だけ抜き出すため正規表現で数字を取得する簡易処理

          const extractNumber = (str: string) => {
            const match = str.match(/（(\d+)）/);
            return match ? match[1] : "";
          };
          const toNumber = extractNumber(toPlayerNameRaw);

          // 打順はteamPlayersのindex+1で想定
          // 交代先選手の名前（背番号）でplayerをteamPlayersから検索（背番号で検索）
          const toPlayer = teamPlayers.find(
            (p) => p.number === toNumber
          );

          // 打順 = 配列インデックス + 1（なければ空白）
          const battingOrder = toPlayer
            ? teamPlayers.findIndex((p) => p.id === toPlayer.id) + 1
            : "";

          return (
            <div key={index} className="border-b border-gray-300 pb-2">
              <p>
                {fromPos} {fromPlayerNameRaw} に代わりまして {toPlayerNameRaw} が入ります。
              </p>
              {battingOrder && toPlayer && (
                <p>
                  {battingOrder}番 {toPos} {toPlayerNameRaw} 背番号 {toPlayer.number}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 音声読み上げ・停止・閉じるボタン */}
      <div className="flex justify-center gap-4 mb-4">
        <button
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          onClick={() => {
            handleSpeak();
          }}
        >
          音声読み上げ
        </button>
        <button
          className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
          onClick={() => {
            handleStop();
          }}
        >
          音声停止
        </button>
      </div>

      <button
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full"
        onClick={() => {
          setShowSaveModal(false);
          navigate(-1);
        }}
      >
        閉じる
      </button>
    </div>
  </div>
)}
    </div>
  );
};

export default DefenseChange;
