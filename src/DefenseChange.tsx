import React, { useEffect, useState } from "react";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { useDrag } from "react-dnd";

import type { DefenseChangeProps } from "./DefenseChange";  // ★ここに追加

import localForage from "localforage";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react"; //

let ChangeFlg = 0; // 初期値

const getPlayerById = (id: number | null): Player | undefined => {
  if (id === null) return undefined;
  return teamPlayers.find(p => p.id === id);
};


type Player = {
  id: number;
  name?: string;
  lastName?: string;
  firstName?: string;
  lastNameKana?: string;
  irstNameKana?: string; 
  number: string;
};

type ChangeRecord =
  | {
      type: "replace";
      order: number;
      from: Player;
      to: Player;
      pos: string;
    }
  | {
      type: "shift";
      order: number;
      player: Player;
      fromPos: string;
      toPos: string;
    }
  | {
      type: "mixed";
      order: number;
      from: Player;
      to: Player;
      fromPos: string;
      toPos: string;
    };

const posNameToSymbol: Record<string, string> = {
  ピッチャー: "投",
  キャッチャー: "捕",
  ファースト: "一",
  セカンド: "二",
  サード: "三",
  ショート: "遊",
  レフト: "左",
  センター: "中",
  ライト: "右",
};



/* ===== 氏名＆敬称ヘルパー ===== */
const ruby = (kanji?: string, kana?: string): string =>
  kana ? `<ruby>${kanji}<rt>${kana}</rt></ruby>` : kanji ?? "";

/* 姓・名それぞれのルビ */
const lastRuby  = (p: Player): string => ruby(p.lastName,  p.lastNameKana);
const firstRuby = (p: Player): string => ruby(p.firstName, p.firstNameKana);

const honor = (p: Player): string => (p.isFemale ? "さん" : "くん");

/* 姓ルビ＋名ルビ（敬称なし） */
const fullName = (p: Player): string => `${lastRuby(p)}${firstRuby(p)}`;

/* 姓ルビ＋名ルビ＋敬称（控えから入る側） */
const fullNameHonor = (p: Player): string => `${fullName(p)}${honor(p)}`;

/* 姓ルビ＋敬称（移動／交代される側） */
const lastWithHonor = (p: Player): string => `${lastRuby(p)}${honor(p)}`;
 /* ================================= */


/* =========================================================
   アナウンス文生成 ― テンプレート完全対応版
   (打順が欠落しない／一人交代時は「以上に代わります」を付けない)
========================================================= */
const generateAnnouncementText = (
  records: ChangeRecord[],
  teamName: string,
  battingOrder: { id: number; reason: string }[] = [],
  assignments: Record<string, number | null> = {},
  teamPlayers: Player[] = [],
  initialAssignments: Record<string, number | null> = {},
  usedPlayerInfo: Record<number, UsedPlayerInfo> = {}
): string => {
  /* ---------- 前処理 ---------- */
  const posJP: Record<string, string> = {
    投: "ピッチャー", 捕: "キャッチャー", 一: "ファースト", 二: "セカンド",
    三: "サード",   遊: "ショート",     左: "レフト",   中: "センター",  右: "ライト"
  };
  const reasonMap = Object.fromEntries(
    battingOrder.map(e => [e.id, e.reason])
  ) as Record<number, string>;
  
  const handledIds = new Set<number>();

  /* ---------- レコード分類 ---------- */
  let  replace = records.filter(r => r.type === "replace") as Extract<ChangeRecord, {type:"replace"}>[];
  let  shift    = records.filter(r => r.type === "shift")   as Extract<ChangeRecord, {type:"shift"}>[];
  let  mixed    = records.filter(r => r.type === "mixed")   as Extract<ChangeRecord, {type:"mixed"}>[];

  /* ---------- 文言生成用バッファ ---------- */
  const result: string[] = [];
  const lineupLines: {order:number; text:string}[] = [];
  let skipHeader = false;

/* ============================================================
   ✅ 特別処理：代打退場 → 控えが別守備 → 元選手がシフト
   ※ ヒットしたら即 return で通常ロジックをスキップ
============================================================= */
const specialResult = (() => {
  for (const [idx, entry] of battingOrder.entries()) {
    if (entry.reason !== "代打") continue;

    // --- 代打本人 ---
    const pinch = teamPlayers.find(p => p.id === entry.id);
    if (!pinch) continue;

  // --- usedPlayerInfo から代打 (subId) を検索し、元ポジションを取得 ---
  const pinchInfoPair = Object.entries(usedPlayerInfo)
    .find(([, info]) =>
      info.reason === "代打" && info.subId === entry.id
    );
  if (!pinchInfoPair) continue;
  const [origStarterIdStr, pinchInfo] = pinchInfoPair;
  const origPos         = pinchInfo.fromPos as keyof typeof posJP;   // "三"
  const origStarterId   = Number(origStarterIdStr);                  // 元ショート＝佐々木楓

  // --- 退場していなければ対象外 ---
    if (Object.values(assignments).includes(entry.id)) continue;

    // --- 控えで現在フィールドにいる選手（加藤）---
    const subInPair = Object.entries(assignments)
      .find(([pos, id]) =>
        !Object.values(initialAssignments).includes(id) &&  // スタメンでない（控え）
        id !== entry.id                                     // 代打本人でもない
      );
    if (!subInPair) continue;
    const [subInPos, subInId] = subInPair;
    const subIn = teamPlayers.find(p => p.id === subInId)!;

 const movedPlayerId   = assignments[origPos];              // 例：佐々木 ID
 if (!movedPlayerId || movedPlayerId === entry.id) continue;
 const movedPlayer     = teamPlayers.find(p => p.id === movedPlayerId)!;

 // その選手の“元ポジション”を初期守備から拾う
 const movedFromPos = Object.entries(initialAssignments)
   .find(([p, id]) => id === movedPlayerId)?.[0] as keyof typeof posJP;
 if (!movedFromPos || movedFromPos === origPos) continue;

 // 出力で使う位置名
 const movedToPos = origPos;    // いま入った先はサード

      console.log("✅ 特別処理：代打退場 → 控えが別守備 → 元選手がシフト");
    // ---------- 🎤 アナウンス ----------
    const lines: string[] = [];
    lines.push(
      `先ほど代打致しました${lastWithHonor(pinch)} に代わりまして、` +
      `${idx + 1}番に ${fullNameHonor(subIn)} が入り ${posJP[subInPos]}へ、`
    );
    lines.push(
      `${posJP[movedFromPos]}の ${lastWithHonor(movedPlayer)} が ${posJP[movedToPos]} に入ります。`
    );

    // ---------- lineup ----------
    const lineup: { order: number; txt: string }[] = [];
    lineup.push({
      order: idx + 1,
      txt: `${idx + 1}番 ${posJP[subInPos]} ${fullNameHonor(subIn)} 背番号 ${subIn.number}`,
    });
    const movedOrder = battingOrder.findIndex(e => e.id === movedPlayer.id);
    if (movedOrder >= 0) {
      lineup.push({
        order: movedOrder + 1,
        txt: `${movedOrder + 1}番 ${posJP[movedToPos]} ${lastWithHonor(movedPlayer)}`,
      });
    }

    lineup.sort((a, b) => a.order - b.order)
          .forEach(l => lines.push(l.txt));
    lines.push("以上に代わります。");

    return lines;         // ★ 特別シナリオに該当したら即 return
  }
  return null;            // ヒットしなければ通常ロジックへ
})();

if (specialResult) return specialResult.join("\n");



   /* =================================================================
   🆕 特別処理: 代打選手に代わって控えが同じ守備位置に入ったケースを先に処理
               const handledIds = new Set<number>();
  ==================================================================== */
  battingOrder.forEach((entry, idx) => {
    if (entry.reason !== "代打") return;

    const originalPlayer = teamPlayers.find(p => p.id === entry.id);
    if (!originalPlayer) return;

    // 元の代打がいた守備位置（initialAssignments 上では "代打" は割り当てなし）
    const pos = Object.entries(initialAssignments).find(([_, id]) => id === entry.id)?.[0] as keyof typeof posJP;
    if (!pos) return;

    const currentId = assignments[pos]; // 現在その守備に誰がいるか
    if (!currentId || currentId === entry.id) return; // 同一人物なら無視

    // ✅ 代打選手が他のポジションに守備で入っている場合はこの処理をスキップする
    const isNowPlayingElsewhere = Object.entries(assignments).some(
      ([k, v]) => v === entry.id && k !== pos
    );
    if (isNowPlayingElsewhere) return;

    const subPlayer = teamPlayers.find(p => p.id === currentId);
    if (!subPlayer) return;
 
    if (Object.values(initialAssignments).includes(subPlayer.id)) return;
    
    console.log("✅ 特別処理: 代打選手に代わって控えが同じ守備位置に入ったケース");

    // ➤ 代打選手が守備に入らず、代わりに控え選手が同じ位置に入ったケース
    result.push(`先ほど代打致しました${lastWithHonor(originalPlayer)} に代わりまして、${fullNameHonor(subPlayer)} がそのまま入り ${posJP[pos]}、`);
    lineupLines.push({
      order: idx + 1,
      text: `${idx + 1}番 ${posJP[pos]} ${fullNameHonor(subPlayer)} 背番号 ${subPlayer.number}`,
    });
    
    replace.length =0;
    //const handledIds = new Set<number>();    
    handledIds.add(entry.id); // ✅ 通常処理から除外するために記録
    return; // ✅ この後の通常交代文には進ませない
  });

/* =================================================================
✅ 特化ブロック（代打 → 守備入り → 元守備選手が移動）
  ==================================================================== */
const pinchShiftLines: string[] = [];

battingOrder.forEach((entry, idx) => {
  if (entry.reason !== "代打") return;
  if (handledIds.has(entry.id)) return;
    
   const pinchAssignedElsewhere = Object.entries(assignments).some(
    ([k, v]) => v === entry.id
  );
  if (!pinchAssignedElsewhere) {
    // 現在守備にいない場合
    const currentPosPlayerIds = Object.values(assignments);
    const replacementExists = currentPosPlayerIds.includes(entry.id) === false;

    // 元の守備に他の選手（控え）が入っていれば、このブロックをスキップ
    if (replacementExists) return;
  }

  const pinchPlayer = teamPlayers.find(p => p.id === entry.id);
  if (!pinchPlayer) return;

  // 現在その選手が入っている守備位置
  const pos = Object.entries(assignments).find(([_, id]) => id === entry.id)?.[0] as keyof typeof posJP;
  if (!pos) return;

  // 元々その守備位置にいた選手
  const originalId = initialAssignments[pos];
  if (!originalId || originalId === entry.id) return;

  const movedPlayer = teamPlayers.find(p => p.id === originalId);
  if (!movedPlayer) return;

  // 移動後の守備位置
  const movedToPos = Object.entries(assignments).find(([k, v]) => v === originalId)?.[0] as keyof typeof posJP;
  if (!movedToPos || movedToPos === pos) return;

  console.log("✅ 特化ブロック（代打 → 守備入り → 元守備選手が移動）");
  
  // 文言構築
  const rubyPinch = `<ruby>${pinchPlayer.lastName}<rt>${pinchPlayer.lastNameKana ?? ""}</rt></ruby>${pinchPlayer.isFemale ? "さん" : "くん"}`;
  const rubyMoved = `<ruby>${movedPlayer.lastName}<rt>${movedPlayer.lastNameKana ?? ""}</rt></ruby>${movedPlayer.isFemale ? "さん" : "くん"}`;

  pinchShiftLines.push(`先ほど代打致しました${rubyPinch}が${posJP[pos]}、`);
  pinchShiftLines.push(`${posJP[pos]}の ${rubyMoved} が ${posJP[movedToPos]} に入ります。`);

  // lineupLines
  lineupLines.push({ order: idx + 1, text: `${idx + 1}番 ${posJP[pos]} ${rubyPinch}` });
  const movedOrder = battingOrder.findIndex(e => e.id === movedPlayer.id);
  if (movedOrder >= 0) {
    lineupLines.push({ order: movedOrder + 1, text: `${movedOrder + 1}番 ${posJP[movedToPos]} ${rubyMoved}` });
  }

  // replace/shift をスキップするために削除
  replace.length = 0;
  shift.length = 0;
  mixed.length = 0;
});

if (pinchShiftLines.length > 0) {
  result.push(...pinchShiftLines);
  // ✅ 打順行の出力を追加
  lineupLines
    .sort((a, b) => a.order - b.order)
    .forEach((l) => result.push(l.text));

  result.push("以上に代わります。");
  skipHeader = true;  // 👈 ヘッダー表示を抑制
  return result.join("\n");
}


/* =========================================
  1) 代打・代走 → そのまま守備へ (samePosPinch)
========================================= */
const pinchInSamePos: string[] = [];

battingOrder.forEach((entry, idx) => {
  const player = teamPlayers.find(p => p.id === entry.id);
  if (!player) return;

  const pos = Object.entries(assignments).find(([_, id]) => id === entry.id)?.[0] as keyof typeof posJP | undefined;
  if (!pos) return;

  const wasReplaced = !!usedPlayerInfo[entry.id];
  const unchanged   = initialAssignments[pos] === entry.id;

  if ((entry.reason === "代打" || entry.reason === "代走") && !wasReplaced && unchanged) {
    const honor = player.isFemale ? "さん" : "くん";
    const ruby   = `<ruby>${player.lastName}<rt>${player.lastNameKana ?? ""}</rt></ruby>${honor}`;
    const head   = pinchInSamePos.length === 0 ? "先ほど" : "同じく先ほど";
    pinchInSamePos.push(`${head}${entry.reason}致しました${ruby} がそのまま入り ${posJP[pos]}`);

    lineupLines.push({
      order: idx + 1,
      text : `${idx + 1}番 ${posJP[pos]} ${ruby}`      
    });
    
  }
});

if (pinchInSamePos.length === 1) {
  result.push(pinchInSamePos[0] + "。");
  skipHeader = true; // 👈 ここ追加
} else if (pinchInSamePos.length > 1) {
  result.push(pinchInSamePos.join("、\n") + "。");
  skipHeader = true; // 👈 ここ追加
}

/* =========================================
  2) 代打・代走を含まない通常交代ロジック
　========================================= */
  const hasShift     = shift.length   > 0;
  const hasReplace   = replace.length > 0;
  const hasMixed     = mixed.length   > 0;
  const totalMoves   = shift.length + replace.length + mixed.length;

  /* ---- ヘッダー ---- */
  // ✅ 通常交代のヘッダー出力をスキップ可能にする
  if (result.length === 0) {
    if (hasMixed || (hasReplace && hasShift)) {
      result.push(`${teamName}、選手の交代並びにシートの変更をお知らせいたします。`);
    } else if (hasReplace) {
      result.push(`${teamName}、選手の交代をお知らせいたします。`);
    } else if (hasShift) {
      result.push(`${teamName}、シートの変更をお知らせいたします。`);
    }
  }

/* ---- 並べ替え：守備位置番号順に ---- */
const nextPosMap: Record<string, string> = { 二: "中", 中: "左", 左: "遊", 遊: "右" };

// 守備位置の表示順序（昇順）
const posOrder = ["投", "捕", "一", "二", "三", "遊", "左", "中", "右"];
const posIndex = (pos: string) => posOrder.indexOf(pos);

replace.sort((a, b) => posIndex(a.pos) - posIndex(b.pos));
mixed.sort((a, b) => posIndex(a.fromPos) - posIndex(b.fromPos));
shift.sort((a, b) => posIndex(a.fromPos) - posIndex(b.fromPos));

/* ---- replace / mixed ---- */
const addReplaceLine = (line: string, isLast: boolean) =>
    result.push(isLast ? line + "。" : line + "、");

const replaceLines: string[] = [];

replace = replace.filter(r => !handledIds.has(r.from.id));

replace.forEach((r) => {
  const line = `${posJP[r.pos]} ${lastWithHonor(r.from)} に代わりまして、${fullNameHonor(r.to)}`;
  replaceLines.push(line);

  
// lineupLines の重複防止付き追加
  if (!lineupLines.some(l => l.order === r.order)) {
    lineupLines.push({
      order: r.order,
      text: `${r.order}番 ${posJP[r.pos]} ${fullNameHonor(r.to)} 背番号 ${r.to.number}`
    });
  }
});

if (replaceLines.length === 1) {
  const sentence = shift.length > 0
    ? replaceLines[0] + "、"
    : replaceLines[0] + " が入ります。";
  result.push(sentence);
} else if (replaceLines.length > 1) {
  const last = replaceLines.pop()!;
  const continuedLines = replaceLines.map(line => line + "、").join("\n");
  const lastLine = shift.length > 0
    ? last + "、"
    : last + " が入ります。";
  result.push(`${continuedLines}\n${lastLine}`);
}


mixed.forEach((r, i) => {
  addReplaceLine(
    `${posJP[r.fromPos]}の ${lastWithHonor(r.from)} に代わりまして、${r.order}番に ${fullNameHonor(r.to)} が入り ${posJP[r.toPos]}へ`,
    i === mixed.length - 1 && !hasShift
  );
  lineupLines.push({
    order: r.order,
    text: `${r.order}番 ${posJP[r.toPos]} ${fullNameHonor(r.to)} 背番号 ${r.to.number}`
  });
});

/* ---- shift ---- */
// 守備変更：連鎖構造に並べ替え
const buildShiftChain = (shifts: typeof shift): typeof shift[] => {
  const fromMap = new Map(shifts.map(s => [s.fromPos, s]));
  const toMap = new Map(shifts.map(s => [s.toPos, s]));

  const used = new Set<string>();
  const chains: typeof shift[] = [];

  shifts.forEach((s) => {
    if (used.has(s.fromPos)) return;

    const chain: typeof shift = [];
    let current: typeof s | undefined = s;

    while (current && !used.has(current.fromPos)) {
      chain.push(current);
      used.add(current.fromPos);
      current = fromMap.get(current.toPos);
    }

    chains.push(...chain);
  });

  return chains;
};

// チェーン順に並べて表示
const sortedShift = buildShiftChain(shift);

sortedShift.forEach((s, i) => {
  const h = s.player.isFemale ? "さん" : "くん";
  const head = posJP[s.fromPos];
  const tail = posJP[s.toPos];
  const ends = i === sortedShift.length - 1 ? "入ります。" : "、";
  result.push(`${head}の ${lastRuby(s.player)}${h} が ${tail} に${ends}`);

  lineupLines.push({
    order: s.order,
    text: `${s.order}番 ${tail} ${lastRuby(s.player)}${h}`
  });
});

  /* ---- 打順行を最後にまとめて追加 ---- */
  lineupLines
    .sort((a, b) => a.order - b.order)
    .forEach(l => result.push(l.text));

  /* ---- 「以上に代わります。」判定 ---- */
  const total = replace.length + shift.length + mixed.length;
  if ((total >= 2) || (lineupLines.length >= 2)) {
    result.push("以上に代わります。");
  }
  return result.join("\n");
};





const positionStyles: Record<string, React.CSSProperties> = {
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

const positions = Object.keys(positionStyles);
const BENCH = "控え";

const formatPlayerLabel = (player?: { id: number; number?: string | number; lastName?: string; firstName?: string }) => {
  if (!player) return "未設定";
  return `${player.lastName ?? ""}${player.firstName ?? ""} #${player.number ?? "-"}`;
};

const getPositionName = (assignments: Record<string, number | null>, playerId: number): string => {
  const entry = Object.entries(assignments).find(([_, id]) => id === playerId);
  return entry ? entry[0] : "－";
};

const formatLog = (pos: string, player?: Player | null): string =>
  `${pos}：${formatPlayerLabel(player)}`;

type DefenseChangeProps = {
  onConfirmed: () => void;
};

const DefenseChange: React.FC<DefenseChangeProps> = ({ onConfirmed }) => {
  
  const [teamName, setTeamName] = useState("自チーム");

  useEffect(() => {
    localForage.getItem("team").then((data) => {
      if (data && typeof data === "object" && "name" in data) {
        setTeamName(data.name as string);
      }
    });
  }, []);

  const [assignments, setAssignments] = useState<Record<string, number | null>>({});
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [battingOrder, setBattingOrder] = useState<{ id: number; reason: string }[]>([]); // ✅ 攻撃画面の打順
  const [benchPlayers, setBenchPlayers] = useState<Player[]>([]);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [substitutionLogs, setSubstitutionLogs] = useState<string[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [battingReplacements, setBattingReplacements] = useState<{ [index: number]: Player }>({});
  const [previousPositions, setPreviousPositions] = useState<{ [playerId: number]: string }>({});
  const [initialAssignments, setInitialAssignments] = useState<Record<string, number | null>>({});

useEffect(() => {
  const setInitialAssignmentsFromSubs = async () => {
    const battingOrder = await localForage.getItem<{ id: number; reason: string }[]>("battingOrder");
    const assignments = await localForage.getItem<Record<string, number | null>>("lineupAssignments");
    const usedPlayerInfo = await localForage.getItem<Record<number, {
      fromPos: string;
      subId: number;
      reason: "代打" | "代走" | "守備交代";
      order: number;
      wasStarter: boolean;
    }>>("usedPlayerInfo");

    if (!battingOrder || !assignments || !usedPlayerInfo) return;

    // ⚠️ "代打" or "代走" 選手がいれば initialAssignments にも反映
    const updatedAssignments = { ...assignments };
    Object.entries(usedPlayerInfo).forEach(([originalIdStr, info]) => {
      const { subId, fromPos, reason } = info;
      if ((reason === "代打" || reason === "代走") && fromPos in updatedAssignments) {
        updatedAssignments[fromPos] = subId;
      }
    });

    setInitialAssignments(updatedAssignments);
  };

  setInitialAssignmentsFromSubs();
}, []);

useEffect(() => {
  console.log("✅ DefenseScreen mounted");
  const loadData = async () => {
    const [orderRaw, assignRaw, playersRaw, usedRaw] = await Promise.all([
      localForage.getItem("battingOrder"),
      localForage.getItem("lineupAssignments"),
      localForage.getItem("team"),
      localForage.getItem("usedPlayerInfo"),
    ]);

    const order = Array.isArray(orderRaw) ? orderRaw as { id: number; reason: string }[] : [];
    const originalAssignments = (assignRaw ?? {}) as Record<string, number | null>;
    const usedInfo = (usedRaw ?? {}) as Record<number, { fromPos: string; subId?: number }>;    
    const newAssignments: Record<string, number | null> = { ...originalAssignments };

    // チームプレイヤー取得
    let updatedTeamPlayers = Array.isArray(playersRaw?.players) ? [...playersRaw.players] : [];

    // ✅ 代打・代走の割り当て
    for (const [originalIdStr, info] of Object.entries(usedInfo)) {
      const subId = info.subId;
      const fullNamePos = info.fromPos;
      const fromPos = posNameToSymbol[fullNamePos ?? ""] ?? fullNamePos ?? "";

      if (subId && fromPos) {
        newAssignments[fromPos] = subId;
        console.log(`[DEBUG] 代打/代走 ${subId} を ${fromPos} に配置`);

        const exists = updatedTeamPlayers.some(p => p.id === subId);
        if (!exists) {
          const fallback = updatedTeamPlayers.find(p => p.id === Number(originalIdStr));
          if (fallback) {
            updatedTeamPlayers.push({ ...fallback, id: subId });
            console.log(`[DEBUG] 仮選手追加: ${subId}`);
          }
        }
      }
    }

    // ステート更新
    setBattingOrder(order);
    setInitialAssignments(originalAssignments);
    setUsedPlayerInfo(usedInfo);
    setAssignments(newAssignments);
    setTeamPlayers(updatedTeamPlayers);

    // デバッグ出力
    console.log("[DEBUG] battingOrder:", order);
    console.log("[DEBUG] usedPlayerInfo:", usedInfo);
    console.log("[DEBUG] 最終 assignments:", newAssignments);
  };

  loadData();
}, []);


const [usedPlayerInfo, setUsedPlayerInfo] = useState<Record<number, { fromPos: string }>>({});
  const [debugLogs, setDebugLogs] = useState<string[]>([]);





let battingLogsBuffer: string[][] = []; // 一時的なログ格納用（map中に使う）

  const navigate = useNavigate();

  const defensePositionMap: Record<string, string> = {
  "投": "ピッチャー",
  "捕": "キャッチャー",
  "一": "ファースト",
  "二": "セカンド",
  "三": "サード",
  "遊": "ショート",
  "左": "レフト",
  "中": "センター",
  "右": "ライト",
};

const posNum: Record<string, string> = {
  "投": "①",
  "捕": "②",
  "一": "③",
  "二": "④",
  "三": "⑤",
  "遊": "⑥",
  "左": "⑦",
  "中": "⑧",
  "右": "⑨",
};
const withMark = (pos: string) => `${posNum[pos] ?? ""}${pos}`;

const announcementText = useMemo(() => {

  const changes: ChangeRecord[] = [];

  battingOrder.forEach((entry, index) => {
    
    const starter = teamPlayers.find(p => p.id === entry.id);
    if (!starter) return;

    const replacement = battingReplacements[index];
    const originalPos = getPositionName(initialAssignments, starter.id);

    if (replacement) {
      const newPos = getPositionName(assignments, replacement.id);

      // ✅ 同じ選手かどうか
      if (replacement.id === starter.id) {
        if (originalPos !== newPos) {
          // ✅ 同一選手だがポジションが変わっている → shift 扱い
          changes.push({
            type: "shift",
            order: index + 1,
            player: starter,
            fromPos: originalPos,
            toPos: newPos,
          });
        } else {
          // ✅ 同一選手で守備位置も同じ → スキップ
          console.log(`[SKIP] ${starter.lastName}くん 同一守備位置に戻ったためスキップ`);
        }
        return; // これ以上の処理不要
      }


      if (originalPos === newPos) {
        changes.push({
          type: "replace",
          order: index + 1,
          from: starter,
          to: replacement,
          pos: originalPos,
        });
      } else {
        changes.push({
          type: "mixed",
          order: index + 1,
          from: starter,
          to: replacement,
          fromPos: originalPos,
          toPos: newPos,
        });
      }
    } else {
      const newPos = getPositionName(assignments, starter.id);
      if (originalPos !== newPos) {
        changes.push({
          type: "shift",
          order: index + 1,
          player: starter,
          fromPos: originalPos,
          toPos: newPos,
        });
      }
    }
  });

  return generateAnnouncementText(
  changes,
  teamName,
  battingOrder,
  assignments,
  teamPlayers,
  initialAssignments,
  usedPlayerInfo
);

}, [battingOrder, assignments, initialAssignments, battingReplacements, teamName, teamPlayers,usedPlayerInfo]);

useEffect(() => {
  if (!battingOrder || !usedPlayerInfo) return;

  const updatedAssignments = { ...assignments };
  let changed = false;

  // 代打または代走として出場している選手を元の選手の位置に自動配置
  battingOrder.forEach((entry) => {
    const info = usedPlayerInfo[entry.id];
    if (info?.subId && (entry.reason === "代打" || entry.reason === "代走")) {
      const pos = initialAssignments ? Object.entries(initialAssignments).find(([, pid]) => pid === entry.id)?.[0] : undefined;
      if (pos && updatedAssignments[pos] !== info.subId) {
        console.log(`[DEBUG] 代打/代走 ${info.subId} を ${pos} に配置`);
        updatedAssignments[pos] = info.subId;
        changed = true;
      }
    }
  });

  if (changed) {
    setAssignments(updatedAssignments);
  }
}, [battingOrder, usedPlayerInfo, initialAssignments]);

useEffect(() => {
  (async () => {
    const savedAssignments = await localForage.getItem<Record<string, number | null>>("lineupAssignments");
    const savedTeam = await localForage.getItem<{ name: string; players: Player[] }>("team");

    if (savedTeam?.players) {
      setTeamPlayers(savedTeam.players);
      const assignedIds = savedAssignments
        ? Object.values(savedAssignments).filter((id): id is number => id !== null)
        : [];
      const benchOutIds: number[] = (await localForage.getItem("benchOutIds")) || [];

      setBenchPlayers(
        savedTeam.players.filter(
          (p) => !assignedIds.includes(p.id) && !benchOutIds.includes(p.id)
        )
      );
    }

    setIsLoading(false);
  })();
}, []);

  const handlePositionDragStart = (
    e: React.DragEvent<HTMLDivElement>,   // ← event を受け取る
    pos: string
  ) => {
    e.dataTransfer.setData("fromPos", pos); // ★必須 – iOS/Android でドラッグを成立させる
    e.dataTransfer.effectAllowed = "move";
    setDraggingFrom(pos);
  };

  const handleBenchDragStart = (e: React.DragEvent, playerId: number) => {
    e.dataTransfer.setData("playerId", playerId.toString());
    e.dataTransfer.setData("text/plain", playerId.toString()); // ★ Android 用
    e.dataTransfer.effectAllowed = "move";                     // ★ 視覚的にも安定
    setDraggingFrom(BENCH);
  };

  const handleDrop = (toPos: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggingFrom) return;

    setAssignments((prev) => {
      const newAssignments = { ...prev };

    if (draggingFrom !== BENCH && toPos !== BENCH && draggingFrom !== toPos) {
      const fromId = prev[draggingFrom];
      const toId = prev[toPos];

      // 🔒 どちらかの位置が空なら交代不可（控え扱いなので）
      if (fromId === null || toId === null) return prev;

      const newAssignments = { ...prev };
      newAssignments[draggingFrom] = toId;
      newAssignments[toPos] = fromId;

      if (fromId !== null) {
        setPreviousPositions((prevMap) => ({ ...prevMap, [fromId]: draggingFrom }));
      }
      if (toId !== null) {
        setPreviousPositions((prevMap) => ({ ...prevMap, [toId]: toPos }));
      }
if (fromId !== null && toId !== null) {
  battingOrder.forEach((starter, index) => {
    const starterPos = getPositionName(initialAssignments, starter.id);
    const assignedId = newAssignments[starterPos];

    const isAssignedPlayerStarter = battingOrder.some(p => p.id === assignedId);

    // ✅ すでに他の打順に交代として表示されているなら無視
    const isAlreadyReplaced = Object.values(battingReplacements).some(
      (p) => p.id === assignedId && assignedId !== starter.id
    );
    if (isAlreadyReplaced) return;

    if (assignedId !== starter.id && !isAssignedPlayerStarter) {
      const newPlayer = teamPlayers.find((p) => p.id === assignedId);
      if (newPlayer) {
        setBattingReplacements((prev) => ({
          ...prev,
          [index]: newPlayer,
        }));
      }
    } else if (assignedId === starter.id) {
      setBattingReplacements((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });
    }
  });
}





      updateLog(draggingFrom, fromId, toPos, toId);
      return newAssignments;
    }

if (draggingFrom === BENCH && toPos !== BENCH) {
  const playerIdStr =
    e.dataTransfer.getData("playerId") || e.dataTransfer.getData("text/plain");
  if (!playerIdStr) return prev;
  const playerId = Number(playerIdStr);

  const replacedId = newAssignments[toPos];  // 守備位置にいた選手
  newAssignments[toPos] = playerId;


// 🟡 元いた選手を控えに戻す（重複防止）
if (replacedId) {
  setBenchPlayers((prev) => {
    if (prev.some((p) => p.id === replacedId)) return prev;
    const replacedPlayer = teamPlayers.find((p) => p.id === replacedId);
    if (!replacedPlayer) return prev;
    return [...prev, replacedPlayer];
  });
}
// 🔴 出た控え選手を控えリストから除去
setBenchPlayers((prev) => prev.filter((p) => p.id !== playerId));


  // 🟢 打順中に replacedId がいた場合は、battingReplacements に控え選手を登録
 // ① 直接先発と交代するケース
 let targetIndex = battingOrder.findIndex(e => e.id === replacedId);
 // ② すでに「控え ➡ 控え」の置き換えがあった場合は
 //    battingReplacements のキー(index) を引き継ぐ
 if (targetIndex === -1) {
   const prevEntry = Object.entries(battingReplacements)
     .find(([, p]) => p.id === replacedId);
   if (prevEntry) targetIndex = Number(prevEntry[0]);
 }

 if (targetIndex !== -1 && replacedId !== playerId) {
   const benchPlayer = teamPlayers.find((p) => p.id === playerId);
   if (benchPlayer) {
     setBattingReplacements((prev) => ({
       ...prev,
       [targetIndex]: benchPlayer,    // ← ★ 同じ index を上書き
     }));
   }
 }

  // 🔄 交代取り消しのチェック（初期と一致していたら削除）
 setBattingReplacements((prev) => {
   // ① いままでの置き換えをまず引き継ぐ
   const rebuilt: { [idx: number]: Player } = { ...prev };

    battingOrder.forEach((starter, idx) => {
      const starterPos = getPositionName(initialAssignments, starter.id);   // もともとの守備位置
      const assignedId = newAssignments[starterPos];                       // 今そこにいる選手
      /* 🆕 ここで「assignedId が先発メンバーか」を判定 */
      const isAssignedStarter =
        typeof assignedId === "number" &&
        battingOrder.some((entry) => entry.id === assignedId);

         // 🆕 スターター本人がどこかの守備にまだ立っているか
        const starterStillOnField = Object.values(newAssignments).includes(starter.id);

       // ① assignedId が“もともと打順にいる選手”ならスワップとみなす → 交代登録しない+   const isAssignedStarter = battingOrder.some(e => e.id === assignedId);
     // ③ 初めて控え選手が入った場合だけ新規登録
      // （2）スターターがベンチに下がった場合だけ “交代” とする
      if (
        assignedId &&                     // 誰かが入っていて
        assignedId !== starter.id &&      // その誰かがスターター本人ではなく
        !isAssignedStarter &&             // 先発メンバーでもなく
        !starterStillOnField              // ←★ スターターがもう守備に居ない
      ) {
        const p = teamPlayers.find((pl) => pl.id === assignedId);
        if (p) rebuilt[idx] = p;                                            // 置き換え登録
      }
      // ④ それ以外（先発どうしの入れ替え等）は “prev” を保持
    });

    return rebuilt;
  });

  updateLog(BENCH, playerId, toPos, replacedId);
  return newAssignments;
}





      return prev;
    });

    setDraggingFrom(null);
  };

  const handleDropToBattingOrder = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.getData("playerId") || e.dataTransfer.getData("text/plain");
    const playerId = Number(idStr);
    const player = benchPlayers.find((p) => p.id === playerId);
    if (!player) return;

    setBattingReplacements((prev) => ({
      ...prev,
      [index]: player,
    }));

    setBenchPlayers((prev) => prev.filter((p) => p.id !== playerId));
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

//**************// 
//　確定ボタン　 //
//**************// 
  const confirmChange = async () => {
    const usedInfo: Record<
    number,
    {
      fromPos: string;
      subId: number;
      reason:"守備交代";
      order: number;
      wasStarter: boolean;
    }
  > = (await localForage.getItem("usedPlayerInfo")) || {};

  positions.forEach((pos) => {
    const initialId = initialAssignments[pos];  // 元の選手
    const currentId = assignments[pos];         // 現在の選手
    const playerChanged = initialId && currentId && initialId !== currentId;

    if (playerChanged) {
      const battingIndex = battingOrder.findIndex((e) => e.id === initialId);
      if (battingIndex !== -1) {
        const order = battingIndex + 1;
        const reason = battingOrder[battingIndex]?.reason;
        const wasStarter = reason === "スタメン";

        // 代打・代走なら守備位置名を "代打" または "代走" にする
        const fromPos = reason === "代打"
          ? "代打"
          : reason === "代走"
          ? "代走"
          : pos;

        usedInfo[initialId] = {
          fromPos,
          subId: currentId,
          reason: "守備交代",
          order,
          wasStarter,
        };
      }
    }
  });
  await localForage.setItem("usedPlayerInfo", usedInfo);
  console.log("✅ 守備交代で登録された usedPlayerInfo：", usedInfo);

  // 現在の打順をコピーして更新
  const updatedOrder = structuredClone(battingOrder); // または [...battingOrder]

  // 守備位置ごとに交代をチェック
  positions.forEach((pos) => {
  const initialId = initialAssignments[pos]; // 初期（例：代打）
  const currentId = assignments[pos];        // 現在の守備選手（控え）

if (currentId) {
  const currentIndex = updatedOrder.findIndex(entry => entry.id === currentId);
  const replacedIndex = initialId
    ? updatedOrder.findIndex(entry => entry.id === initialId)
    : updatedOrder.findIndex(entry => entry.id === null); // 空欄枠や代打だった場合

  if (replacedIndex !== -1) {
    // replacedIndex が優先 → 守備に就いた選手（currentId）を登録
    updatedOrder[replacedIndex] = {
      id: currentId,
      reason: "途中出場",
    };
    console.log(`[SET] ${pos}：打順${replacedIndex + 1} に ${currentId} を途中出場で登録`);
  } else if (currentIndex === -1) {
    // 新規参加の選手で打順にいない → 空いてる場所を探して登録
    const emptyIndex = updatedOrder.findIndex(entry => entry.id === null);
    if (emptyIndex !== -1) {
      updatedOrder[emptyIndex] = {
        id: currentId,
        reason: "途中出場",
      };
      console.log(`[NEW] ${pos}：空いてる打順${emptyIndex + 1} に ${currentId} を登録`);
    } else {
      console.warn(`[SKIP] ${pos}：${currentId} を打順に登録できる空きがありません`);
    }
  } else {
    // すでに登録済み → 出場理由だけ更新（必要なら）
    updatedOrder[currentIndex] = {
      id: currentId,
      reason: updatedOrder[currentIndex].reason === "代打"
        ? "途中出場"
        : updatedOrder[currentIndex].reason,
    };
    console.log(`[KEEP] ${pos}：${currentId} は既に登録済み（打順${currentIndex + 1}）`);
  }
}

});

// 🔄 代打された選手がその後守備に就いていない場合は打順を控えと差し替える
Object.entries(initialAssignments).forEach(([pos, initialId]) => {
  const currentId = assignments[pos];
  if (!initialId || !currentId) return;

  const wasDaida = battingOrder.find(entry => entry.id === initialId && entry.reason === "代打");
  const isInitialStillPlaying = Object.values(assignments).includes(initialId);

  if (wasDaida && !isInitialStillPlaying) {
    const index = battingOrder.findIndex(entry => entry.id === initialId);
    if (index !== -1) {
      updatedOrder[index] = {
        id: currentId,
        reason: "途中出場",
      };
      console.log(`[FIXED] 代打(${initialId}) ➡ 控え(${currentId})を打順${index + 1}に上書き`);
    }
  }
});

  // 🔽「代打」のまま残っている打順を修正（守備に入っていない場合）
  battingOrder.forEach((entry, index) => {
    const assignedPos = Object.entries(assignments).find(([_, id]) => id === entry.id);
    if (entry.reason === "代打" && !assignedPos) {
      updatedOrder[index].reason = "途中出場";
      console.log(`[FIX] 代打(${entry.id})が守備に就いていないが、控えと交代されたため「途中出場」に修正（打順${index + 1}）`);
    }
  });

// ✅ 守備に就いた代打の出場理由修正処理（🆕ここ！）
  updatedOrder.forEach((entry, index) => {
    const isDaida = entry.reason === "代打";
    const isAssigned = Object.values(assignments).includes(entry.id);
    if (isDaida && isAssigned) {
      updatedOrder[index] = {
        ...entry,
        reason: "途中出場",
      };
      console.log(`[UPDATE] 守備に就いた代打(${entry.id})を「途中出場」に修正（打順${index + 1}）`);
    }
  });


  // 🟢 保存処理（守備位置、交代、打順）
  await localForage.setItem("lineupAssignments", assignments);
  await localForage.setItem("battingReplacements", battingReplacements);
  await localForage.setItem("battingOrder", updatedOrder);

  console.log("[CONFIRM] 守備交代確定後の battingOrder:");
  console.table(updatedOrder);

  // 🔴 usedPlayerInfo の更新（退場選手記録）
  const newUsedPlayerInfo: Record<number, { fromPos: string; subId: number }> = {};
  positions.forEach((pos) => {
    const initialId = initialAssignments[pos];
    const currentId = assignments[pos];
    if (initialId && currentId && initialId !== currentId) {
      newUsedPlayerInfo[initialId] = {
        fromPos: pos,
        subId: currentId,
      };
    }
  });
  await localForage.setItem("usedPlayerInfo", newUsedPlayerInfo);
  // 🔽 ここで画面遷移
  onConfirmed?.(); // 守備画面へ遷移
  console.log("✅ onConfirmed called"); // ← これが出れば呼ばれてる
};


// 新たにアナウンス表示だけの関数を定義
const showAnnouncement = () => {
  setShowSaveModal(true);
};

  useEffect(() => {
  teamPlayers.slice(0, 9).forEach((player, index) => {
    const currentPos = getPositionName(assignments, player.id);
    const initialPos = getPositionName(initialAssignments, player.id);
    const initialPlayerId = initialAssignments[initialPos];
    const isSamePosition = currentPos === initialPos;
    const isSamePlayer = assignments[currentPos] === initialPlayerId;
    const isChanged = !(isSamePosition && isSamePlayer);

    
    const playerLabel = formatPlayerLabel(player);

   // console.log(
   //   `[${index + 1}番] ${playerLabel} | 初期=${initialPos}, 現在=${currentPos} | samePos=${isSamePosition}, samePlayer=${isSamePlayer}, 変更あり=${isChanged}`
   // );
  });
}, [assignments, initialAssignments, teamPlayers]);



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
 <img
  src="/field.jpg"
  alt="フィールド図"
  className="w-full rounded shadow pointer-events-none"
  draggable={false}
/>
  
  
  {/* 通常の描画（スタメンや通常交代） */}
{/* 通常の描画（スタメンや通常交代） */}
{positions.map((pos) => {
  const currentId = assignments[pos];
  const initialId = initialAssignments[pos];
 
  const player = currentId ? teamPlayers.find((p) => p.id === currentId) ?? null : null;

  // 出場理由の補完（battingOrder or usedPlayerInfo）
  let reason: string | undefined;
  if (currentId) {
    const battingEntry = battingOrder.find(e => e.id === currentId);
    reason = battingEntry?.reason;

    if (!reason) {
      const entry = Object.entries(usedPlayerInfo).find(
        ([, info]) => info.subId === currentId
      );
      if (entry) {
        const originalId = Number(entry[0]);
        const originalReason = battingOrder.find(e => e.id === originalId)?.reason;
        reason = originalReason;
      }
      console.warn(`[WARN] reasonが見つからない: currentId = ${currentId}`);
      console.warn("usedPlayerInfo:", usedPlayerInfo);
      console.warn("battingOrder:", battingOrder);
    }
  }

  const isChanged = currentId !== initialId;
  const isSub = reason === "代打" || reason === "代走";

  const className = `absolute text-sm font-bold px-2 py-1 rounded cursor-move 
    ${isSub ? "text-yellow-300 bg-black bg-opacity-90 ring-2 ring-yellow-400" 
            : isChanged ? "text-white bg-black bg-opacity-60 ring-2 ring-yellow-400"
                        : "text-white bg-black bg-opacity-60"}`;

  return (
  <div
      key={pos}
      
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDrop(pos, e)}
      className={className}
      style={{ ...positionStyles[pos], transform: 'translate(-50%, -50%)', zIndex: 10 }}
    >
   {player ? (
    <div
      draggable
      onDragStart={(e) => handlePositionDragStart(e, pos)}
      className="cursor-move text-base whitespace-nowrap text-center bg-black bg-opacity-60 text-white font-bold rounded px-1 py-0.5"
      style={{ minWidth: "80px" }}
    >
      {player.lastName ?? ""}{player.firstName ?? ""} #{player.number}
    </div>
  ) : (
    <span className="text-gray-300 text-base">空き</span>
  )}
    </div>
  );
})}
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

<div className="mt-8 flex flex-col lg:flex-row gap-6">
  {/* 打順一覧（左） */}
  <div className="flex-1">
    <h2 className="text-lg font-semibold mb-2">打順（1番〜9番）</h2>
    <ul className="space-y-1 text-sm border border-gray-300 p-2 rounded">
      {battingOrder.map((entry, index) => {
        const starter = teamPlayers.find((p) => p.id === entry.id);
        if (!starter) return null;

        const replaced = battingReplacements[index];
        const currentId = replaced?.id ?? entry.id;
        const currentPlayer = replaced ?? starter;

        const currentPos = getPositionName(assignments, currentId);
        const initialPos = getPositionName(initialAssignments, entry.id);

        const playerChanged = replaced && replaced.id !== entry.id;
        const positionChanged = currentPos !== initialPos;

        const isPinchHitter = entry.reason === "代打";
        const isPinchHitterReplaced = isPinchHitter && playerChanged;

        return (
          <li key={`${index}-${currentId}`} className="border px-2 py-1 rounded bg-white">
            <div className="flex items-start gap-2">
              <span className="w-8">{index + 1}番</span>
              <div>
                {isPinchHitterReplaced ? (
                  <>
                    {/* ➤ 1行目: 代打選手を打ち消し線 */}
                    <div className="line-through text-gray-500 text-sm">
                      代打 {starter.lastName}{starter.firstName} #{starter.number}
                    </div>
                    {/* ➤ 2行目: 守備に入った選手 */}
                    <div className="text-red-600 font-bold">
                      {currentPos}　{currentPlayer.lastName}{currentPlayer.firstName} #{currentPlayer.number}
                    </div>
                  </>
                ) : isPinchHitter ? (
                  <>
                    {/* 通常の代打選手 → そのまま守備 */}
                    {/* ① 1行目 : 「代打」に取り消し線・黒文字 */}
                    <div>
                      <span className="line-through">代打</span>&nbsp;
                      {starter.lastName}{starter.firstName} #{starter.number}
                    </div>

                    {/* ② 2行目 : 守備位置を赤字で字下げ表示 */}
                    <div className="pl-0 text-red-600 font-bold">
                      {currentPos}
                    </div>
                  </>
                ) : playerChanged ? (
                  <>
                    {/* スタメンから交代 */}
                    <div className="line-through text-gray-500 text-sm">
                      {initialPos}　{starter.lastName}{starter.firstName} #{starter.number}
                    </div>
                    <div className="text-red-600 font-bold">
                      {currentPos}　{currentPlayer.lastName}{currentPlayer.firstName} #{currentPlayer.number}
                    </div>
                  </>
                ) : positionChanged ? (
                  <>
                    <div className="line-through text-gray-500 text-sm">{initialPos}</div>
                    <div>
                      <span className="text-red-600 font-bold">{currentPos}</span>　{starter.lastName}{starter.firstName} #{starter.number}
                    </div>
                  </>
                ) : (
                  <div>{currentPos}　{starter.lastName}{starter.firstName} #{starter.number}</div>
                )}
              </div>
            </div>
          </li>
        );
      })}

    </ul>
  </div>

  {/* 交代内容（右） */}
  <div className="w-full lg:w-1/2">
    <h2 className="text-lg font-semibold mb-2">交代内容</h2>
    <ul className="text-sm border border-gray-300 p-3 rounded bg-white space-y-1">
      {(() => {
        const posPriority = { "投": 1, "捕": 2, "一": 3, "二": 4, "三": 5, "遊": 6, "左": 7, "中": 8, "右": 9 };

        const changes = battingOrder.map((entry, index) => {
          const starter = teamPlayers.find((p) => p.id === entry.id);
          if (!starter) return null;

          let replaced = battingReplacements[index] ?? teamPlayers.find(p => p.id === entry.id);
          const currentId = replaced?.id ?? entry.id;
          const currentPlayer = replaced ?? starter;

          const currentPos = getPositionName(assignments, currentId);
          const initialPos = getPositionName(initialAssignments, entry.id);

          const playerChanged = replaced && replaced.id !== entry.id;
          const positionChanged = currentPos !== initialPos;
          const isPinchHitter = entry.reason === "代打";
          const isPinchRunner = entry.reason === "代走";
          const isPinch = isPinchHitter || isPinchRunner;

          if (isPinchHitter && replaced && !Object.values(assignments).includes(replaced.id)) {
            return {
              key: `pinch-${index}`,
              type: 1,
              pos: "", // 代打は守備位置未定
              jsx: (
                <li key={`pinch-${index}`}>
                  代打 ➡ {replaced.lastName}{replaced.firstName} #{replaced.number}
                </li>
              )
            };
          }

if (isPinchHitter && playerChanged && currentPos) {
  const pinchPlayer = teamPlayers.find(p => p.id === entry.id);
  const replacedPlayer = replaced;

  return {
    key: `pinch-replaced-${index}`,
    type: 1,
    pos: currentPos,
    jsx: (
      <li key={`pinch-replaced-${index}`}>
        代打：{pinchPlayer?.lastName}{pinchPlayer?.firstName} #{pinchPlayer?.number} ➡ {withMark(currentPos)}：{replacedPlayer.lastName}{replacedPlayer.firstName} #{replacedPlayer.number}
      </li>
    )
  };
}

if (isPinchHitter && currentPos) {
  // 🆕 replacedが未定義でも代打選手が存在するなら補完
  if (!replaced) {
    replaced = teamPlayers.find(p => p.id === entry.id);
  }
  return {
    key: `pinch-assigned-${index}`,
    type: 1,
    pos: currentPos,
    jsx: (
      <li key={`pinch-assigned-${index}`}>
        代打：{replaced.lastName}{replaced.firstName} #{replaced.number} ➡ {withMark(currentPos)}
      </li>
    )
  };
}


          if (isPinchRunner && replaced) {
            return {
              key: `runner-${index}`,
              type: 2,
              pos: currentPos,
              jsx: (
                <li key={`runner-${index}`}>
                  代走：{replaced.lastName}{replaced.firstName} #{replaced.number} ➡ {withMark(currentPos)}
                </li>
              )
            };
          }

          if (playerChanged) {
            return {
              key: `replaced-${index}`,
              type: 3,
              pos: currentPos,
              jsx: (
                <li key={`replaced-${index}`}>
                  {withMark(initialPos)}：{starter.lastName}{starter.firstName} #{starter.number} ➡ {withMark(currentPos)}：
                  {currentPlayer.lastName}{currentPlayer.firstName} #{currentPlayer.number}
                </li>
              )
            };
          }

          if (positionChanged) {
            return {
              key: `shift-${index}`,
              type: 4,
              pos: currentPos,
              jsx: (
                <li key={`shift-${index}`}>
                  {withMark(initialPos)}：{starter.lastName}{starter.firstName} #{starter.number} ➡ {withMark(currentPos)}
                </li>
              )
            };
          }

          return null;
        }).filter(Boolean) as { key: string; type: number; pos: string; jsx: JSX.Element }[];

        // 優先順位に従ってソート
        changes.sort((a, b) => {
          if (a.type !== b.type) return a.type - b.type;
          const ap = posPriority[a.pos] ?? 99;
          const bp = posPriority[b.pos] ?? 99;
          return ap - bp;
        });

        return changes.map(c => c.jsx);
      })()}
    </ul>
  </div>
</div>



<div className="mt-8 text-center flex justify-center gap-4">
  <button
    onClick={confirmChange}
    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
  >
    交代を確定する
  </button>

  <button
    onClick={showAnnouncement}
    className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition"
  >
    アナウンス表示
  </button>
</div>

{showSaveModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
   {/* ① 高さを 90 vh に制限＋縦スクロール可 */}
   <div className="bg-white rounded p-6 max-w-md w-full text-left
                   flex flex-col max-h-[90vh] overflow-y-auto">
      <div className="flex items-center mb-4">
        <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6" />        
      </div>

{/* ✅ アナウンス文言表示（ルビ対応） */}
     {/* ② 文章部分だけも独立してスクロールできるよう flex-1 を付与 */}
     {announcementText && (
       <div className="flex-1 mt-4 px-4 py-3 border rounded bg-white overflow-y-auto">
    <div
      className="text-red-600 text-lg font-bold whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: announcementText }}
    />
  </div>
)}

      <div className="flex justify-center gap-4 mb-4">
        <button
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          onClick={handleSpeak}
        >
          音声読み上げ
        </button>
        <button
          className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
          onClick={handleStop}
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


const isTouchDevice = () => typeof window !== "undefined" && "ontouchstart" in window;
const DefenseChangeWrapped: React.FC<DefenseChangeProps> = (props) => {
  return (
    <DndProvider
      backend={isTouchDevice() ? TouchBackend : HTML5Backend}
      options={isTouchDevice() ? {
        enableTouchEvents: true,
        enableMouseEvents: true,
        touchSlop: 10,
      } : undefined}
    >
      {/* 受け取った全 prop を展開して渡す */}
      <DefenseChange {...props} />
    </DndProvider>
  );
};

export default DefenseChangeWrapped;