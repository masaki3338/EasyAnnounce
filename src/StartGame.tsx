import React, { useEffect, useState } from "react";
import localForage from "localforage";


// --- ミニSVGアイコン（依存なし） ---
const IconPlay = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm-7-3h2a5 5 0 0010 0h2a7 7 0 01-6 6.9V20h3v2H8v-2h3v-2.1A7 7 0 015 11z"/>
  </svg>
);
const IconInfo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M11 17h2v-6h-2v6zm0-8h2V7h-2v2zm1-7a10 10 0 100 20 10 10 0 000-20z"/>
  </svg>
);
const IconUsers = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0zm-9 7a6 6 0 1112 0v2H7v-2z"/>
  </svg>
);
const IconVs = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M7 7h4l-4 10H3L7 7zm14 0l-5 10h-4l5-10h4z"/>
  </svg>
);
const IconUmpire = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 2a4 4 0 110 8 4 4 0 010-8zM5 20a7 7 0 0114 0v2H5v-2z"/>
  </svg>
);



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
  const [isTwoUmpires, setIsTwoUmpires] = useState<boolean>(false);
  const [players, setPlayers] = useState<{ id: number; number: string | number; name: string }[]>([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [battingOrder, setBattingOrder] = useState<
    { id: number; reason: string }[]
  >([]);

  const [benchOutIds, setBenchOutIds] = useState<number[]>([]); // 🆕

  // 「試合開始」押下時に出す案内モーダルの表示フラグ
  const [showStartHint, setShowStartHint] = useState(false);

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

      const sb = await localForage.getItem<number[]>("startingBenchOutIds");
      const fb = await localForage.getItem<number[]>("benchOutIds");
      const raw = Array.isArray(sb) ? sb : Array.isArray(fb) ? fb : [];
      // 念のため number 正規化＆重複除去
      const normalized = [...new Set(raw.map((v) => Number(v)).filter((v) => Number.isFinite(v)))];
      setBenchOutIds(normalized);

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
        setIsTwoUmpires(Boolean(mi.twoUmpires));  
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

// 1) ボタン押下時はモーダルを開くだけ
const handleStart = async () => {
  setShowStartHint(true);
};

// 2) モーダルの「OK」で本当に開始（元の handleStart の中身をこちらへ）
const proceedStart = async () => {
  const isHome = !isFirstAttack;

  // （↓↓ここからは、元の handleStart 内の“アラート以外の処理”をそのまま↓）
  // ★ 先攻×初回のみ：… というalertブロックは削除してOK（モーダルに置換したため）

  // 🧹 各種リセット
  await localForage.removeItem("announcedPlayerIds");
  await localForage.removeItem("runnerInfo");
  await localForage.removeItem("pitchCounts");
  await localForage.removeItem("pitcherTotals");
  await localForage.removeItem("scores");
  await localForage.removeItem("lastBatterIndex");
  await localForage.removeItem("nextBatterIndex");
  await localForage.removeItem("usedBatterIds");
  // …（あなたの元コードと同じ初期化を続ける）
  // batttingOrder の正規化保存、scores の初期化、matchInfo の保存、
  // usedPlayerInfo / runnerAssignments / lineupAssignments の保存、
  // clearUndoRedoHistory() など、元の handleStart にあった処理をここへ移動

  // 🏁 画面遷移
  onStart(isFirstAttack);

  // 閉じる
  setShowStartHint(false);
};



  // 守備に就いている選手（投・捕・一…・指）
  const assignedIds = Object.values(assignments)
    .filter((v) => v !== null)
    .map((v) => Number(v));

  const dhId = (assignments as any)["指"] ?? null; // DHが使われているか
  const pitcherId = (assignments as any)["投"] ?? null;
  const pitcher = pitcherId ? players.find((p) => Number(p.id) === Number(pitcherId)) : undefined;


return (
  <div
    className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
    style={{
      paddingTop: "max(16px, env(safe-area-inset-top))",
      paddingBottom: "max(16px, env(safe-area-inset-bottom))",
    }}
  >
    {/* ヘッダー：中央大タイトル＋細ライン */}
    <header className="w-full max-w-md text-center select-none mt-1">
      <h1 className="inline-flex items-center gap-2 text-3xl md:text-4xl font-extrabold tracking-wide leading-tight">
        <span className="text-2xl md:text-3xl">🏁</span>
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-blue-400 drop-shadow">
          試合開始
        </span>
      </h1>
      <div className="mx-auto mt-2 h-0.5 w-20 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
    </header>

    {/* 本体：カード群 */}
    <main className="w-full max-w-md mt-5 space-y-5">
      {/* 試合情報 */}
      <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconInfo />
            <div className="font-semibold">試合情報</div>
          </div>
          <div className="text-xs text-white/70">
            {isFirstAttack ? "先攻" : "後攻"} / ベンチ：{firstBaseSide}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10">
              <span className="font-medium truncate max-w-[12rem]">{teamName || "未設定"}</span>
            </span>
            <IconVs />
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10">
              <span className="font-medium truncate max-w-[12rem]">{opponentName || "未設定"}</span>
            </span>
          </div>
        </div>
      </section>

      {/* 審判（2審制なら右隣に表示＋球審・1塁審のみ） */}
      <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <IconUmpire />
          <div className="font-semibold">審判</div>
          {isTwoUmpires && (
            <span className="ml-3 text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
              2審制
            </span>
          )}
        </div>
        {isTwoUmpires ? (
          <ul className="text-sm text-white/90 grid grid-cols-2 gap-x-4 gap-y-1">
            <li>球審：<span className="font-medium">{umpires["球審"] || "未設定"}</span></li>
            <li>1塁審：<span className="font-medium">{umpires["1塁審"] || "未設定"}</span></li>
          </ul>
        ) : (
          <ul className="text-sm text-white/90 grid grid-cols-2 gap-x-4 gap-y-1">
            <li>球審：<span className="font-medium">{umpires["球審"] || "未設定"}</span></li>
            <li>1塁審：<span className="font-medium">{umpires["1塁審"] || "未設定"}</span></li>
            <li>2塁審：<span className="font-medium">{umpires["2塁審"] || "未設定"}</span></li>
            <li>3塁審：<span className="font-medium">{umpires["3塁審"] || "未設定"}</span></li>
          </ul>
        )}
      </section>

      {/* スタメン */}
      <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <IconUsers />
          <div className="font-semibold">スターティングメンバー</div>
        </div>

        <div className="text-sm leading-tight space-y-1">
          {battingOrder.slice(0, 9).map((entry, index) => {
            const pos = Object.keys(assignments).find((p) => assignments[p] === entry.id) ?? "—";
            const player = getPlayer(entry.id);
            return (
              <div key={entry.id ?? index} className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-9 h-6 rounded-full bg-white/10 border border-white/10">
                  {index + 1}番
                </span>
                <span className="w-10 text-white/90">{pos}</span>
                <span className="flex-1 font-medium truncate">{player?.name ?? "未設定"}</span>
                <span className="opacity-90">#{player?.number ?? "-"}</span>
              </div>
            );
          })}

          {/* DH時の投手名を追記（元コード踏襲） */}
          {dhId && pitcher && (
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center justify-center w-9 h-6 rounded-full bg-white/10 border border-white/10">
                投
              </span>
              <span className="flex-1 font-medium truncate">{pitcher.name}</span>
              <span className="opacity-90">#{(pitcher as any).number}</span>
            </div>
          )}
        </div>
      </section>

      {/* 控え選手 */}
      <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <IconUsers />
          <div className="font-semibold">控え選手</div>
        </div>
        <div className="text-sm leading-tight grid grid-cols-1 gap-1">
          {players
            .filter(
              (p) =>
                !battingOrder.some((e) => e.id === p.id) &&
                !Object.values(assignments).filter((v) => v !== null).map(Number).includes(p.id) &&
                !benchOutIds.includes(p.id)
            )
            .map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex-1 truncate">{p.name}</span>
                <span className="opacity-90">#{p.number}</span>
              </div>
            ))}
          {/* 0人のとき */}
          {players.filter(
            (p) =>
              !battingOrder.some((e) => e.id === p.id) &&
              !Object.values(assignments).filter((v) => v !== null).map(Number).includes(p.id) &&
              !benchOutIds.includes(p.id)
          ).length === 0 && (
            <div className="text-white/70">（該当なし）</div>
          )}
        </div>
      </section>

      {/* 操作ボタン */}
      <div className="grid gap-3 pt-1">
        <button
          onClick={onShowAnnouncement}
          className="w-full px-6 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-lg font-semibold shadow-lg inline-flex items-center justify-center gap-2"
        >
          <IconMic /> 試合前アナウンス
        </button>
        <button
          onClick={handleStart}
          className="w-full px-6 py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:scale-95 text-white text-lg font-semibold shadow-lg inline-flex items-center justify-center gap-2"
        >
          <IconPlay /> 試合を開始する
        </button>

      </div>
    </main>
    {/* ====== 開始時の案内モーダル ====== */}
    {showStartHint && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* 背景の薄暗幕 */}
        <div
          className="absolute inset-0 bg-black/60"
          onClick={() => setShowStartHint(false)}
        />
        {/* 本体カード */}
        <div className="relative mx-6 w-full max-w-sm rounded-2xl bg-white text-gray-900 shadow-2xl overflow-hidden">
          {/* タイトル帯 */}
          <div className="bg-green-600 text-white text-lg font-bold text-center py-3">
            試合開始のご案内
          </div>
          <div className="p-5 text-center space-y-4">
            <p className="text-sm leading-relaxed">
              球審の「プレイ」で
              <span className="font-semibold">【試合開始】</span>
              ボタンを押下して下さい。
            </p>
            <button
              onClick={proceedStart}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold active:scale-95"
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

export default StartGame;
