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

// ─────────────────────────────────────────────
// 代打/代走の“連鎖”を末端まで辿って最終subIdを返す
// （先発 -> 代打A -> 代打B -> ... 最後のBを返す）
// ─────────────────────────────────────────────
const resolveLatestSubId = (
  startId: number,
  used: Record<number, { subId?: number }>
): number => {
  let cur = used[startId]?.subId;
  const seen = new Set<number>();
  while (cur && used[cur]?.subId && !seen.has(cur)) {
    seen.add(cur);
    cur = used[cur]!.subId;
  }
  // subが無ければ startId のまま（=入替なし）
  return cur ?? used[startId]?.subId ?? startId;
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
  const handledPlayerIds = new Set<number>();   // 👈 出力済みの選手ID
  const handledPositions = new Set<string>();   // 👈 出力済みの守備位置

  const skipShiftPairs = new Set<string>();

/* ============================================================
   ✅ 特別処理：代打退場 → 控えが別守備 → 元選手がシフト
   ※ ヒットしたら即 return で通常ロジックをスキップ
============================================================= */
/* ✅ 特別処理：代打退場 → 控えが別守備 → 元選手がシフト */
const specialResult = (() => {
  for (const [idx, entry] of battingOrder.entries()) {
    // ✅ 代打・代走 両方対象にする
    if (!["代打", "代走"].includes(entry.reason)) continue;

    const pinch = teamPlayers.find(p => p.id === entry.id);
    if (!pinch) continue;

    // ✅ usedPlayerInfo から subId を元に検索（代打・代走両方）
    const pinchInfoPair = Object.entries(usedPlayerInfo)
      .find(([, info]) =>
        ["代打", "代走"].includes(info.reason) && info.subId === entry.id
      );
    if (!pinchInfoPair) continue;

    const [origStarterIdStr, pinchInfo] = pinchInfoPair;
    const origPos = pinchInfo.fromPos as keyof typeof posJP;
    const origStarterId = Number(origStarterIdStr);

    // 現在守備にいない（退場している）ことが条件
    if (Object.values(assignments).includes(entry.id)) continue;

    const movedPlayerId = assignments[origPos];
    if (!movedPlayerId || movedPlayerId === entry.id) continue;
    const movedPlayer = teamPlayers.find(p => p.id === movedPlayerId)!;

    const movedFromPos = Object.entries(initialAssignments)
      .find(([p, id]) => id === movedPlayerId)?.[0] as keyof typeof posJP;
    if (!movedFromPos || movedFromPos === origPos) continue;

    const movedToPos = origPos;

    // ✅ movedFromPos を求めた後に subIn 決定
    const subInId = assignments[movedFromPos];
    if (
      !subInId ||
      Object.values(initialAssignments).includes(subInId) ||
      subInId === entry.id
    ) continue;

    const subInPos = movedFromPos;
    const subIn = teamPlayers.find(p => p.id === subInId)!;

    console.log("✅ 特別処理：代打／代走 → 控えが別守備 → 元選手がシフト");

    const lines: string[] = [];

    // ✅ 文言を切り替える
    const reasonText = entry.reason === "代打" ? "代打致しました" : "代走に出ました";

    // 1行目：控えが別守備に入る
    lines.push(
      `先ほど${reasonText}${lastWithHonor(pinch)} に代わりまして、` +
      `${idx + 1}番に ${fullNameHonor(subIn)} が入り ${posJP[subInPos]}へ、`
    );

    // 2行目：元選手が元ポジへシフト
    lines.push(
      `${posJP[movedFromPos]}の ${lastWithHonor(movedPlayer)} が ${posJP[movedToPos]}、`
    );

    // ✅ 重複抑止：この特別処理で出した “元選手のシフト” は後続の shift 出力から除外
    skipShiftPairs.add(`${movedPlayer.id}|${movedFromPos}|${movedToPos}`);

    // ✅ 重複抑止：この特別処理で出した “控え入場(replace相当)” は後続 replace から除外
    handledPlayerIds.add(subIn.id);
    handledPositions.add(subInPos as string);

    // ✅ 代打/代走本人は通常処理に回さない
    handledIds.add(entry.id);

    // 打順行
  // 打順行は lines ではなく lineupLines に積む（あとで一括出力）
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

// ここで lineupLines に移す（重複防止つき）
lineup.forEach(l => {
  if (!lineupLines.some(x => x.order === l.order && x.text === l.txt)) {
    lineupLines.push({ order: l.order, text: l.txt });
  }
});

// ❌ 「以上に代わります。」は出さない
return lines; // ← lines には“文言（先ほど…／〜に入ります）”だけが入っている状態で return

  }
  return null;
})();

if (specialResult) {
  // 念のため：特別処理から「以上に代わります。」が来ても除去
  const filtered = specialResult.filter(l => !l.trim().endsWith("以上に代わります。"));
  result.push(...filtered);
  skipHeader = true;  // （必要なら）ヘッダー抑止
  // return しない：このまま通常の replace/mixed/shift へ続行
}




   /* =================================================================
   🆕 特別処理: 代打選手に代わって控えが同じ守備位置に入ったケースを先に処理
               const handledIds = new Set<number>();
  ==================================================================== */
  battingOrder.forEach((entry, idx) => {
    if (!["代打", "代走"].includes(entry.reason)) return;

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
    
   console.log("✅ 特別処理: 代打/代走選手に代わって控えが同じ守備位置に入ったケース");

const reasonText = entry.reason === "代打" ? "代打致しました" : "代走に出ました";
result.push(`先ほど${reasonText}${lastWithHonor(originalPlayer)} に代わりまして、${fullNameHonor(subPlayer)} がそのまま入り ${posJP[pos]}、`);
lineupLines.push({
  order: idx + 1,
  text: `${idx + 1}番 ${posJP[pos]} ${fullNameHonor(subPlayer)} 背番号 ${subPlayer.number}`,
});

// ✅ このケース“だけ”通常処理から除外（他の交代は生かす）
handledIds.add(entry.id);          // この代打/代走の本人は通常処理に流さない
handledPlayerIds.add(subPlayer.id);
handledPositions.add(pos);

// return はそのままでOK（forEachの次のループへ）
return;

  });

/* =================================================================
✅ 特化ブロック（代打 → 守備入り → 元守備選手が移動）
  ==================================================================== */
const pinchShiftLines: string[] = [];

/* =================================================================
   🆕 特別処理: 代打・代走 → 守備入り（相互入れ替え含む）まとめ処理
   ==================================================================== */
battingOrder.forEach((entry, idx) => {
  if (!["代打", "代走"].includes(entry.reason)) return;
  if (handledIds.has(entry.id)) return;

  const pinchPlayer = teamPlayers.find(p => p.id === entry.id);
  if (!pinchPlayer) return;

  const pos = Object.entries(assignments)
    .find(([_, id]) => id === entry.id)?.[0] as keyof typeof posJP;
  if (!pos) return;

  const originalId = initialAssignments[pos];
  if (!originalId || originalId === entry.id) return;

  const movedPlayer = teamPlayers.find(p => p.id === originalId);
  if (!movedPlayer) return;

  const movedToPos = Object.entries(assignments)
    .find(([k, v]) => v === originalId)?.[0] as keyof typeof posJP;
  if (!movedToPos || movedToPos === pos) return;

  // ★ 相手も代打/代走かチェック（相互入れ替え）
  const otherEntry = battingOrder.find(e =>
    e.id === movedPlayer.id && ["代打", "代走"].includes(e.reason)
  );

  if (otherEntry && !handledIds.has(movedPlayer.id)) {
    // 2人まとめて1本化
    result.push(
      `先ほど${entry.reason}致しました${lastWithHonor(pinchPlayer)}が${posJP[pos]}、`
      + `先ほど${otherEntry.reason}致しました${lastWithHonor(movedPlayer)}が${posJP[movedToPos]}に入ります。`
    );

    lineupLines.push({ order: idx + 1, text: `${idx + 1}番 ${posJP[pos]} ${lastWithHonor(pinchPlayer)}` });
    const movedOrder = battingOrder.findIndex(e => e.id === movedPlayer.id);
    if (movedOrder >= 0) {
      lineupLines.push({ order: movedOrder + 1, text: `${movedOrder + 1}番 ${posJP[movedToPos]} ${lastWithHonor(movedPlayer)}` });
    }

    skipShiftPairs.add(`${movedPlayer.id}|${pos}|${movedToPos}`);

    handledIds.add(entry.id);
    handledIds.add(movedPlayer.id);
    handledPlayerIds.add(pinchPlayer.id);
    //handledPlayerIds.add(movedPlayer.id);
    handledPositions.add(pos);
    //handledPositions.add(movedToPos);
    handledPlayerIds.add(pinchPlayer.id); // 代打/代走本人だけ
    handledPositions.add(pos);            // 本人が入った守備位置だけ
    return;
  }

  // ★ 相手が通常選手の場合は従来通り
// ★ 相手が通常選手の場合は従来通り（2行に分割 + 重複スキップ登録）
result.push(`先ほど${entry.reason}致しました${lastWithHonor(pinchPlayer)}が${posJP[pos]}、`);
result.push(`${posJP[pos]}の ${lastWithHonor(movedPlayer)} が ${posJP[movedToPos]}、`);

// 以降の shift ループで同じ「movedPlayer のシフト」を出さない
skipShiftPairs.add(`${movedPlayer.id}|${pos}|${movedToPos}`);


  lineupLines.push({ order: idx + 1, text: `${idx + 1}番 ${posJP[pos]} ${lastWithHonor(pinchPlayer)}` });
  const movedOrder = battingOrder.findIndex(e => e.id === movedPlayer.id);
  if (movedOrder >= 0) {
    lineupLines.push({ order: movedOrder + 1, text: `${movedOrder + 1}番 ${posJP[movedToPos]} ${lastWithHonor(movedPlayer)}` });
  }

  handledIds.add(entry.id);
  handledIds.add(movedPlayer.id);
  handledPlayerIds.add(pinchPlayer.id);
  //handledPlayerIds.add(movedPlayer.id);
  handledPositions.add(pos);
  //handledPositions.add(movedToPos);
  handledPlayerIds.add(pinchPlayer.id); // 代打/代走本人だけ
  handledPositions.add(pos);            // 本人が入った守備位置だけ
});


if (pinchShiftLines.length > 0) {
  result.push(...pinchShiftLines);

  // 通常の交代（replace / mixed / shift）がなければ打順行を出力
  if (replace.length === 0 && mixed.length === 0 && shift.length === 0) {
    lineupLines
      .sort((a, b) => a.order - b.order)
      .forEach((l) => result.push(l.text));
  }

  // 「以上に代わります」はあとでまとめて判定されるのでここでは入れない
  skipHeader = true;
  // return はしない！
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
  // ここでは句点を付けずに push
  result.push(pinchInSamePos[0]);
  skipHeader = true;
} else if (pinchInSamePos.length > 1) {
  // 複数行の場合も句点は付けない
  result.push(pinchInSamePos.join("、\n"));
  skipHeader = true;
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

// ✅ 特化ブロックで扱った選手・守備位置を除外
replace = replace.filter(r =>
  !handledPlayerIds.has(r.from.id) &&
  !handledPlayerIds.has(r.to.id) &&
  !handledPositions.has(r.pos)
);

replace.forEach((r) => {
  const line = `${posJP[r.pos]} ${lastWithHonor(r.from)} に代わりまして、${fullNameHonor(r.to)}`;
  replaceLines.push(line);

  // ✅ 処理済み記録に追加
  handledPlayerIds.add(r.from.id);
  handledPlayerIds.add(r.to.id);
  handledPositions.add(r.pos);

  // ✅ lineupLines 重複防止付き追加
  if (!lineupLines.some(l =>
    l.order === r.order &&
    l.text.includes(posJP[r.pos]) &&
    l.text.includes(fullNameHonor(r.to))
  )) {
    lineupLines.push({
      order: r.order,
      text: `${r.order}番 ${posJP[r.pos]} ${fullNameHonor(r.to)} 背番号 ${r.to.number}`
    });
  }
});

// ✅ アナウンス出力
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
  // ✅ 重複防止：選手IDと「移動先」だけを見る（移動元は塞がない）
  if (
    handledPlayerIds.has(r.from.id) ||
    handledPlayerIds.has(r.to.id)   ||
    /* handledPositions.has(r.fromPos) || ← これを外す */
    handledPositions.has(r.toPos)
  ) return;

  // ✅ アナウンス文作成
  addReplaceLine(
    `${posJP[r.fromPos]}の ${lastWithHonor(r.from)} に代わりまして、${r.order}番に ${fullNameHonor(r.to)} が入り ${posJP[r.toPos]}へ`,
    i === mixed.length - 1 && shift.length === 0
  );

  // ✅ lineupLines（重複防止付き）
  if (!lineupLines.some(l =>
    l.order === r.order &&
    l.text.includes(posJP[r.toPos]) &&
    l.text.includes(fullNameHonor(r.to))
  )) {
    lineupLines.push({
      order: r.order,
      text: `${r.order}番 ${posJP[r.toPos]} ${fullNameHonor(r.to)} 背番号 ${r.to.number}`
    });
  }

  // ✅ 処理済みフラグ：選手IDは両方、ポジションは「移動先」だけ
  handledPlayerIds.add(r.from.id);
  handledPlayerIds.add(r.to.id);
  /* handledPositions.add(r.fromPos); ← これを削除 */
  handledPositions.add(r.toPos);
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

    chains.push(chain);
  });

  return chains;
};

// ✅ 実行して sortedShift を作る
const sortedShift = buildShiftChain(shift).flat();

sortedShift.forEach((s, i) => {
    // ▼ 特別処理で出したシフトはここでスキップ
  const dupKey = `${s.player.id}|${s.fromPos}|${s.toPos}`;
  if (skipShiftPairs.has(dupKey)) return;

  // ✅ すでに処理済みならスキップ
  if (
    handledPlayerIds.has(s.player.id)
    // fromPos はスキップ条件から外す（2人目以降も表示させるため）
    // handledPositions.has(s.fromPos) ||  ← コメントアウト
    || handledPositions.has(s.toPos) // 移動先だけ重複防止
  ) return;

  const h = s.player.isFemale ? "さん" : "くん";
  const head = posJP[s.fromPos];
  const tail = posJP[s.toPos];
  const ends = "、";

  result.push(`${head}の ${lastRuby(s.player)}${h} が ${tail} ${ends}`);

  // ✅ lineupLines の重複防止付き追加
  if (!lineupLines.some(l =>
    l.order === s.order &&
    l.text.includes(tail) &&
    l.text.includes(lastRuby(s.player))
  )) {
    lineupLines.push({
      order: s.order,
      text: `${s.order}番 ${tail} ${lastRuby(s.player)}${h}`
    });
  }

  // ✅ この選手・ポジションを今後の処理から除外
  handledPlayerIds.add(s.player.id);
  // handledPositions.add(s.fromPos); ← これも外す
  handledPositions.add(s.toPos);
});

// ==== 本文終端の統一：最後の1本だけ「が入ります。」にする ====
// ==== 本文終端の統一：最後の1本だけを「正しい日本語」で閉じる ====
// ・末尾が「…が ポジション、」なら「…が ポジション に入ります。」
// ・末尾が「…へ、」/「…に、」なら「…へ入ります。」/「…に入ります。」
// ・それ以外で「、」なら「 が入ります。」を付与
for (let i = result.length - 1; i >= 0; i--) {
  const line = result[i].trim();

  // 打順や「以上に代わります。」は対象外
  if (/^\d+番 /.test(line)) continue;
  if (line.endsWith("以上に代わります。")) continue;

  // 👇 追加：代打そのまま守備入り（pinchInSamePos）の場合は対象外
  if (/そのまま入り/.test(line) && !/へ$/.test(line) && !/に$/.test(line)) {
    break; // 何も付けずに終了
  }

  const posPattern = /(が)\s*(ピッチャー|キャッチャー|ファースト|セカンド|サード|ショート|レフト|センター|ライト)\s*[、。]?$/;
  if (posPattern.test(line)) {
    result[i] = line.replace(posPattern, (_m, ga, pos) => `${ga} ${pos} に入ります。`);
    break;
  }

  if (/[へに]\s*、?$/.test(line)) {
    result[i] = line.replace(/([へに])\s*、?$/, "$1入ります。");
    break;
  }

  if (line.endsWith("に入ります。") || line.endsWith("が入ります。")) {
    break;
  }

  if (line.endsWith("、")) {
    result[i] = line.slice(0, -1) + " が入ります。";
  } else {
    result[i] = line + " が入ります。";
  }
  break;
}




/* ---- 打順行を最後にまとめて追加 ---- */
const already = new Set(result); // 既に出した行を記録
lineupLines
  .sort((a, b) => a.order - b.order)
  .forEach(l => {
    if (!already.has(l.text)) {
      result.push(l.text);
      already.add(l.text);
    }
  });

  /* ---- 「以上に代わります。」判定 ---- */
  const total = replace.length + shift.length + mixed.length;
  if ((total >= 2) || (lineupLines.length >= 2)) {
    result.push("以上に代わります。");
  }

  // ▼ 最初の「以上に代わります。」以降は出さない（特別処理が先に出していてもOK）
  const endAt = result.findIndex(l => l.trim().endsWith("以上に代わります。"));
  if (endAt !== -1) {
    return result.slice(0, endAt + 1).join("\n");
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

const formatLog = (pos: string, player?: Player | null): string => {
  const posFull: Record<string, string> = {
    "投": "ピッチャー",
    "捕": "キャッチャー",
    "一": "ファースト",
    "二": "セカンド",
    "三": "サード",
    "遊": "ショート",
    "左": "レフト",
    "中": "センター",
    "右": "ライト",
    [BENCH]: "控え",
  };
  const label = posFull[pos] ?? pos; // マッチしなければそのまま
  return `${label}：${formatPlayerLabel(player)}`;
};

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
  // 元の選手A -> 許可される相手B（確定まで有効）
  const [pairLocks, setPairLocks] = useState<Record<number, number>>({});
  // 先発（画面オープン時にフィールドにいた）かどうか
  const isStarter = (playerId?: number | null) =>
    playerId != null && Object.values(initialAssignments || {}).includes(playerId);


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

// ⚠️ "代打" or "代走" 選手がいれば initialAssignments にも反映（末端まで辿る）
const updatedAssignments = { ...assignments };
Object.entries(usedPlayerInfo).forEach(([originalIdStr, info]) => {
  const { fromPos, reason } = info;
  if (!(reason === "代打" || reason === "代走")) return;
  if (!(fromPos in updatedAssignments)) return;

  const latest = resolveLatestSubId(Number(originalIdStr), usedPlayerInfo);
  if (latest) {
    // 念のため "ファースト" などが来ても略号に寄せてから反映
    const sym = (posNameToSymbol as any)[fromPos] ?? fromPos;
    updatedAssignments[sym] = latest;
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


// ✅ 代打・代走の割り当て（“連鎖”の末端まで辿る）
for (const [originalIdStr, info] of Object.entries(usedInfo)) {
  const { fromPos, reason } = info;
  if (!(reason === "代打" || reason === "代走")) continue;

  const sym = posNameToSymbol[fromPos ?? ""] ?? fromPos ?? "";
  if (!sym) continue;

  const latest = resolveLatestSubId(Number(originalIdStr), usedInfo);
  if (latest) {
    newAssignments[sym] = latest;
    console.log(`[DEBUG] 代打/代走(最終) ${latest} を ${sym} に配置`);
    // 以降の既存コード（updatedTeamPlayers に仮追加する処理など）は残してOK
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
// フル表記（丸数字 + フル名）で表示する
const withFull = (pos: string) => {
  const full = defensePositionMap[pos] ?? pos; // 例: "捕" -> "キャッチャー"
  const mark = posNum[pos] ?? "";              // 例: "捕" -> "②"
  return `${mark}${full}`;                     // 例: "②キャッチャー"
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

// iOS Safari の transform 原点ズレ対策用 dragImage ゴースト作成
const makeDragGhost = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.style.position = "fixed";
  ghost.style.top = `${rect.top}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.opacity = "0";           // 見えない
  ghost.style.pointerEvents = "none";
  ghost.style.transform = "none";      // 親の transform の影響を受けない
  document.body.appendChild(ghost);
  return { ghost, rect };
};

// ② 既存の handlePositionDragStart を差し替え
const handlePositionDragStart = (
  e: React.DragEvent<HTMLDivElement>,
  pos: string
) => {
  e.dataTransfer.setData("fromPos", pos);
  e.dataTransfer.effectAllowed = "move";
  setDraggingFrom(pos);

  // ★ ゴースト指定：掴んだ内側のプレイヤー要素を dragImage に
  const target = e.currentTarget.querySelector<HTMLElement>("div[draggable='true']") || (e.currentTarget as HTMLElement);
  const { ghost, rect } = makeDragGhost(target);

  // 画像の基準位置を中央付近に固定（右端でもズレない）
  e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);

  // cleanup は dragend で
  const onEnd = () => {
    ghost.remove();
    e.currentTarget.removeEventListener("dragend", onEnd as any);
  };
  e.currentTarget.addEventListener("dragend", onEnd as any);
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

// ▼ A(先発)にしかロックは効かせない
if (fromId != null && isStarter(fromId)) {
  const expected = pairLocks[fromId];
  if (expected != null && toId !== expected) {
    window.alert("この元の選手は、最初に交代した相手以外とは交代できません。");
    return prev;
  }
}
if (toId != null && isStarter(toId)) {
  const expected = pairLocks[toId];
  if (expected != null && fromId !== expected) {
    window.alert("この元の選手は、最初に交代した相手以外とは交代できません。");
    return prev;
  }
}


      // 🔒 どちらかの位置が空なら交代不可（控え扱いなので）
      if (fromId === null || toId === null) return prev;

      const newAssignments = { ...prev };
      newAssignments[draggingFrom] = toId;
      newAssignments[toPos] = fromId;

      // ✅ フィールド同士の A↔B 戻しが成立したら解除
  if (fromId != null && pairLocks[fromId] === toId ||
      toId   != null && pairLocks[toId]   === fromId) {
    setPairLocks((m) => {
      const copy = { ...m };
      // A側のロック解除
      if (fromId != null) delete copy[fromId];
      if (toId   != null) delete copy[toId];
      // 念のため：どこかのAが partner=B を参照していたら全消し
      for (const [aStr, partner] of Object.entries({ ...copy })) {
        if (partner === fromId || partner === toId) delete copy[Number(aStr)];
      }
      return copy;
    });
  }

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

  // === 追加：Aの位置へCを入れた瞬間、Aのロック相手をB→Cに付け替える ===
// toPos が「Aの元ポジ」かどうかを initialAssignments で判定
  const aIdAtThisPos = initialAssignments[toPos]; // ← A（元）のID（なければ undefined/ null）

  // 直前までその位置にいたのが B（= replacedId）で、A のロック相手が B になっているなら…
  if (aIdAtThisPos != null && pairLocks[aIdAtThisPos] === replacedId) {
    // A は今後 C としか入れ替え不可に変更（= B のロックは破棄）
    setPairLocks((m) => ({ ...m, [aIdAtThisPos]: playerId }));
  }


// ====== 置き換え：A↔Bペア制約（bench→守備） ======
// ここでは「ベンチから落とす選手が A 本人かどうか」で判断する
// ・A を落とす→ その場所にいるのが B 以外なら拒否
// ・A 以外（Cなど）を落とす→ 制約なし（許可）
const lockPartner = pairLocks[playerId /* ← A かもしれない */];

// (A本人) A にロックがあるのに、そこ（toPos）にいるのが B ではない → 拒否
if (lockPartner != null && replacedId !== lockPartner) {
  window.alert("この元の選手は、最初に交代した相手の位置にしか戻せません。");
  return prev;
}

// (新規作成) A→B の最初の交代が「いま成立」するならロック作成
// ＝ 守備位置に A（元）が居て、ベンチから B を入れる瞬間
if (replacedId != null && pairLocks[replacedId] == null) {
  // replacedId = A, playerId = B
  setPairLocks((m) => ({ ...m, [replacedId]: playerId }));
}

  newAssignments[toPos] = playerId;

    // ★ 戻し成立（Aを元ポジに戻した）なら、控えに下がったBを完全フリー化
  //   条件：この toPos の「元の先発」が A（= playerId）で、今いたのが B（= replcedId）
  if (initialAssignments[toPos] === playerId && replacedId != null) {
    setPairLocks((m) => {
      const copy = { ...m };
      // B をキーにしたロックが万一残っていても消す
      delete copy[replacedId];
      // A→B のように B を相手にしているロックも全て掃除
      for (const [aStr, partner] of Object.entries({ ...copy })) {
        if (partner === replacedId) delete copy[Number(aStr)];
      }
      return copy;
    });
  }

  // ✅ “B を A の位置へ落として戻した”場合でもロック解除（対称パターン）
if (replacedId != null && pairLocks[replacedId] === playerId) {
  // replacedId = A, playerId = B
  setPairLocks((m) => {
    const copy = { ...m };
    delete copy[replacedId]; // A のロック解除
    return copy;
  });
}


// ✅ A↔B の戻しが成立したら、その場でロック解除
if (pairLocks[playerId] != null && replacedId === pairLocks[playerId]) {
  // playerId = A を B の場所に落とした
  setPairLocks((m) => {
    const copy = { ...m };
    delete copy[playerId]; // A のロック解除
    return copy;
  });
}

// 🟡 元いた選手を控えに戻す（重複防止）
if (replacedId) {
  setBenchPlayers((prev) => {
    if (prev.some((p) => p.id === replacedId)) return prev;
    const replacedPlayer = teamPlayers.find((p) => p.id === replacedId);
    if (!replacedPlayer) return prev;
    return [...prev, replacedPlayer];
  });
}
if (replacedId != null) {
  setPairLocks((m) => {
    let changed = false;
    const copy = { ...m };
    for (const [aStr, partner] of Object.entries(copy)) {
      if (partner === replacedId) {
        delete copy[Number(aStr)]; // A のロック解除
        changed = true;
      }
    }
    return changed ? copy : m;
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
// 🔄 交代取り消しのチェック（最小限の更新：既存の置換はフィールドに居る限り維持）
setBattingReplacements((prev) => {
  const rebuilt: { [idx: number]: Player } = { ...prev };

  // 1) 既存の置換は、その選手がフィールドに“まだ居るなら”維持
  const onFieldIds = new Set(Object.values(newAssignments).filter((v): v is number => typeof v === "number"));
  for (const [idxStr, p] of Object.entries(prev)) {
    const idx = Number(idxStr);
    if (onFieldIds.has(p.id)) {
      rebuilt[idx] = p; // 維持
    } else {
      delete rebuilt[idx]; // 退場してたら削除
    }
  }

  // 2) 今回の操作で影響した“元の先発の打順”だけ再評価して更新
  //    toPos に元々いた選手（= replacedId）の打順を特定し、その枠だけ更新する
  //    ※ 上の処理で targetIndex を算出しているなら、それを使ってもOK
  const affectedStarterIndex = battingOrder.findIndex((starter) => {
    const starterPos = getPositionName(initialAssignments, starter.id);
    return starterPos === toPos; // toPos の元先発の打順
  });

  if (affectedStarterIndex !== -1) {
    const starter = battingOrder[affectedStarterIndex];
    const starterPos = getPositionName(initialAssignments, starter.id);
    const assignedId = newAssignments[starterPos];

    const starterStillOnField = onFieldIds.has(starter.id);
    const isAssignedStarter =
      typeof assignedId === "number" && battingOrder.some((e) => e.id === assignedId);

    if (
      assignedId &&
      assignedId !== starter.id &&
      !isAssignedStarter &&
      !starterStillOnField
    ) {
      const p = teamPlayers.find((pl) => pl.id === assignedId);
      if (p) rebuilt[affectedStarterIndex] = p; // 置換として登録/更新
    } else {
      delete rebuilt[affectedStarterIndex]; // 置換条件を満たさないなら削除
    }
  }

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

  setPairLocks({});  // 画面を閉じるタイミングでロック全消去（次回はリセット）
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

<div className="flex items-center mb-2">
  <h2 className="text-lg font-semibold">控え選手</h2>
  <span className="ml-2 text-red-600 text-sm inline-flex items-center whitespace-nowrap">
    ⚠️ 交代する選手にドロップ
  </span>
</div>
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
        const isPinchRunner = entry.reason === "代走";
        const isPinch = isPinchHitter || isPinchRunner;
        const pinchLabel = isPinchHitter ? "代打" : isPinchRunner ? "代走" : "";
        const isPinchReplaced = isPinch && playerChanged;
        const isPinchHitterReplaced = isPinchHitter && playerChanged;

        return (
          <li key={`${index}-${currentId}`} className="border px-2 py-1 rounded bg-white">
            <div className="flex items-start gap-2">
              <span className="w-8">{index + 1}番</span>
              <div>
                {isPinchReplaced ? (
                  <>
                    {/* ➤ 1行目: 代打/代走選手を打ち消し線 */}
                    <div className="line-through text-gray-500 text-sm">
                      {pinchLabel} {starter.lastName}{starter.firstName} #{starter.number}
                    </div>
                    {/* ➤ 2行目: 守備に入った選手 */}
                    <div className="text-red-600 font-bold">
                      {currentPos}　{currentPlayer.lastName}{currentPlayer.firstName} #{currentPlayer.number}
                    </div>
                  </>
                ) : isPinch ? (
                  <>
                    {/* 通常の代打/代走 → そのまま守備 */}
                    {/* ① 1行目 : 「代打/代走」に取り消し線 */}
                    <div>
                      <span className="line-through">{pinchLabel}</span>&nbsp;
                      {starter.lastName}{starter.firstName} #{starter.number}
                    </div>
                    {/* ② 2行目 : 守備位置を赤字で表示 */}
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
        代打：{pinchPlayer?.lastName}{pinchPlayer?.firstName} #{pinchPlayer?.number} ➡ {withFull(currentPos)}：{replacedPlayer.lastName}{replacedPlayer.firstName} #{replacedPlayer.number}
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
        代打：{replaced.lastName}{replaced.firstName} #{replaced.number} ➡ {withFull(currentPos)}
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
                  代走：{replaced.lastName}{replaced.firstName} #{replaced.number} ➡ {withFull(currentPos)}
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
                  {withFull(initialPos)}：{starter.lastName}{starter.firstName} #{starter.number} ➡ {withFull(currentPos)}：
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
                  {withFull(initialPos)}：{starter.lastName}{starter.firstName} #{starter.number} ➡ {withFull(currentPos)}
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