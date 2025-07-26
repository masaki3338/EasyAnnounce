import React from "react";
import { useDrag } from "react-dnd";
import type { Player } from "./types"; // 型があれば調整

type Props = {
  player: Player;
  pos: string;
  onDragStart: (pos: string) => void;
  isEmpty?: boolean;
};

const DraggablePlayerOnField: React.FC<Props> = ({ player, pos, onDragStart, isEmpty }) => {
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: "player",
      item: { id: player.id, pos },
      collect: (monitor) => ({
        isDragging: !!monitor.isDragging(),
      }),
      canDrag: !isEmpty,
    }),
    [player, pos, isEmpty]
  );

  if (isEmpty) {
    return <span className="text-gray-300 text-base">空き</span>;
  }

  return (
    <div
      ref={drag}
      onDragStart={() => onDragStart(pos)}
      className="cursor-move text-base whitespace-nowrap text-center bg-black bg-opacity-60 text-white font-bold rounded px-1 py-0.5"
      style={{ opacity: isDragging ? 0.5 : 1, minWidth: "80px" }}
    >
      {player.lastName ?? ""}
      {player.firstName ?? ""} #{player.number}
    </div>
  );
};

export default DraggablePlayerOnField;
