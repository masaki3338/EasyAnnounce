import React, { useState, useEffect } from "react";
import localForage from "localforage";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { MultiBackend, TouchTransition } from "dnd-multi-backend";

const HTML5toTouch = {
  backends: [
    {
      backend: HTML5Backend,
      preview: true,
    },
    {
      backend: TouchBackend,
      options: { enableMouseEvents: true },
      preview: true,
      transition: TouchTransition,
    },
  ],
};

const ItemTypes = {
  PLAYER: "player",
};

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

type DragItem = {
  type: string;
  playerId: number;
  from?: string;
};

const DraggablePlayer = ({ player, from }: { player: Player; from?: string }) => {
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.PLAYER,
    item: { type: ItemTypes.PLAYER, playerId: player.id, from },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag}
      className="cursor-move"
      style={{
        touchAction: "none", // ✅ 追加
        opacity: isDragging ? 0.5 : 1,
        userSelect: "none",
        padding: "4px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        backgroundColor: "white",
        marginBottom: 4,
      }}
    >
      {player.lastName}
      {player.firstName} ({player.number})
    </div>
  );
};

const DroppablePosition = ({
  pos,
  player,
  onDrop,
}: {
  pos: string;
  player: Player | undefined;
  onDrop: (playerId: number, from?: string) => void;
}) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.PLAYER,
    drop: (item: DragItem) => onDrop(item.playerId, item.from),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const backgroundColor = isOver
    ? canDrop
      ? "rgba(100, 200, 100, 0.7)"
      : "rgba(200, 100, 100, 0.7)"
    : "rgba(255,255,255,0.85)";

  return (
    <div
      ref={drop}
      style={{
        touchAction: "none", // ✅ 追加
        ...positionStyles[pos],
        position: "absolute",
        transform: "translate(-50%, -50%)",
        backgroundColor,
        padding: "4px 8px",
        borderRadius: "8px",
        minWidth: "80px",
        textAlign: "center",
        cursor: player ? "move" : "default",
        userSelect: "none",
      }}
    >
      <div className="text-xs font-bold mb-1">
        {pos} ({positionNames[pos]})
      </div>
      {player ? (
        <DraggablePlayer player={player} from={pos} />
      ) : (
        <div className="text-gray-400">空き</div>
      )}
    </div>
  );
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

  const handleDropToPosition = (playerId: number, from?: string, toPos?: string) => {
    if (!toPos) return;
    const prevPlayerId = assignments[toPos];

    setAssignments((prev) => {
      const updated = { ...prev };
      if (from && from !== toPos) updated[from] = prevPlayerId ?? null;
      updated[toPos] = playerId;
      return updated;
    });

    setBattingOrder((prev) => {
      const updated = [...prev];
      const isNew = !updated.includes(playerId);
      if (isNew && prevPlayerId !== null) {
        const index = updated.indexOf(prevPlayerId);
        if (index !== -1) updated[index] = playerId;
      } else if (isNew) {
        updated.push(playerId);
      }
      return updated;
    });
  };

  const getPositionOfPlayer = (playerId: number) =>
    Object.entries(assignments).find(([_, id]) => id === playerId)?.[0];

  const assignedIds = Object.values(assignments).filter(Boolean) as number[];
  const availablePlayers = teamPlayers.filter((p) => !assignedIds.includes(p.id));

  const DraggableOrder = ({
    playerId,
    index,
  }: {
    playerId: number;
    index: number;
  }) => {
    const player = teamPlayers.find((p) => p.id === playerId);
    const pos = getPositionOfPlayer(playerId);
    const [{ isDragging }, drag] = useDrag({
      type: ItemTypes.PLAYER,
      item: { type: ItemTypes.PLAYER, playerId },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });
    const [, drop] = useDrop({
      accept: ItemTypes.PLAYER,
      drop: (item: DragItem) => {
        const fromIndex = battingOrder.indexOf(item.playerId);
        const toIndex = index;
        if (fromIndex === -1 || toIndex === -1) return;
        const updated = [...battingOrder];
        [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
        setBattingOrder(updated);
      },
    });

    return (
      <div
        ref={(node) => drag(drop(node))}
        className="mb-2 border p-2 bg-blue-100 cursor-move"
        style={{
          touchAction: "none", // ✅ 追加
          opacity: isDragging ? 0.5 : 1,
          userSelect: "none",
        }}
      >
        <strong className="mr-2">{index + 1}番</strong>
        {pos ? `${positionNames[pos]} ` : "控え "}
        {player?.lastName}
        {player?.firstName} ({player?.number})
      </div>
    );
  };

  return (
    <DndProvider backend={MultiBackend} options={HTML5toTouch}>
      <div className="p-4 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">スタメン設定（守備配置）</h1>

        <div className="relative w-[600px] h-[600px] mx-auto border bg-green-100 rounded overflow-hidden mb-8 touch-none">
          <img src="/field.jpg" alt="Field" className="absolute w-full h-full object-cover" />
          {positions.map((pos) => {
            const playerId = assignments[pos];
            const player = teamPlayers.find((p) => p.id === playerId);
            return (
              <DroppablePosition
                key={pos}
                pos={pos}
                player={player}
                onDrop={(id, from) => handleDropToPosition(id, from, pos)}
              />
            );
          })}
        </div>

        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2">打順（1～9番）</h2>
            {battingOrder.map((playerId, i) => (
              <DraggableOrder key={playerId} playerId={playerId} index={i} />
            ))}
          </div>

          <div className="w-full md:w-1/3">
            <h2 className="text-xl font-semibold mb-2">控え選手</h2>
            <div className="grid grid-cols-1 gap-2">
              {availablePlayers.map((p) => (
                <DraggablePlayer key={p.id} player={p} />
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
    </DndProvider>
  );
};

export default StartingLineup;
