import React, { useEffect, useState } from "react";
import localForage from "localforage";



const resetAnnouncedIds = () => {
  setAnnouncedIds([]);
  localForage.removeItem("announcedIds");
};

async function clearUndoRedoHistory() {
  const prefixReg = /^(defHistory::|defRedo::|history:|undo:|redo:)/;
  const suffixReg = /(history|undo|redo)$/;

  await localForage.iterate((value, key) => {
    if (prefixReg.test(String(key)) || suffixReg.test(String(key))) {
      localForage.removeItem(String(key));
    }
  });
}


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

  // 画面を開いたら、スタメン守備を lineupAssignments に確定保存
useEffect(() => {
  (async () => {
    // 進行中の試合があれば触らない（任意の安全ガード）
    const inProgress = await localForage.getItem("lastBatterIndex");
    if (inProgress != null) return;

    // startingassignments を最優先で採用（無ければ既存 lineupAssignments）
    const src =
      (await localForage.getItem<Record<string, number | null>>("startingassignments")) ??
      (await localForage.getItem<Record<string, number | null>>("lineupAssignments")) ??
      {};

    // 文字列IDが混じっても壊れないように正規化（null はそのまま）
    const normalized = Object.fromEntries(
      Object.entries(src).map(([pos, v]) => [pos, v == null ? null : Number(v)])
    ) as Record<string, number | null>;

    // offense/defense 画面の基準に確定保存
    await localForage.setItem("lineupAssignments", normalized);

    // （画面内表示にも使っているなら）state にも反映
    try {
      // setAssignments が同コンポーネントで定義されている前提
      // 無い場合はこの2行は削ってOK
      // @ts-ignore
      setAssignments(normalized);
    } catch {}
  })();
}, []);

  useEffect(() => {
    const loadData = async () => {
      const matchInfo = await localForage.getItem("matchInfo");
      // 変更後（starting を最優先に、無ければ従来キーを使う）
      const assign =
        (await localForage.getItem<Record<string, number|null>>("startingassignments")) ??
        (await localForage.getItem<Record<string, number|null>>("lineupAssignments"));

      const order =
        (await localForage.getItem<Array<{id:number; reason?:string}>>("startingBattingOrder")) ??
        (await localForage.getItem<Array<{id:number; reason?:string}>>("battingOrder"));
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
    await localForage.removeItem("pitcherTotals");
    await localForage.removeItem("scores");              // 得点削除
    await localForage.removeItem("lastBatterIndex");
    await localForage.removeItem("nextBatterIndex");
    await localForage.removeItem("usedBatterIds");
    // 代打/代走のreasonを全員「スタメン」に戻してから保存
    const normalizedOrder = (Array.isArray(battingOrder) ? battingOrder : [])
      .map((e: any) => {
        const id = typeof e === "number" ? e : (typeof e?.id === "number" ? e.id : e?.playerId);
        return typeof id === "number" ? { id, reason: "スタメン" } : null;
      })
      .filter((v: any): v is { id: number; reason: string } => !!v)
      .slice(0, 9);
    await localForage.setItem("battingOrder", normalizedOrder);
    await localForage.removeItem("checkedIds"); // 🔄 チェック状態を初期化

    // 🧼 空の得点データを保存（全て空白にするため）
    await localForage.setItem("scores", {});             // ← 🆕

    // ✅ 試合情報（イニング・表裏・攻守・後攻）を初期化
    const initialMatchInfo = {
      id: Date.now(),            // ← 追加：一意な試合ID
      opponentTeam: opponentName,  // ← 対戦相手名も再保存
      inning: 1,
      isTop: true,
      isDefense: !isFirstAttack,
      isHome: isHome,
    };
    await localForage.setItem("matchInfo", initialMatchInfo);

    // 代打/代走・再入場・交代表示の残骸を全削除
    await localForage.setItem("usedPlayerInfo", {});  // （既存）代打/代走の紐づけを初期化
    await localForage.removeItem("reentryInfos");     // リエントリー記録
    await localForage.removeItem("battingReplacements"); // 打順置換の表示用キャッシュ
    await localForage.removeItem("pairLocks");        // A↔Bロック（守備同士の相手記録）
    await localForage.removeItem("previousPositions");// 直前守備の記録（使っていれば）

    // ✅ 代打・代走情報を初期化
    await localForage.setItem("usedPlayerInfo", {});
    // ✅ ランナー情報を初期化
    await localForage.setItem("runnerAssignments", {
      "1塁": null,
      "2塁": null,
      "3塁": null,
    });

    // ✅ 試合開始時のDH有無を保存
    const dhEnabledAtStart = Boolean((assignments as any)?.["指"]);
    await localForage.setItem("dhEnabledAtStart", dhEnabledAtStart);
    // 代打/代走/臨時代走の履歴を全消し
    await localForage.setItem("usedPlayerInfo", {});  // ← これが最重要
    // 塁上の代走状態も全クリア
    await localForage.setItem("runnerAssignments", { "1塁": null, "2塁": null, "3塁": null });

    // （使っていれば）補助キーも掃除
    await localForage.removeItem("replacedRunners");
    await localForage.removeItem("tempRunnerFlags");

    // ★ スタメン守備を「lineupAssignments」に確定保存（offense/defense画面の基準）
    const startAssign =
      (await localForage.getItem<Record<string, number | null>>("startingassignments")) ??
      (await localForage.getItem<Record<string, number | null>>("lineupAssignments")) ??
      {};

    const normalizedAssign = Object.fromEntries(
      Object.entries(startAssign).map(([pos, v]) => [pos, v == null ? null : Number(v)])
    ) as Record<string, number | null>;

    await localForage.setItem("lineupAssignments", normalizedAssign);
    await clearUndoRedoHistory();   // ← これを追加（取消・やり直しの記憶を全クリア）

    // 🏁 試合開始（攻撃または守備画面へ）
    onStart(isFirstAttack);
  };


  // 守備に就いている選手（投・捕・一…・指）
  const assignedIds = Object.values(assignments)
    .filter((v) => v !== null)
    .map((v) => Number(v));

  const dhId = (assignments as any)["指"] ?? null; // DHが使われているか
  const pitcherId = (assignments as any)["投"] ?? null;
  const pitcher = pitcherId ? players.find((p) => Number(p.id) === Number(pitcherId)) : undefined;


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
      <div className="text-sm text-gray-800 space-y-0 leading-tight">
        {battingOrder.slice(0, 9).map((entry, index) => {
          const pos = Object.keys(assignments).find((p) => assignments[p] === entry.id);
          const player = getPlayer(entry.id);
          return (
            <div key={entry.id ?? index} className="flex gap-2">
              <span className="w-8">{index + 1}番</span>
              <span className="w-10">{pos ?? "未設定"}</span>
              <span className="w-24">{player?.name ?? "未設定"}</span>
              <span>#{player?.number ?? "-"}</span>
            </div>
          );
        })}
        {dhId && pitcher && (
          <div className="flex gap-2 mt-1">
            <span className="w-8"></span>
            <span className="w-10">投</span>
            <span className="w-24">{pitcher.name}</span>
            <span>#{pitcher.number}</span>
          </div>
        )}

      </div>
    </div>

    {/* 右：控え選手 */}
    <div>
      <h3 className="text-base font-semibold mb-1">控え選手</h3>
      <div className="text-sm text-gray-800 space-y-0 leading-tight">
        {players
          .filter(
            (p) =>
              // 打順に入っていない
              !battingOrder.some((entry) => entry.id === p.id) &&
              // 守備にも就いていない（←ココを追加：投手などは控えに出ない）
              !assignedIds.includes(p.id) &&
              // ベンチ外でもない
              !benchOutIds.includes(p.id)
          )
          .map((player) => (
            <div key={player.id} className="flex gap-2">
              <span className="w-28">{player.name}</span>
              <span>#{player.number}</span>
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
