import React, { useState, useEffect } from "react";
import localForage from "localforage";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';



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
  投: { top: "66%", left: "50%" },
  捕: { top: "88%", left: "50%" },
  一: { top: "66%", left: "82%" },
  二: { top: "44%", left: "66%" },
  三: { top: "66%", left: "18%" },
  遊: { top: "44%", left: "32%" },
  左: { top: "22%", left: "18%" },
  中: { top: "22%", left: "50%" },
  右: { top: "22%", left: "81%" },
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
  const [battingOrder, setBattingOrder] = useState<
    { id: number; reason: "スタメン" }[]
  >([]);


  const [benchOutIds, setBenchOutIds] = useState<number[]>([]);

  useEffect(() => {
    localForage.getItem<{ players: Player[] }>("team").then((team) => {
      setTeamPlayers(team?.players || []);
    });
    
  }, []);

  useEffect(() => {
  const loadInitialData = async () => {
    const team = await localForage.getItem<{ players: Player[] }>("team");
    setTeamPlayers(team?.players || []);

    const savedBenchOut = await localForage.getItem<number[]>("benchOutIds"); // 🔽 ①追加
    if (savedBenchOut) setBenchOutIds(savedBenchOut);                         // 🔽 ②追加

    const initialOrder = await localForage.getItem<{
      id: number;
      order: number;
      position: string;
    }[]>("initialBattingOrder");

    if (initialOrder && initialOrder.length > 0) {
      const newAssignments: { [pos: string]: number | null } = Object.fromEntries(
        positions.map((p) => [p, null])
      );
      const newBattingOrder: { id: number; reason: "スタメン" }[] = [];

      for (const entry of initialOrder) {
        newAssignments[entry.position] = entry.id;
        newBattingOrder[entry.order - 1] = { id: entry.id, reason: "スタメン" };
      }

      setAssignments(newAssignments);
      setBattingOrder(newBattingOrder);
    }
  };

  loadInitialData();
}, []);


useEffect(() => {
  if (battingOrder.length === 0) {
    const assignedIdsInOrder: number[] = [];
    for (const pos of positions) {
      const id = assignments[pos];
      if (id && !assignedIdsInOrder.includes(id)) {
        assignedIdsInOrder.push(id);
      }
    }
    if (assignedIdsInOrder.length > 0) {
      const trimmed = assignedIdsInOrder.slice(0, 9); // 最大9人
      setBattingOrder(trimmed.map((id) => ({ id, reason: "スタメン" })));
    }
  }
}, [assignments]);

  const saveAssignments = async () => {
    await localForage.setItem("benchOutIds", benchOutIds);
    await localForage.setItem("lineupAssignments", assignments);
    await localForage.setItem("battingOrder", battingOrder);
    // 🔽 追加：スタメン情報（打順・守備位置）を初期記録として保存
    const initialOrder = battingOrder.map((entry, index) => {
      const position = Object.entries(assignments).find(([_, id]) => id === entry.id)?.[0] ?? "－";
      return {
        id: entry.id,
        order: index + 1,
        position,
      };
    });
    await localForage.setItem("initialBattingOrder", initialOrder);
    alert("守備配置と打順を保存しました！");
  };

  const clearAssignments = async () => {
    const emptyAssignments = Object.fromEntries(positions.map((p) => [p, null]));
    setAssignments(emptyAssignments);
    setBattingOrder([]);
    setBenchOutIds([]);
    await localForage.removeItem("lineupAssignments");
    await localForage.removeItem("battingOrder");
    await localForage.removeItem("initialBattingOrder");
    await localForage.removeItem("benchOutIds");
    alert("スタメンと守備位置をクリアしました！");
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
    e.dataTransfer.setData("text/plain", String(playerId));   // ←★ Android 用
    if (fromPos) e.dataTransfer.setData("fromPosition", fromPos);
    e.dataTransfer.effectAllowed = "move"
  };

  const handleDropToPosition = (e: React.DragEvent<HTMLDivElement>, toPos: string) => {
    e.preventDefault();
    
    const playerIdStr =
    e.dataTransfer.getData("playerId") || e.dataTransfer.getData("text/plain");
    const playerId = Number(playerIdStr);

    // ── Android だと custom MIME が取れない事があるので補完 ──
    let fromPos = e.dataTransfer.getData("fromPosition");
    if (!fromPos) {
      fromPos = Object.entries(assignments).find(([, id]) => id === playerId)?.[0] ?? "";
    }
    const prevPlayerId = assignments[toPos];

    setAssignments((prev) => {
      const updated = { ...prev };

      if (fromPos && fromPos !== toPos) {
        updated[fromPos] = prevPlayerId ?? null;  // 交換
      }

      updated[toPos] = playerId;
      return updated;
    });

    setBattingOrder((prev) => {
      const updated = [...prev];
      const isNew = !updated.some((entry) => entry.id === playerId);

      if (isNew && prevPlayerId !== null) {
        const index = updated.findIndex((entry) => entry.id === prevPlayerId);
        if (index !== -1) updated[index] = { id: playerId, reason: "スタメン" };
      } else if (isNew) {
        updated.push({ id: playerId, reason: "スタメン" });
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
    e.dataTransfer.setData("text/plain", String(playerId));
  };

  const handleDropToBenchOut = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  const playerIdStr =
    e.dataTransfer.getData("playerId") || e.dataTransfer.getData("text/plain");
  const playerId = Number(playerIdStr);
  setBenchOutIds((prev) => {
    if (!prev.includes(playerId)) return [...prev, playerId];
    return prev;
  });
};

const handleDropToBench = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  const playerId = Number(e.dataTransfer.getData("playerId"));
  setBenchOutIds((prev) => prev.filter((id) => id !== playerId));
};


  const handleDropToBattingOrder = (
    e: React.DragEvent<HTMLDivElement>,
    targetPlayerId: number
  ) => {
    e.preventDefault();
    const draggedStr =
      e.dataTransfer.getData("battingPlayerId") || e.dataTransfer.getData("text/plain");
    const draggedPlayerId = Number(draggedStr);

    setBattingOrder((prev) => {
      const fromIndex = prev.findIndex((entry) => entry.id === draggedPlayerId);
      const toIndex = prev.findIndex((entry) => entry.id === targetPlayerId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const updated = [...prev];
      [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
      return updated;
    });
  };

  const assignedIds = Object.values(assignments).filter(Boolean) as number[];
  const availablePlayers = teamPlayers.filter((p) => !assignedIds.includes(p.id));
  const benchOutPlayers = teamPlayers.filter((p) => benchOutIds.includes(p.id));

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">スタメン設定（守備配置）</h1>

      {/* フィールド配置 */}
            <div className="relative w-full max-w-2xl mx-auto mb-6">
          <img
            src="/field.jpg"
            alt="フィールド図"
            className="w-full rounded shadow select-none pointer-events-none"
          />
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
                {player ? (
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, player.id, pos)}
                    className="font-semibold whitespace-nowrap overflow-hidden text-ellipsis touch-draggable"
                  >
                    {player.lastName}{player.firstName} #{player.number}
                  </div>
                ) : (
                  <div className="text-gray-400">空き</div>
                )}

              </div>
            );
          })}
      </div>

      {/* 打順と控えを横並びに表示 */}
      {/* 控え選手 + 打順を縦並びに表示し、スマホでも最適化 */}
<div className="flex flex-col gap-6">

  {/* 🔼 控え選手（登録済みで未使用の選手） */}
  <div>
    <h2 className="text-xl font-semibold mb-2">控え選手</h2>
    <div
      className="flex flex-wrap gap-2 min-h-[60px] bg-white p-2 border border-gray-300 rounded"
      onDragOver={allowDrop}
      onDrop={handleDropToBench}
    >
      {teamPlayers
        .filter((p) => !assignedIds.includes(p.id) && !benchOutIds.includes(p.id))
        .map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => handleDragStart(e, p.id)}
            className="px-2 py-1 bg-gray-200 rounded cursor-move select-none"
          >
            {p.lastName}
            {p.firstName} #{p.number}
          </div>
        ))}
    </div>
  </div>

{/* 🔽 ベンチ外選手（横並び表示） */}
<div>
  <h2 className="text-xl font-semibold mb-2 text-red-600">ベンチ外選手</h2>
  <div
    className="flex flex-wrap gap-2 min-h-[60px] bg-gray-50 p-2 border border-red-400 rounded"
    onDragOver={allowDrop}
    onDrop={handleDropToBenchOut}
  >
    {benchOutPlayers.length === 0 ? (
      <div className="text-gray-400">ベンチ外選手はいません</div>
    ) : (
      benchOutPlayers.map((p) => (
        <div
          key={p.id}
          draggable
          onDragStart={(e) => handleDragStart(e, p.id)}
          className="px-2 py-1 bg-gray-100 text-gray-500 border rounded cursor-move select-none"
        >
          {p.lastName}{p.firstName} #{p.number}
        </div>
      ))
    )}
  </div>
</div>



<div>
  <h2 className="text-xl font-semibold mb-2">打順（1～9番）</h2>
  <div className="space-y-2">
    {battingOrder.map((entry, i) => {
      const player = teamPlayers.find((p) => p.id === entry.id);
      if (!player) return null;
      const pos = getPositionOfPlayer(entry.id);

      return (
        <div
          key={entry.id}
          className="border p-2 bg-blue-100 rounded cursor-move"
          draggable
          onDragStart={(e) => handleBattingOrderDragStart(e, entry.id)}
          onDrop={(e) => handleDropToBattingOrder(e, entry.id)}
          onDragOver={allowDrop}
        >
          <div className="flex gap-2">
            <span className="w-10 font-bold">{i + 1}番</span>
            <span className="w-24">{pos ? positionNames[pos] : "控え"}</span>
            <span className="w-28">{player.lastName}{player.firstName}</span>
            <span className="w-12">#{player.number}</span>
          </div>
        </div>
      );
    })}
  </div>
</div>


</div>


<div className="mt-6 flex gap-6">
  <button
    className="bg-blue-600 text-white px-4 py-2 rounded"
    onClick={saveAssignments}
  >
    保存する
  </button>
  <button
    className="bg-red-500 text-white px-4 py-2 rounded"
    onClick={clearAssignments}
  >
    クリア
  </button>
</div>
      
      </div>
  );
};

const isTouchDevice = () => typeof window !== "undefined" && "ontouchstart" in window;
const StartingLineupWrapped = () => {
  return (
    <DndProvider
      backend={isTouchDevice() ? TouchBackend : HTML5Backend}
      options={isTouchDevice() ? {
        enableTouchEvents: true,
        enableMouseEvents: true,
        touchSlop: 10,
      } : undefined}
    >
      <StartingLineup />
    </DndProvider>
  );
};

export default StartingLineupWrapped;