import React, { useState, useEffect } from "react";
import localForage from "localforage";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';

// ▼ 見た目だけのミニSVG
const IconField = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M12 2L2 12l10 10 10-10L12 2zm0 4l6 6-6 6-6-6 6-6z" />
  </svg>
);
const IconBench = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M4 15h16v2H4zm2-4h12v2H6zm2-4h8v2H8z" />
  </svg>
);
const IconOut = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm4.24 12.83l-1.41 1.41L12 13.41l-2.83 2.83-1.41-1.41L10.59 12 7.76 9.17l1.41-1.41L12 10.59l2.83-2.83 1.41 1.41L13.41 12z" />
  </svg>
);
const IconOrder = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M7 5h10v2H7zm0 6h10v2H7zm0 6h10v2H7z" />
  </svg>
);


const positions = ["投", "捕", "一", "二", "三", "遊", "左", "中", "右"];
// ▼ 追加（フィールド上の守備位置に含めないDHキー）
const DH = "指"; // 守備位置キー
const allSlots = [...positions, DH]; // 守備割当マップはDHも含めて扱う
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
  指: "DH", 
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
  指: { top: "88%", left: "82%" },
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
    Object.fromEntries(allSlots.map((p) => [p, null]))
  );
  const [battingOrder, setBattingOrder] = useState<
    { id: number; reason: "スタメン" }[]
  >([]);

  // タッチ（スマホ）用：選手選択を保持
const [touchDrag, setTouchDrag] = useState<{ playerId: number; fromPos?: string } | null>(null);
const [touchDragBattingId, setTouchDragBattingId] = useState<number | null>(null);

// 既存の handleDrop... を流用するためのダミーDragEvent
const makeFakeDragEvent = (payload: Record<string, string>) =>
  ({
    preventDefault: () => {},
    dataTransfer: {
      getData: (key: string) => payload[key] ?? "",
    },
  } as unknown as React.DragEvent<HTMLDivElement>);


  const [benchOutIds, setBenchOutIds] = useState<number[]>([]);

  // 保存先キー：startingassignments / startingBattingOrder を正として扱う
useEffect(() => {
  (async () => {
    // ① まず専用領域から読む
    const a = await localForage.getItem<Record<string, number|null>>("startingassignments");
    const o = await localForage.getItem<Array<{id:number; reason?:string}>>("startingBattingOrder");

    if (a && o?.length) {
      setAssignments(a);
      setBattingOrder(o);
      return;
    }

    // ② 専用領域が無ければ、既存の全体設定から初期化して専用領域に保存
    const globalA = await localForage.getItem<Record<string, number|null>>("lineupAssignments");
    const globalO = await localForage.getItem<Array<{id:number; reason?:string}>>("battingOrder");

    let baseA = globalA ?? Object.fromEntries([...positions, DH].map(p => [p, null])) as Record<string, number|null>;
    let baseO = globalO ?? [];

    // 打順が無ければ守備から暫定生成（DH考慮：投手を外してDHを入れる）
    if (baseO.length === 0) {
      const dhId = baseA[DH] ?? null;
      const orderPositions = dhId ? [...positions.filter(p => p !== "投"), DH] : [...positions];
      const ids = orderPositions.map(p => baseA[p]).filter((id): id is number => typeof id === "number");
      baseO = ids.slice(0, 9).map(id => ({ id, reason: "スタメン" }));
    }

    setAssignments(baseA);
    setBattingOrder(baseO);
    // 専用領域を作成
    await localForage.setItem("startingassignments", baseA);
    await localForage.setItem("startingBattingOrder", baseO);
  })();
}, []);


  useEffect(() => {
    localForage.getItem<{ players: Player[] }>("team").then((team) => {
      setTeamPlayers(team?.players || []);
    });
    
  }, []);

  // iOS判定 & 透明1pxゴースト画像
const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
const ghostImgRef = React.useRef<HTMLImageElement | null>(null);

useEffect(() => {
  if (!ghostImgRef.current) {
    const img = new Image();
    // 1x1完全透明PNG
    img.src =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
    ghostImgRef.current = img;
  }
}, []);

// 👉 グローバル touchend：指を離した位置の守備ラベルを自動検出して入替
useEffect(() => {
  const onTouchEnd = (ev: TouchEvent) => {
    if (!touchDrag) return;
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;

    // 指を離した座標の要素を取得
    const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
    if (!el) { setTouchDrag(null); return; }

    // data-role="poslabel" を持つ最近傍のターゲットを探す
    const target = el.closest('[data-role="poslabel"]') as HTMLElement | null;
    if (!target) { setTouchDrag(null); return; }

    const targetPlayerId = Number(target.getAttribute('data-player-id'));
    if (!targetPlayerId) { setTouchDrag(null); return; }

    // 既存の drop ハンドラを“疑似DragEvent”で呼び出し
    const fake = {
      preventDefault: () => {},
      stopPropagation: () => {},
      dataTransfer: {
        getData: (key: string) => {
          if (key === "dragKind") return "swapPos";
          if (key === "swapSourceId" || key === "text/plain") return String(touchDrag.playerId);
          return "";
        },
      },
    } as unknown as React.DragEvent<HTMLSpanElement>;

    handleDropToPosSpan(fake, targetPlayerId);
    setTouchDrag(null);
  };

  // キャプチャ段階で拾うと安定（バブリング前に確保）
  window.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
  return () => window.removeEventListener('touchend', onTouchEnd, true);
}, [touchDrag]);


useEffect(() => {
  const loadInitialData = async () => {
    const team = await localForage.getItem<{ players: Player[] }>("team");
    setTeamPlayers(team?.players || []);

    const savedBenchOut = await localForage.getItem<number[]>("startingBenchOutIds");
    if (savedBenchOut) setBenchOutIds(savedBenchOut);

    // ✅ まず保存済みの完全な守備配置/打順から復元
    const savedAssignments =
      await localForage.getItem<{ [pos: string]: number | null }>("startingassignments");
    const savedBattingOrder =
      await localForage.getItem<{ id: number; reason: "スタメン" }[]>("startingBattingOrder");

    if (savedAssignments) {
      // 欠けたキーに備えて全スロットを初期化してからマージ
      const base = Object.fromEntries(allSlots.map((p) => [p, null])) as {
        [pos: string]: number | null;
      };
      const merged = { ...base, ...savedAssignments };
      setAssignments(merged);

      if (savedBattingOrder && savedBattingOrder.length) {
        setBattingOrder(savedBattingOrder.slice(0, 9));
      }
      return; // ← フォールバック不要
    }

    // ↙ フォールバック：初回保存時の初期記録から復元
// ↙ フォールバック：スタメン画面“専用”の初期記録から復元
const initialOrder = await localForage.getItem<
  { id: number; order: number; position: string }[]
>("startingInitialSnapshot");

if (initialOrder && initialOrder.length > 0) {
  const newAssignments: { [pos: string]: number | null } =
    Object.fromEntries(allSlots.map((p) => [p, null]));
  const newBattingOrder: { id: number; reason: "スタメン" }[] = [];

  for (const entry of initialOrder) {
    newAssignments[entry.position] = entry.id;
    newBattingOrder[entry.order - 1] = { id: entry.id, reason: "スタメン" };
  }
  setAssignments(newAssignments);
  setBattingOrder(newBattingOrder.slice(0, 9));
}

  };

  loadInitialData();
}, []);






const saveAssignments = async () => {
  await localForage.setItem("startingBenchOutIds", benchOutIds);
  await localForage.setItem("startingassignments", assignments);
  await localForage.setItem("startingBattingOrder", battingOrder);

  // ✅ 初期記録は専用の参考情報としてのみ保持（必要なら）
  const initialOrder = battingOrder.map((entry, index) => {
    const position = Object.entries(assignments).find(([_, id]) => id === entry.id)?.[0] ?? "－";
    return { id: entry.id, order: index + 1, position };
  });
  await localForage.setItem("startingInitialSnapshot", initialOrder); // ← new（参照用）

  alert("スタメン（専用領域）を保存しました！");
};


  const clearAssignments = async () => {
    const emptyAssignments = Object.fromEntries(allSlots.map((p) => [p, null])); // ← 変更
    setAssignments(emptyAssignments);
    setBattingOrder([]);
    setBenchOutIds([]);


    const emptyA = Object.fromEntries([...positions, DH].map(p => [p, null])) as Record<string, number|null>;
    setAssignments(emptyA);
    setBattingOrder([]);

    await localForage.removeItem("startingassignments");
    await localForage.removeItem("startingBattingOrder");
    await localForage.removeItem("startingBenchOutIds");   // ← これを追加
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
  e.dataTransfer.setData("text/plain", String(playerId)); // Android 補完
  if (fromPos) e.dataTransfer.setData("fromPosition", fromPos);
  e.dataTransfer.effectAllowed = "move";

  // 👉 iOS Safari対策：透明1pxゴーストを使って原点ズレを根本回避
  try {
    if (isIOS && e.dataTransfer.setDragImage && ghostImgRef.current) {
      e.dataTransfer.setDragImage(ghostImgRef.current, 0, 0);
      return;
    }
    // iOS以外は従来どおり要素をゴーストに（中央基準）
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ox = rect.width / 2;
    const oy = rect.height / 2;
    if (e.dataTransfer.setDragImage) {
      e.dataTransfer.setDragImage(target, ox, oy);
    }
  } catch {
    /* no-op */
  }
};


const handleDropToPosition = (e: React.DragEvent<HTMLDivElement>, toPos: string) => {
  e.preventDefault();

  const playerIdStr =
    e.dataTransfer.getData("playerId") || e.dataTransfer.getData("text/plain");
  const playerId = Number(playerIdStr);

  // fromPosが取れない端末用フォールバック
  let fromPos = e.dataTransfer.getData("fromPosition");
  if (!fromPos) {
    fromPos = Object.entries(assignments).find(([, id]) => id === playerId)?.[0] ?? "";
  }

  const prevPlayerIdAtTo = assignments[toPos] ?? null;

  // 次状態を先に組み立てて、打順更新にも使う
  const next: { [pos: string]: number | null } = { ...assignments };

  // 交換（from→to）
  if (fromPos && fromPos !== toPos) {
    next[fromPos] = prevPlayerIdAtTo; // 交換なのでtoに居た人をfromへ
  }

  // toPosがDHなら、同一選手が他の守備に入っていたら外す（重複禁止）
  if (toPos === DH) {
    for (const p of positions) {
      if (next[p] === playerId) next[p] = null;
    }
  }

  // toPosが守備位置なら、もし同一選手がDHに入っていたらDHを外す（重複禁止）
  if (toPos !== DH && next[DH] === playerId) {
    next[DH] = null;
  }

  // 最終的にtoへ配置
  next[toPos] = playerId;

  setAssignments(next);

  // 打順の更新：DHが居れば「投手の代わりにDH」
  setBattingOrder((prev) => {
    let updated = [...prev];

    const dhId = next[DH] ?? null;
    const pitcherId = next["投"] ?? null;

    // まず、今回動かした選手がリストに居なければ追加（ただしDHが関わる移動は追加しない）
    const isDHMove = toPos === DH || fromPos === DH;
    if (!isDHMove && !updated.some((e) => e.id === playerId)) {
      if (prevPlayerIdAtTo !== null) {
        const idx = updated.findIndex((e) => e.id === prevPlayerIdAtTo);
        if (idx !== -1) updated[idx] = { id: playerId, reason: "スタメン" };
        else updated.push({ id: playerId, reason: "スタメン" });
      } else {
        updated.push({ id: playerId, reason: "スタメン" });
      }
    }


// ── DHルール（打順固定）：投手枠とDHの“中身だけ”入れ替える ──
// ── DHルール（打順固定）：投手枠とDHの“中身だけ”入れ替える ──
// 変更前のDHを退避（変数名を oldDhId として新規定義）
const oldDhId = assignments[DH] ?? null;

if (pitcherId) {
  if (dhId) {
    const pIdx = updated.findIndex((e) => e.id === pitcherId);
    const dIdx = updated.findIndex((e) => e.id === dhId);

    if (pIdx !== -1 && dIdx === -1) {
      // DHが打順に未登場：投手の“その枠”をDHに差し替え（順序はそのまま）
      updated[pIdx] = { id: dhId, reason: "スタメン" };
    } else if (pIdx !== -1 && dIdx !== -1 && pIdx !== dIdx) {
      // 既に両方が並んでいる：順序は固定で“IDだけ”入れ替え（スワップ）
      const tmp = updated[pIdx].id;
      updated[pIdx].id = updated[dIdx].id;
      updated[dIdx].id = tmp;
    }
    // pIdx === -1（投手が打順にいない）は何もしない＝打順固定
  } else if (oldDhId) {
    // DHが外れた：打順上の“DHが居た枠”を投手に戻す（順序は変えない）
    const dIdx = updated.findIndex((e) => e.id === oldDhId);
    if (dIdx !== -1) {
      updated[dIdx] = { id: pitcherId, reason: "スタメン" };
    }
  }
}



    // 重複除去 & 9人制限
    const seen = new Set<number>();
    updated = updated.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(0, 9);

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
  if (!playerId) return;

  // ① ベンチ外リストに追加（重複防止）
  setBenchOutIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));

  // ② 守備配置から完全に外す（DH含む、同一選手がどこに居てもnullへ）
  setAssignments((prev) => {
    const next = { ...prev };
    for (const k of Object.keys(next)) {
      if (next[k] === playerId) next[k] = null;
    }
    return next;
  });

  // ③ 打順からも外す（固定打順のまま、該当選手だけ除去）
  setBattingOrder((prev) => prev.filter((e) => e.id !== playerId));
};

const handleDropToBench = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();

  const playerId = Number(
    e.dataTransfer.getData("playerId") || e.dataTransfer.getData("text/plain")
  );
  if (!playerId) return;

  // 端末によって fromPosition が来ないことがあるのでフォールバック
  const fromPosRaw = e.dataTransfer.getData("fromPosition") || "";
  const fromPos =
    fromPosRaw ||
    (Object.entries(assignments).find(([, id]) => id === playerId)?.[0] ?? "");

  // ① ベンチ外 → 控え（従来どおり）
  setBenchOutIds((prev) => prev.filter((id) => id !== playerId));

  // ② フィールド → 控え は「DH」だけ許可
  if (fromPos !== DH) return;

  // ③ DH を守備から外す
  const oldDhId = assignments[DH] ?? null;
  const next = { ...assignments, [DH]: null };
  setAssignments(next);

  // ④ 打順（固定）：DHがいなくなったら投手をDHの枠に戻す
  setBattingOrder((prev) => {
    let updated = [...prev];
    const pitcherId = next["投"] ?? null;

    if (pitcherId) {
      const dIdx = oldDhId ? updated.findIndex((e) => e.id === oldDhId) : -1;
      if (dIdx !== -1) {
        updated[dIdx] = { id: pitcherId, reason: "スタメン" };
      } else if (!updated.some((e) => e.id === pitcherId)) {
        updated.push({ id: pitcherId, reason: "スタメン" });
      }
    }

    // 重複除去 & 9人制限
    const seen = new Set<number>();
    updated = updated.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(0, 9);

    return updated;
  });
};


// 2選手の“現在の守備”を入替える（打順は触らない）
const swapPositionsByPlayers = (idA: number, idB: number) => {
  if (!idA || !idB || idA === idB) return;

  const posA = Object.entries(assignments).find(([, v]) => v === idA)?.[0] as string | undefined;
  const posB = Object.entries(assignments).find(([, v]) => v === idB)?.[0] as string | undefined;
  if (!posA || !posB) return;

  const next = { ...assignments };
  next[posA] = idB;
  next[posB] = idA;

  // DH 二重登録の解消
  const DH = "指";
  if (posA !== DH && next[DH] === idB) next[DH] = null;
  if (posB !== DH && next[DH] === idA) next[DH] = null;

  setAssignments(next);
};

// 守備ラベルからドラッグ開始
const handlePosDragStart = (e: React.DragEvent<HTMLSpanElement>, playerId: number) => {
  e.dataTransfer.setData("dragKind", "swapPos");
  e.dataTransfer.setData("swapSourceId", String(playerId));
  e.dataTransfer.setData("text/plain", String(playerId));
};

// 守備ラベルへドロップ
const handleDropToPosSpan = (e: React.DragEvent<HTMLSpanElement>, targetPlayerId: number) => {
  e.preventDefault();
  e.stopPropagation(); // 行の onDrop にバブらせない
  const kind = e.dataTransfer.getData("dragKind");
  if (kind !== "swapPos") return;

  const srcStr = e.dataTransfer.getData("swapSourceId") || e.dataTransfer.getData("text/plain");
  const srcId = Number(srcStr);
  if (!srcId) return;

  swapPositionsByPlayers(srcId, targetPlayerId);
};



const handleDropToBattingOrder = (
  e: React.DragEvent<HTMLDivElement>,
  targetPlayerId: number
) => {
  e.preventDefault();

  // ★ 守備入替モードなら打順は触らず守備だけ入替
  const kind = e.dataTransfer.getData("dragKind");
  if (kind === "swapPos") {
    const srcStr =
      e.dataTransfer.getData("swapSourceId") ||
      e.dataTransfer.getData("battingPlayerId") ||
      e.dataTransfer.getData("text/plain");
    const srcId = Number(srcStr);
    if (srcId && srcId !== targetPlayerId) {
      swapPositionsByPlayers(srcId, targetPlayerId);
    }
    return;
  }

  // ↓↓ 既存の打順入替処理 ↓↓
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
 <div
   className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
   style={{
     paddingTop: "max(16px, env(safe-area-inset-top))",
     paddingBottom: "max(16px, env(safe-area-inset-bottom))",
   }}
 >
 <div className="mt-3 text-center select-none mb-2">
   <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-wide leading-tight">
     <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden><path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h10v2H3v-2z"/></svg>
     <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
       スタメン設定
     </span>
   </h1>
   <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
   <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs">
     <span className="opacity-80">ドラッグ＆ドロップで配置／打順を変更</span>
   </div>
 </div>

      {/* フィールド配置 */}
 {/* フィールド配置（カード） */}
 <section
   className="
     mb-6
     w-[100svw] -mx-6 md:mx-auto md:w-full md:max-w-2xl
     p-3 md:p-4
     bg-white/5 md:bg-white/10
     border-x-0 md:border md:border-white/10
     rounded-none md:rounded-2xl
     ring-0 md:ring-1 md:ring-inset md:ring-white/10
     shadow
   "
 >
   <div className="flex items-center gap-2 mb-3">
     <span className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
       {/* フィールドアイコン（見た目だけ） */}
       <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><path d="M12 2L2 12l10 10 10-10L12 2zm0 4l6 6-6 6-6-6 6-6z"/></svg>
     </span>
     <h2 className="font-semibold text-white">フィールド配置</h2>
   </div>
   <div className="relative">
          <img
            src="/field.png"
            alt="フィールド図"
            className="w-full h-auto md:rounded shadow select-none pointer-events-none" />
{allSlots.map((pos) => {
  const playerId = assignments[pos];
  const player = teamPlayers.find((p) => p.id === playerId);
  return (
    <div
      key={pos}
      draggable={!!player}                                   // ← これを追加
      onDragStart={(e) => player && handleDragStart(e,       // ← これを追加
        player.id, pos)}
      onDragOver={allowDrop}
      onDrop={(e) => handleDropToPosition(e, pos)}
       onTouchStart={() => player && setTouchDrag({ playerId: player.id, fromPos: pos })}
      onTouchEnd={() => {
        if (!touchDrag) return;
        const fake = makeFakeDragEvent({
          playerId: String(touchDrag.playerId),
          "text/plain": String(touchDrag.playerId),
          fromPosition: touchDrag.fromPos ?? "",
        });
        handleDropToPosition(fake, pos);
        setTouchDrag(null);
      }}
      style={{
        ...positionStyles[pos],
        position: "absolute",
        transform: "translate(-50%, -50%)",
        cursor: player ? "move" : "default",
      }}
      className="z-10 min-w-[72px] sm:min-w-[96px] max-w-[40vw] sm:max-w-[160px]
                 px-2 sm:px-2.5 h-8 sm:h-9
                 rounded-xl bg-white/90 text-gray-900 shadow border border-white/70
                 backdrop-blur-[2px] text-center
                 flex items-center justify-center select-none touch-none"
    >
      {player ? (
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, player.id, pos)}
          style={{ WebkitUserDrag: "element" }}
          className="relative w-full h-full flex items-center justify-center
                      font-semibold whitespace-nowrap overflow-hidden text-ellipsis
                      text-sm sm:text-base leading-none select-none">
          {player.lastName}{player.firstName} #{player.number}
        </div>
      ) : (
        <div className="text-gray-500">{pos === DH ? "DHなし" : "空き"}</div>
      )}
    </div>
  );
})}

      </div>
      </section>

      {/* 打順と控えを横並びに表示 */}
      {/* 控え選手 + 打順を縦並びに表示し、スマホでも最適化 */}
      <div className="flex flex-col gap-6">

        {/* 🔼 控え選手（登録済みで未使用の選手） */}
        <div>
 <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
   <span className="inline-flex w-9 h-9 rounded-xl bg-white/15 border border-white/20 items-center justify-center">
     <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M4 15h16v2H4zm2-4h12v2H6zm2-4h8v2H8z"/></svg>
   </span>
   控え選手
 </h2>
          <div
            className="flex flex-wrap gap-2 min-h-[60px] p-2 bg-white/10 border border-white/10 rounded-xl ring-1 ring-inset ring-white/10"
            onDragOver={allowDrop}
            onDrop={handleDropToBench}
            onTouchEnd={() => {
              if (!touchDrag) return;
              const fake = makeFakeDragEvent({
                playerId: String(touchDrag.playerId),
                "text/plain": String(touchDrag.playerId),
                fromPosition: touchDrag.fromPos ?? "",
              });
              handleDropToBench(fake);
              setTouchDrag(null);
            }}
          >
            {teamPlayers
              .filter((p) => !assignedIds.includes(p.id) && !benchOutIds.includes(p.id))
              .map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, p.id)}
                  className="px-2.5 py-1.5 bg-white/80 text-gray-900 rounded-lg cursor-move select-none shadow-sm"
                >
                  {p.lastName}
                  {p.firstName} #{p.number}
                </div>
              ))}
          </div>
        </div>

      {/* 🔽 ベンチ外選手（横並び表示） */}
      <div>
 <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
   <span className="inline-flex w-9 h-9 rounded-xl bg-rose-400/25 border border-rose-300/50 items-center justify-center"><IconOut /></span>
   ベンチ外選手
 </h2>
        <div
           className="flex flex-wrap gap-2 min-h-[60px] p-2
              rounded-2xl border ring-1 ring-inset
              border-rose-600/90 ring-rose-600/60
              bg-gradient-to-br from-rose-600/45 via-rose-500/35 to-rose-400/25"
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
                className="px-2.5 py-1.5 bg-white/85 text-gray-900 border border-rose-200 rounded-lg cursor-move select-none shadow-sm"
              >
                {p.lastName}{p.firstName} #{p.number}
              </div>
            ))
          )}
        </div>
      </div>



      <div>
 <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
   <span className="inline-flex w-9 h-9 rounded-xl bg-white/15 border border-white/20 items-center justify-center"><IconOrder /></span>
   打順（1～9番）
   <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">ドラッグ＆ドロップで変更</span>
 </h2>
        <div className="space-y-2">
          {battingOrder.map((entry, i) => {
            const player = teamPlayers.find((p) => p.id === entry.id);
            if (!player) return null;
            const pos = getPositionOfPlayer(entry.id);

            return (
              <div
                key={entry.id}
                className="rounded-xl bg-sky-400/15 border border-sky-300/40 p-2 shadow cursor-move"
                draggable
                onDragStart={(e) => handleBattingOrderDragStart(e, entry.id)}
                onDrop={(e) => handleDropToBattingOrder(e, entry.id)}
                onDragOver={allowDrop}
              >
                <div className="flex items-center gap-2 flex-nowrap">
                  <span className="w-10 font-bold">{i + 1}番</span>
<span
  data-role="poslabel"                 // ★ 追加：ターゲット識別
  data-player-id={entry.id}            // ★ 追加：誰の行か
  className="w-28 md:w-24 px-1 rounded bg-white/10 border border-white/10
             cursor-move select-none text-center whitespace-nowrap shrink-0 touch-none"  // ★ touch-noneでスクロール干渉を抑止
  title={pos ? "この守備を他の行と入替" : "守備なし"}
  draggable={!!pos}
  onDragStart={(e) => handlePosDragStart(e, entry.id)}
  onDragOver={allowDrop}
  onDrop={(e) => handleDropToPosSpan(e, entry.id)}
  onTouchStart={() => pos && setTouchDrag({ playerId: entry.id })}  // ← 開始は保持だけ
  /* ← onTouchEnd は削除：グローバルでまとめて処理 */
>
  {pos ? positionNames[pos] : "控え"}
</span>



                   {/* 選手名 → 右にずらす */}
                  <span className="ml-4 whitespace-nowrap">
                    {player.lastName}{player.firstName}
                  </span>
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