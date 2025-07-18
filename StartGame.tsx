import React, { useEffect, useState } from "react";
import localForage from "localforage";

const handleStart = async () => {
  // 🧹 各種リセット
  await localForage.removeItem("announcedPlayerIds"); // 打席読み上げ済み
  await localForage.removeItem("runnerInfo");         // 走者情報（代走など）
  await localForage.removeItem("pitchCounts");        // 投球数
  await localForage.removeItem("scores");             // 得点
  await localForage.removeItem("lastBatterIndex");    // 前回の打者
  await localForage.removeItem("nextBatterIndex");    // 次の打者（任意）
  await localForage.removeItem("usedBatterIds");      // 簡略アナウンスに使う履歴（必要なら）
  await localForage.removeItem("scores"); // スコアを完全に削除して空状態に
  
  // 🧹 イニングと攻守情報の初期化
  const isHome = !isFirstAttack; // 自チームが後攻ならホーム
  const initialMatchInfo = {
    opponentTeam: "",      // 相手チーム名（必要なら再設定）
    inning: 1,
    isTop: true,
    isDefense: !isFirstAttack, // 先攻なら守備でない → 攻撃
    isHome: isHome,
  };
  await localForage.setItem("matchInfo", initialMatchInfo);
};

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
  const [players, setPlayers] = useState<{ id: number; number: string | number; name: string }[]>([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [battingOrder, setBattingOrder] = useState<
    { id: number; reason: string }[]
  >([]);

  const [benchOutIds, setBenchOutIds] = useState<number[]>([]); // 🆕

  useEffect(() => {
    const loadData = async () => {
      const matchInfo = await localForage.getItem("matchInfo");
      const assign = await localForage.getItem("lineupAssignments");
      const order = await localForage.getItem("battingOrder");
      const team = await localForage.getItem("team");

      const benchOut = await localForage.getItem<number[]>("benchOutIds");
      if (Array.isArray(benchOut)) {
        setBenchOutIds(benchOut);
      }

      if (team && typeof team === "object") {
        setTeamName((team as any).name || "");
        const playersWithName = (team as any).players.map((p: any) => ({
          id: Number(p.id),
          number: p.number,
          name: `${p.lastName ?? ""}${p.firstName ?? ""}`,
        }));
        setPlayers(playersWithName);
      }

      if (matchInfo && typeof matchInfo === "object") {
        const mi = matchInfo as any;
        setOpponentName(mi.opponentTeam || "");
        setFirstBaseSide(mi.benchSide === "3塁側" ? "3塁側" : "1塁側");
        setIsFirstAttack(mi.isHome === false); // 先攻 = isHomeがfalse

        if (Array.isArray(mi.umpires)) {
          const umpireMap: { [key: string]: string } = {};
          mi.umpires.forEach((u: { role: string; name: string }) => {
            umpireMap[u.role] = u.name || "";
          });
          setUmpires(umpireMap);
        }
      }

      if (assign && typeof assign === "object") {
        const normalizedAssign: { [pos: string]: number | null } = {};
        Object.entries(assign).forEach(([pos, id]) => {
          normalizedAssign[pos] = id !== null ? Number(id) : null;
        });
        setAssignments(normalizedAssign);
      }

      if (Array.isArray(order)) {
        setBattingOrder(order as { id: number; reason: string }[]);
      }
    };

    loadData();
  }, []);

  const getPlayer = (id: number | null) => {
    if (id === null || isNaN(id)) return undefined;
    return players.find((p) => Number(p.id) === id);
  };

  const handleStart = async () => {
    const isHome = !isFirstAttack; // ← 🆕 自チームが後攻かをここで判定

    // 🧹 各種リセット
    await localForage.removeItem("announcedPlayerIds");
    await localForage.removeItem("runnerInfo");
    await localForage.removeItem("pitchCounts");
    await localForage.removeItem("scores");              // 得点削除
    await localForage.removeItem("lastBatterIndex");
    await localForage.removeItem("nextBatterIndex");
    await localForage.removeItem("usedBatterIds");
    await localForage.setItem("battingOrder", battingOrder); // 🆕 打順保存

    // 🧼 空の得点データを保存（全て空白にするため）
    await localForage.setItem("scores", {});             // ← 🆕

    // ✅ 試合情報（イニング・表裏・攻守・後攻）を初期化
    const initialMatchInfo = {
      opponentTeam: opponentName,  // ← 対戦相手名も再保存
      inning: 1,
      isTop: true,
      isDefense: !isFirstAttack,
      isHome: isHome,
    };
    await localForage.setItem("matchInfo", initialMatchInfo);

    // ✅ 代打・代走情報を初期化
    await localForage.setItem("usedPlayerInfo", {});
    // ✅ ランナー情報を初期化
    await localForage.setItem("runnerAssignments", {
      "1塁": null,
      "2塁": null,
      "3塁": null,
    });

    // 🏁 試合開始（攻撃または守備画面へ）
    onStart(isFirstAttack);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 bg-gradient-to-b from-blue-50 via-white to-gray-50 min-h-screen">
      <h1 className="text-2xl sm:text-3xl font-bold text-center text-blue-800 mb-6 flex items-center justify-center gap-2">
        <span>⚾</span> <span>試合開始</span>
      </h1>

      {/* 試合情報 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-blue-700 mb-2 flex items-center gap-2">
          <span>📋</span> <span>試合情報</span>
        </h2>
        <div className="bg-white rounded-xl shadow-md px-4 py-3 text-gray-700">
          <p className="text-lg font-medium">{teamName} vs {opponentName}</p>
          <p className="text-sm text-gray-600 mt-1">
            ベンチ位置：{firstBaseSide}　（{isFirstAttack ? "先攻" : "後攻"}）
          </p>
        </div>
      </section>

      {/* 審判情報 */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-blue-700 mb-2 flex items-center gap-2">
          <span>🧑‍⚖️</span> <span>審判</span>
        </h2>
        <div className="bg-white rounded-xl shadow-md px-4 py-3 text-sm text-gray-700 space-y-1">
          <p>球審：{umpires["球審"] || "未設定"}</p>
          <p>1塁審：{umpires["1塁審"] || "未設定"}</p>
          <p>2塁審：{umpires["2塁審"] || "未設定"}</p>
          <p>3塁審：{umpires["3塁審"] || "未設定"}</p>
        </div>
      </section>

      {/* スタメン・控え表示 */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-blue-700 mb-3 flex items-center gap-2">
          <span>👥</span> <span>スターティングメンバー</span>
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {/* 左：スタメン */}
          <div>
            <h3 className="text-base font-semibold mb-2">スタメン</h3>
            <div className="space-y-2">
              {/* スタメン */}
              {battingOrder.slice(0, 9).map((entry, index) => {
                const pos = Object.keys(assignments).find((p) => assignments[p] === entry.id);
                const player = getPlayer(entry.id);
                return (
                  <div
                    key={entry.id ?? index}
                    className="bg-white rounded-lg shadow p-3"
                  >
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>{index + 1}番</span>
                      <span>守備：{pos ?? "未設定"}</span>
                    </div>
                    <div className="text-gray-800 font-medium text-base">
                      {player?.name ?? "未設定"}　#{player?.number ?? "-"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：控え選手 */}
          <div>
            <h3 className="text-base font-semibold mb-2">控え選手</h3>
            <div className="space-y-2">
              {players
                .filter(
                  (p) =>
                    !battingOrder.some((entry) => entry.id === p.id) &&
                    !benchOutIds.includes(p.id)
                )
                .map((player) => (
                  <div
                    key={player.id}
                    className="bg-white rounded-lg shadow p-3 text-gray-800"
                  >
                    {player.name}　#{player.number}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      {/* 操作ボタン */}
      <div className="grid gap-4">
        <button
          onClick={handleStart}
          className="bg-green-600 hover:bg-green-700 text-white text-lg font-semibold py-4 rounded-xl shadow-md transition"
        >
          🟢 試合を開始する
        </button>
        <button
          onClick={onShowAnnouncement}
          className="bg-blue-500 hover:bg-blue-600 text-white text-lg font-semibold py-4 rounded-xl shadow-md transition"
        >
          📣 試合前アナウンス
        </button>
      </div>
    </div>
  );
};

export default StartGame;
