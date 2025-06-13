import React, { useState, useEffect } from "react";
import localForage from "localforage";

const positions = ["投", "捕", "一", "二", "三", "遊", "左", "中", "右"];
const positionNames: { [key: string]: string } = {
  投: "ピッチャー",
  捕: "キャッチャー",
  一: "ファースト",
  二: "セカンド",
  三: "サード",
  遊: "ショート",
  左: "レフト",
  中: "センター",
  右: "ライト",
};

const positionStyles: { [key: string]: React.CSSProperties } = {
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

type Player = {
  id: number;
  lastName: string;
  firstName: string;
  number: string;
};

const StartingLineup = () => {
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>(
    Object.fromEntries(positions.map((p) => [p, null]))
  );
  const [battingOrder, setBattingOrder] = useState<number[]>([]);

  useEffect(() => {
    localForage.getItem<{ players: Player[] }>("team").then((team) => {
      setTeamPlayers(team?.players || []);
    });
  }, []);

  useEffect(() => {
    localForage.getItem("lineupAssignments").then((saved) => {
      if (saved) setAssignments(saved as { [pos: string]: number | null });
    });
    localForage.getItem("battingOrder").then((saved) => {
      if (saved) setBattingOrder(saved as number[]);
    });
  }, []);

  const saveAssignments = async () => {
    await localForage.setItem("lineupAssignments", assignments);
    await localForage.setItem("battingOrder", battingOrder);
    alert("守備配置と打順を保存しました！");
  };

  const allowDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    playerId: number,
    fromPos?: string
  ) => {
    e.dataTransfer.setData("playerId", String(playerId));
    if (fromPos) e.dataTransfer.setData("fromPosition", fromPos);
  };

  const handleDropToPosition = (e: React.DragEvent<HTMLDivElement>, toPos: string) => {
    e.preventDefault();
    const playerId = Number(e.dataTransfer.getData("playerId"));
    const fromPos = e.dataTransfer.getData("fromPosition");
    const prevPlayerId = assignments[toPos];

    setAssignments((prev) => {
      const updated = { ...prev };

      if (fromPos && fromPos !== toPos) {
        // 守備間の交換
        updated[fromPos] = prevPlayerId ?? null;
      }

      updated[toPos] = playerId;
      return updated;
    });

    setBattingOrder((prev) => {
      const updated = [...prev];
      const isNew = !updated.includes(playerId);

      // 控え → 守備（元の守備選手の打順と入れ替え）
      if (isNew && prevPlayerId !== null) {
        const index = updated.indexOf(prevPlayerId);
        if (index !== -1) updated[index] = playerId;
      } else if (isNew) {
        updated.push(playerId);
      }

      return updated;
    });
  };

  const getPositionOfPlayer = (playerId: number) => {
    return Object.entries(assignments).find(([_, id]) => id === playerId)?.[0];
  };

  const handleBattingOrderDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    playerId: number
  ) => {
    e.dataTransfer.setData("battingPlayerId", String(playerId));
  };

  const handleDropToBattingOrder = (
    e: React.DragEvent<HTMLDivElement>,
    targetPlayerId: number
  ) => {
    e.preventDefault();
    const draggedPlayerId = Number(e.dataTransfer.getData("battingPlayerId"));

    setBattingOrder((prev) => {
      const fromIndex = prev.indexOf(draggedPlayerId);
      const toIndex = prev.indexOf(targetPlayerId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const updated = [...prev];
      [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
      return updated;
    });
  };

  const assignedIds = Object.values(assignments).filter(Boolean) as number[];
  const availablePlayers = teamPlayers.filter((p) => !assignedIds.includes(p.id));

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">スタメン設定（守備配置）</h1>

      {/* フィールド配置 */}
      <div className="relative w-[600px] h-[600px] mx-auto border bg-green-100 rounded overflow-hidden mb-8">
        <img src="/field.jpg" alt="Field" className="absolute w-full h-full object-cover" />
        {positions.map((pos) => {
          const playerId = assignments[pos];
          const player = teamPlayers.find((p) => p.id === playerId);
          return (
            <div
              key={pos}
              onDragOver={allowDrop}
              onDrop={(e) => handleDropToPosition(e, pos)}
              style={{
                ...positionStyles[pos],
                position: "absolute",
                transform: "translate(-50%, -50%)",
                backgroundColor: "rgba(255,255,255,0.85)",
                padding: "4px 8px",
                borderRadius: "8px",
                minWidth: "80px",
                textAlign: "center",
                cursor: player ? "move" : "default",
              }}
            >
              <div className="text-xs font-bold mb-1">
                {pos} ({positionNames[pos]})
              </div>
              {player ? (
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, player.id, pos)}
                >
                  {player.lastName}{player.firstName} ({player.number})
                </div>
              ) : (
                <div className="text-gray-400">空き</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 打順と控えを横並びに表示 */}
      <div className="flex flex-col md:flex-row justify-between gap-8">
        {/* 打順 */}
        <div className="flex-1">
          <h2 className="text-xl font-semibold mb-2">打順（1～9番）</h2>
          {battingOrder.map((playerId, i) => {
            const player = teamPlayers.find((p) => p.id === playerId);
            if (!player) return null;
            const pos = getPositionOfPlayer(playerId);
            return (
              <div
                key={playerId}
                className="mb-2 border p-2 bg-blue-100 cursor-move"
                draggable
                onDragStart={(e) => handleBattingOrderDragStart(e, playerId)}
                onDrop={(e) => handleDropToBattingOrder(e, playerId)}
                onDragOver={allowDrop}
              >
                <strong className="mr-2">{i + 1}番</strong>
                {pos ? `${positionNames[pos]} ` : "控え "}
                {player.lastName}{player.firstName} ({player.number})
              </div>
            );
          })}
        </div>

        {/* 控え選手 */}
        <div className="w-full md:w-1/3">
          <h2 className="text-xl font-semibold mb-2">控え選手</h2>
          <div className="grid grid-cols-1 gap-2">
            {availablePlayers.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => handleDragStart(e, p.id)}
                className="border p-2 rounded bg-gray-100 cursor-move"
              >
                {p.lastName}{p.firstName} ({p.number})
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        className="mt-6 bg-blue-600 text-white px-4 py-2 rounded"
        onClick={saveAssignments}
      >
        保存する
      </button>
    </div>
  );
};

export default StartingLineup;
