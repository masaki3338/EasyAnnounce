import React, { useEffect, useState } from "react";
import localForage from "localforage";

const StartGame = ({
  onStart,
  onShowAnnouncement,
}: {
  onStart: (isFirstAttack: boolean) => void;
  onShowAnnouncement: () => void;
}) => {
  const [teamName, setTeamName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [firstBaseSide, setFirstBaseSide] = useState<"1塁側" | "3塁側">("1塁側");
  const [isFirstAttack, setIsFirstAttack] = useState(true);
  const [umpires, setUmpires] = useState<{ [key: string]: string }>({});
  const [players, setPlayers] = useState<
    { id: number; number: string | number; name: string }[]
  >([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [battingOrder, setBattingOrder] = useState<number[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const matchInfo = await localForage.getItem("matchInfo");
      const teamPlayers = await localForage.getItem("teamPlayers");
      const assign = await localForage.getItem("lineupAssignments");
      const order = await localForage.getItem("battingOrder");
      const team = await localForage.getItem("team");

      if (team && typeof team === "object") {
        setTeamName((team as any).name || "");
      }

      if (matchInfo && typeof matchInfo === "object") {
        const mi = matchInfo as any;
        setOpponentName(mi.opponentTeam || "");
        setFirstBaseSide(mi.benchSide === "3塁側" ? "3塁側" : "1塁側");
        setIsFirstAttack(mi.isHome === "先攻");

        if (Array.isArray(mi.umpires)) {
          const umpireMap: { [key: string]: string } = {};
          mi.umpires.forEach((u: { role: string; name: string }) => {
            umpireMap[u.role] = u.name || "";
          });
          setUmpires(umpireMap);
        }
      }

      if (Array.isArray(teamPlayers)) {
        const playersWithName = (teamPlayers as any[]).map((p) => ({
          id: Number(p.id),
          number: p.number,
          name: p.name ?? `${p.lastName ?? ""}${p.firstName ?? ""}`,
        }));
        setPlayers(playersWithName);
      }

      if (assign && typeof assign === "object") {
        const normalizedAssign: { [pos: string]: number | null } = {};
        Object.entries(assign).forEach(([pos, id]) => {
          normalizedAssign[pos] = id !== null ? Number(id) : null;
        });
        setAssignments(normalizedAssign);
      }

      if (Array.isArray(order)) {
        const orderNum = (order as any[]).map((id) => Number(id));
        setBattingOrder(orderNum);
      }
    };

    loadData();
  }, []);

  const getPlayer = (id: number | null) => {
    if (id === null) return undefined;
    return players.find((p) => p.id === id);
  };

  const handleStart = () => {
    onStart(isFirstAttack);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">試合開始画面</h1>

      {/* 試合情報 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">試合情報</h2>
        <p className="mb-1">
          {teamName} vs {opponentName}
        </p>
        <p className="mb-1">
          {firstBaseSide}（{isFirstAttack ? "先攻" : "後攻"}）
        </p>
      </section>

      {/* 審判情報 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">審判情報</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>球審: {umpires["球審"] || "未設定"}</li>
          <li>1塁審: {umpires["1塁審"] || "未設定"}</li>
          <li>2塁審: {umpires["2塁審"] || "未設定"}</li>
          <li>3塁審: {umpires["3塁審"] || "未設定"}</li>
        </ul>
      </section>

      {/* スタメン一覧 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">スタメン一覧</h2>
        <table className="w-full table-auto border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1">打順</th>
              <th className="border px-2 py-1">守備</th>
              <th className="border px-2 py-1">背番号</th>
              <th className="border px-2 py-1">名前</th>
            </tr>
          </thead>
          <tbody>
            {battingOrder.slice(0, 9).map((id, i) => {
              const pos = Object.keys(assignments).find((p) => assignments[p] === id);
              const player = getPlayer(id);
              return (
                <tr key={id ?? i}>
                  <td className="border px-2 py-1 text-center">{i + 1}</td>
                  <td className="border px-2 py-1 text-center">{pos ?? "-"}</td>
                  <td className="border px-2 py-1 text-center">{player?.number ?? "-"}</td>
                  <td className="border px-2 py-1">{player?.name ?? "未設定"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 操作ボタン */}
      <div className="flex justify-center space-x-4 mt-8">
        <button
          className="bg-blue-600 text-white px-6 py-3 rounded text-lg hover:bg-blue-700"
          onClick={handleStart}
        >
          試合を開始する
        </button>
        <button
          className="bg-gray-600 text-white px-6 py-3 rounded text-lg hover:bg-gray-700"
          onClick={onShowAnnouncement}
        >
          試合前アナウンス
        </button>
      </div>
    </div>
  );
};

export default StartGame;
