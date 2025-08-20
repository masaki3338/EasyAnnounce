import React, { useEffect, useState, useRef } from "react";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { useDrag } from "react-dnd";



import localForage from "localforage";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react"; //

let ChangeFlg = 0; // 初期値

const getPlayerById = (players: Player[], id: number | null): Player | undefined => {
  if (id == null) return undefined;
  return players.find((p) => p.id === id);
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
  指名打者: "指",
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
    三: "サード",   遊: "ショート",     左: "レフト",   中: "センター",  右: "ライト",   指: "指名打者", 
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
  let reentryOccurred = false; // 🆕 このターンでリエントリー文を出したか
  const handledPlayerIds = new Set<number>();   // 👈 出力済みの選手ID
  const handledPositions = new Set<string>();   // 👈 出力済みの守備位置

  const skipShiftPairs = new Set<string>();


  let suppressTailClose = false; // 🆕 このターンは末尾に「に入ります。」を付けない
  // 🆕 リエントリー + 守備変更（ユーザー希望フォーマット）
Object.entries(usedPlayerInfo || {}).forEach(([origIdStr, info]) => {
  if (!info || (info.reason !== "代打" && info.reason !== "代走")) return;

  const origId = Number(origIdStr);          // B（元スタメン）
  // ★ Bが“今”入っている守備（略号）を探す（同守備/別守備の両対応）
  const posNowSym = Object.entries(assignments).find(([k, v]) => v === origId)?.[0];
  if (!posNowSym) return; // Bがフィールドに居ない → リエントリー未成立

  const B = teamPlayers.find(p => p.id === origId);
  const A = teamPlayers.find(p => p.id === info.subId);
  if (!A || !B) return;

  const posFull = posJP[posNowSym as keyof typeof posJP];
  const reasonText = info.reason === "代走" ? "代走" : "代打";

  // 1行目：希望フォーマット（句点なし）
// ← ここから（新しい塊に置換してOK）
{
  // ★ 元スタメンB（origId）が “今” 入っている守備
  const posNowSym2 = Object.entries(assignments).find(([k, v]) => v === origId)?.[0];
  if (!posNowSym2) return;

  const B2 = teamPlayers.find(p => p.id === origId);
  const A2 = teamPlayers.find(p => p.id === info.subId);
  if (!A2 || !B2) return;

  const posFull2 = posJP[posNowSym2 as keyof typeof posJP];

  // ★ 今回 B が実際に誰（C）から交代して入ったか
  const replacedRec = replace.find(r => r.pos === posNowSym2 && r.to.id === B2.id);
  const replaced = replacedRec?.from ?? null;

  // ★ 文言：C がいれば C を相手に、無ければ従来どおり A を相手にする
  let firstLine: string;
  if (replaced && replaced.id !== A2.id) {
    firstLine = `${lastWithHonor(replaced)} に代わりまして、${lastWithHonor(B2)} がリエントリーで ${posFull2}、`;
  } else {
    const reasonText = info.reason === "代走" ? "代走" : "代打";
    firstLine = `先ほど${reasonText}致しました${lastWithHonor(A2)} に代わりまして、${lastWithHonor(B2)} がリエントリーで ${posFull2}、`;
  }
  result.push(firstLine);
}
// ← ここまで



  // 2行目：Bが入った位置から“どこへ動いたか”のシフトを拾う（あれば）
  const move = shift.find(s => s.fromPos === posNowSym);
  if (move) {
    result.push(`${posFull}の ${lastWithHonor(move.player)}が ${posJP[move.toPos]}、`);
    skipShiftPairs.add(`${move.player.id}|${move.fromPos}|${move.toPos}`);
  }

  // 打順行（苗字＋敬称／番号なし）
  const orderB = battingOrder.findIndex(e => e.id === B.id) + 1;
  if (orderB > 0 && !lineupLines.some(l => l.order === orderB && l.text.includes(posFull))) {
    lineupLines.push({ order: orderB, text: `${orderB}番 ${posFull} ${lastWithHonor(B)}` });
  }
  if (move) {
    const orderM = battingOrder.findIndex(e => e.id === move.player.id) + 1;
    if (orderM > 0 && !lineupLines.some(l => l.order === orderM && l.text.includes(posJP[move.toPos]))) {
      lineupLines.push({ order: orderM, text: `${orderM}番 ${posJP[move.toPos]} ${lastWithHonor(move.player)}` });
    }
  }

  // 後続の通常出力に載らないように最低限ブロック
  handledPlayerIds.add(B.id);
  handledPositions.add(posNowSym);

reentryOccurred = true; // 🆕 リエントリーを出した回であることを記録
  suppressTailClose = true;
});


  // ▼ リエントリー対象（＝代打/代走で一度退いた元のスタメンが、自分の元ポジに戻ってきた）
  const reentryToIds = new Set<number>();
  Object.entries(usedPlayerInfo || {}).forEach(([origIdStr, info]) => {
    if (info && (info.reason === "代打" || info.reason === "代走")) {
      // 元いた守備の記号に正規化（"サード" → "三" など）
      const sym = (posNameToSymbol as any)[info.fromPos] ?? info.fromPos;
      const origId = Number(origIdStr);
      if (assignments[sym] === origId) {
        reentryToIds.add(origId);
      }
    }
  });

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
  const origPosName = pinchInfo.fromPos as keyof typeof posJP;
const origPosSym  = (posNameToSymbol as any)[origPosName] ?? origPosName;
const origStarterId = Number(origStarterIdStr);

// 🛑 B（元先発）が“どこかの守備に戻っている”＝リエントリー成立 → 特別処理は使わない
const isBOnField = Object.values(assignments).includes(origStarterId);
if (isBOnField) continue;



    // 現在守備にいない（退場している）ことが条件
    if (Object.values(assignments).includes(entry.id)) continue;

    const movedPlayerId = assignments[origPosSym];
    if (!movedPlayerId || movedPlayerId === entry.id) continue;
    const movedPlayer = teamPlayers.find(p => p.id === movedPlayerId)!;

    const movedFromPos = Object.entries(initialAssignments)
      .find(([p, id]) => id === movedPlayerId)?.[0] as keyof typeof posJP;
    if (!movedFromPos || movedFromPos === origPosSym) continue;

    const movedToPos = origPosSym;

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
     // 🛑 リエントリーで既に出力済み（同じ選手 or 同じ守備）なら、この特別行は出さない
    if (handledPlayerIds.has(subPlayer.id) || handledPositions.has(pos)) return;


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
type PinchLine = { reason: "代打" | "代走"; text: string };
const pinchInSamePos: PinchLine[] = [];

battingOrder.forEach((entry, idx) => {
  const player = teamPlayers.find(p => p.id === entry.id);
  if (!player) return;

  const pos = Object.entries(assignments).find(([_, id]) => id === entry.id)?.[0] as keyof typeof posJP | undefined;
  if (!pos) return;

  const wasReplaced = !!usedPlayerInfo[entry.id];
  const unchanged   = initialAssignments[pos] === entry.id;

  if ((entry.reason === "代打" || entry.reason === "代走") && !wasReplaced && unchanged) {
    const honor = player.isFemale ? "さん" : "くん";
    const ruby = `<ruby>${player.lastName}<rt>${player.lastNameKana ?? ""}</rt></ruby>${honor}`;

    // 直前の行と理由（代打/代走）が同じなら「同じく先ほど」
    // 違うなら毎回「先ほど」
    const prev = pinchInSamePos[pinchInSamePos.length - 1];
    const sameReason = prev ? prev.reason === entry.reason : false;
    const head = pinchInSamePos.length === 0 ? "先ほど" : (sameReason ? "同じく先ほど" : "先ほど");

    pinchInSamePos.push({
      reason: (entry.reason === "代打" ? "代打" : "代走"),
      text: `${head}${entry.reason}致しました${ruby} がそのまま入り ${posJP[pos]}`
    });

    // 打順行は従来どおり
    lineupLines.push({
      order: idx + 1,
      text : `${idx + 1}番 ${posJP[pos]} ${ruby} 背番号 ${player.number}`
    });    
  }
});

const pinchTexts = pinchInSamePos.map(p => p.text);
if (pinchTexts.length === 1) {
  result.push(pinchTexts[0]);
  skipHeader = true;
} else if (pinchTexts.length > 1) {
  result.push(pinchTexts.join("、\n"));
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
/* ---- ヘッダー ---- */
// ✅ リエントリーが1つでもあれば、最初に「選手の交代」を必ず付ける。
//    それ以外（通常のみ）のときは従来ルールのまま。
if (!skipHeader) {
  if (reentryOccurred) {
    // 先頭に差し込む（この時点で result には既にリエントリー行が入っている想定）
    result.unshift(`${teamName}、選手の交代をお知らせいたします。`);
  } else if (result.length === 0) {
    if (hasMixed || (hasReplace && hasShift)) {
      result.push(`${teamName}、選手の交代並びにシートの変更をお知らせいたします。`);
    } else if (hasReplace) {
      result.push(`${teamName}、選手の交代をお知らせいたします。`);
    } else if (hasShift) {
      result.push(`${teamName}、シートの変更をお知らせいたします。`);
    }
  }
}


/* ---- 並べ替え：守備位置番号順に ---- */
const nextPosMap: Record<string, string> = { 二: "中", 中: "左", 左: "遊", 遊: "右" };

// 守備位置の表示順序（昇順）
const posOrder = ["投", "捕", "一", "二", "三", "遊", "左", "中", "右", "指"];
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
if (r.order > 0 && !lineupLines.some(l =>
  l.order === r.order &&
  l.text.includes(posJP[r.pos])
)) {
  const isReentryTo = reentryToIds.has(r.to.id);
  lineupLines.push({
    order: r.order,
    text: isReentryTo
      ? `${r.order}番 ${posJP[r.pos]} ${lastWithHonor(r.to)}`
      : `${r.order}番 ${posJP[r.pos]} ${fullNameHonor(r.to)} 背番号 ${r.to.number}`
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
// 既存 if (...) { lineupLines.push(...) } の直前～直後を以下に置換
if (
  r.order > 0 &&
  !lineupLines.some(l => l.order === r.order && l.text.includes(posJP[r.toPos]))
) {
  // ── 追加: DH運用中の「投⇄捕」入替は打順欄には積まない（守備欄だけに出す）
  const dhActive = !!assignments?.["指"];
  const isPitcherCatcherSwap =
    dhActive &&
    ((r.fromPos === "投" && r.toPos === "捕") || (r.fromPos === "捕" && r.toPos === "投"));

  if (!isPitcherCatcherSwap) {
    const isReentryTo = reentryToIds.has(r.to.id);
    lineupLines.push({
      order: r.order,
      text: isReentryTo
        ? `${r.order}番 ${posJP[r.toPos]} ${lastWithHonor(r.to)}`
        : `${r.order}番 ${posJP[r.toPos]} ${fullNameHonor(r.to)} 背番号 ${r.to.number}`
    });
  }
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
if (
  !lineupLines.some(l =>
    l.order === s.order && l.text.includes(tail) && l.text.includes(lastRuby(s.player))
  )
) {
  // ── 追加: DH運用中の「投⇄捕」入替は打順欄には積まない（守備欄だけに出す）
  const dhActive = !!assignments?.["指"];
  const isPitcherCatcherSwap =
    dhActive &&
    ((s.fromPos === "投" && s.toPos === "捕") || (s.fromPos === "捕" && s.toPos === "投"));

  if (!isPitcherCatcherSwap) {
    lineupLines.push({
      order: s.order,
      text: `${s.order}番 ${tail} ${lastRuby(s.player)}${h}`
    });
  }
}


  // ✅ この選手・ポジションを今後の処理から除外
  handledPlayerIds.add(s.player.id);
  // handledPositions.add(s.fromPos); ← これも外す
  handledPositions.add(s.toPos);
});

// 🆕 交代が「本文として1行だけ」なら、必ず「に入ります。」で閉じる（リエントリーでも）
{
  const bodyLines = result.filter((ln) => {
    const t = ln.trim();
    if (/^\d+番 /.test(t)) return false;                 // 打順行は除外
    if (t.endsWith("以上に代わります。")) return false; // しめの行は除外
    if (/お知らせいたします。$/.test(t)) return false;  // ヘッダーは除外
    return true;
  });
  if (bodyLines.length === 1) {
    // リエントリー処理で suppressTailClose=true にされていても解除する
    suppressTailClose = false;
  }
}

// ==== 本文終端の統一：最後の1本だけ「が入ります。」にする ====
// ==== 本文終端の統一：最後の1本だけを「正しい日本語」で閉じる ====
// ・末尾が「…が ポジション、」なら「…が ポジション に入ります。」
// ・末尾が「…へ、」/「…に、」なら「…へ入ります。」/「…に入ります。」
// ・それ以外で「、」なら「 が入ります。」を付与
// ==== 本文終端の統一：最後の1本だけを「正しい日本語」で閉じる ====
// ・「…が入り ポジション（へ|に）?」 → 「…が入り ポジション。」
if (!suppressTailClose) {
  for (let i = result.length - 1; i >= 0; i--) {
    const line = result[i].trim();

    // 打順行／「以上に代わります。」は対象外
    if (/^\d+番 /.test(line)) continue;
    if (line.endsWith("以上に代わります。")) continue;

    // 代打そのまま守備入りは変更しない
    if (/そのまま入り/.test(line) && !/[へに]$/.test(line)) break;

    // ★ NEW: 「…が入り ポジション（へ|に）?」 → 「…が入り ポジション。」
    const gaIriPos =
      /(が\s*入り)\s*(ピッチャー|キャッチャー|ファースト|セカンド|サード|ショート|レフト|センター|ライト)\s*(?:へ|に)?\s*[、。]?$/;
    if (gaIriPos.test(line)) {
      result[i] = line.replace(gaIriPos, (_m, head, pos) => `${head} ${pos}。`);
      break;
    }

    // （必要に応じて）リエントリー行など他パターンの終端調整が続く場合はここに保持

    // 末尾が読点のみなら安全に閉じる
    if (line.endsWith("、")) {
      result[i] = line.slice(0, -1) + "。";
      break;
    }
    // 何も句点が無い場合だけ句点を足す
    if (!/[。]$/.test(line)) {
      result[i] = line + "。";
      break;
    }
    break;
  }
}




/* ---- 打順行を最後にまとめて追加 ---- */
const already = new Set(result);

lineupLines
  .filter(l => l.order > 0)       // ★ 0番は表示しない
  .sort((a, b) => a.order - b.order)
  .forEach((l) => {
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
  指: { top: "88%", left: "82%" },
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
  
  // ---- ここから: モーダル読み上げ用（DefenseChange 内） ----
const modalTextRef = useRef<HTMLDivElement | null>(null);

// 置き換え版：漢字+ルビの重複は rt だけ読む／それ以外は通常テキストを読む
const speakVisibleAnnouncement = () => {
  const root = modalTextRef.current;
  if (!root) return;

  const toReadable = (node: Node): string => {
    // ① プレーン文字はそのまま
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || "";
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      // ② <ruby> は <rt> だけを抽出（漢字側は読まない）
      if (tag === "ruby") {
        const rts = el.getElementsByTagName("rt");
        if (rts.length > 0) {
          let s = "";
          for (const rt of Array.from(rts)) s += rt.textContent || "";
          return s;
        }
        // 万一 rt が無ければ中身をそのまま
        return el.textContent || "";
      }

      // ③ <rt> / <rp> は <ruby>で処理するので個別には読まない
      if (tag === "rt" || tag === "rp") return "";

      // ④ 改行タグは改行として扱い（後で句点に正規化）
      if (tag === "br") return "\n";

      // ⑤ それ以外は子孫を順に読む
      let acc = "";
      el.childNodes.forEach((child) => { acc += toReadable(child); });
      return acc;
    }
    return "";
  };

  // モーダル内の“見えているHTML”を変換
  let text = toReadable(root);

  // 正規化処理（追加）
  text = text
    .replace(/に入ります/g, "にはいります")
    .replace(/へ入ります/g, "へはいります")
    .replace(/が\s*入り/g, "がはいり")
    .replace(/へ\s*入り/g, "へはいり")
    .replace(/に\s*入り/g, "にはいり")
    .replace(/そのまま\s*入り/g, "そのままはいり")
    .replace(/に入ります/g, "にはいります")
    .replace(/へ入ります/g, "へはいります");
    speechSynthesis.cancel();
    
  // 軽い整形：連続空白/改行→読みやすい形に
  text = text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "。")
    .replace(/。。+/g, "。")
    .trim();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;
  speechSynthesis.speak(u);
};


  const stopSpeaking  = () => speechSynthesis.cancel();
  const pauseSpeaking = () => speechSynthesis.pause();
  const resumeSpeaking = () => speechSynthesis.resume();
  // ---- ここまで ----

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
  const [dhEnabledAtStart, setDhEnabledAtStart] = useState<boolean>(false);
  // DH解除を確定時にまとめて適用するための保留フラグ
  const [pendingDisableDH, setPendingDisableDH] = useState(false);
  const [dhDisableDirty, setDhDisableDirty] = useState(false);
  const [battingReplacements, setBattingReplacements] = useState<{ [index: number]: Player }>({});
  const [previousPositions, setPreviousPositions] = useState<{ [playerId: number]: string }>({});
  const [initialAssignments, setInitialAssignments] = useState<Record<string, number | null>>({});
  // 元の選手A -> 許可される相手B（確定まで有効）
  const [pairLocks, setPairLocks] = useState<Record<number, number>>({});
  // リエントリー専用：直近の「A⇄B（リエントリー）」情報を保持
type ReentryEntry = {
  originalId: number;           // B（元スタメン／退場中）
  pinchId: number;              // A（直前まで守っていた代打/代走）
  pos: string;                  // "捕" など
  reason: "代打" | "代走";
};

const [reentryInfos, setReentryInfos] = useState<ReentryEntry[]>([]);

  // 先発（画面オープン時にフィールドにいた）かどうか
  const isStarter = (playerId?: number | null) =>
    playerId != null && Object.values(initialAssignments || {}).includes(playerId);

useEffect(() => {
  (async () => {
    const stored = await localForage.getItem("dhEnabledAtStart");
    setDhEnabledAtStart(Boolean(stored));
  })();
}, []);

const handleDisableDH = async () => {
  const dhId = assignments?.["指"] ?? null;
  const pitcherId = assignments?.["投"] ?? null;

  if (!dhId) { window.alert("現在DHは使用していません。"); return; }
  if (!pitcherId) { window.alert("投手が未設定です。先に投手を設定してください。"); return; }

  // DHが打順のどこにいるか
  const idx = battingOrder.findIndex(e => e.id === dhId);
  if (idx === -1) { window.alert("打順に指名打者が見つかりませんでした。"); return; }

  // ① 守備の「指」を空欄にしてDHなし表示へ（＝9番下の投手行も消える）
  setAssignments(prev => ({ ...prev, "指": null }));

  // ② 以後“指”にD&DできないUIガードや未保存フラグ
  setDhEnabledAtStart(false);
  setDhDisableDirty(true);

  // ③ 打順は触らない！ 下段の赤字表示だけ作る（=投手を交代者として見せる）
  const p = teamPlayers.find(tp => tp.id === pitcherId);
  if (p) setBattingReplacements(prev => ({ ...prev, [idx]: p }));

  // ※ 保存(localForage)はここでは行わず、「交代を確定する」で反映
};




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

    setIsLoading(false);

    // デバッグ出力
    console.log("[DEBUG] battingOrder:", order);
    console.log("[DEBUG] usedPlayerInfo:", usedInfo);
    console.log("[DEBUG] 最終 assignments:", newAssignments);
  };

  loadData();
}, []);


const [usedPlayerInfo, setUsedPlayerInfo] = useState<Record<number, { fromPos: string }>>({});
// --- ここから：控えを「未出場」と「出場済み」に分けるヘルパー ---
// ※ import は増やさず React.useMemo を使います
const onFieldIds = React.useMemo(() => {
  return new Set(
    Object.values(assignments).filter((v): v is number => typeof v === "number")
  );
}, [assignments]);

const playedIds = React.useMemo(() => {
  const s = new Set<number>();

  // ① いまフィールドに居る選手（“出場済み”扱いに含める）
  onFieldIds.forEach((id) => s.add(id));

  // ② 打順に載っている選手（先発・代打・代走・途中出場すべて）
  (battingOrder || []).forEach((e) => {
    if (e?.id != null) s.add(e.id);
  });

  // ③ usedPlayerInfo から “元選手（キー側）” と “subId（途中出場側）” の両方を加える
  const u = (usedPlayerInfo as unknown) as Record<number, { subId?: number }>;
  Object.entries(u || {}).forEach(([origIdStr, info]) => {
    const origId = Number(origIdStr);
    if (!Number.isNaN(origId)) s.add(origId);          // ← 代打を出された「元選手」を明示的に出場済みに含める
    if (typeof info?.subId === "number") s.add(info.subId); // ← 途中出場側も出場済み
  });

   // ④ 先発（初期守備）の全員も「出場済み」に含める（投手交代でベンチに下がっても出場済み扱い）
  Object.values(initialAssignments || {}).forEach((id) => {
    if (typeof id === "number") s.add(id);
  });
  
  return s;
}, [onFieldIds, battingOrder, usedPlayerInfo, initialAssignments]);

const benchNeverPlayed = React.useMemo(
  () => benchPlayers.filter((p) => !playedIds.has(p.id)),
  [benchPlayers, playedIds]
);

const benchPlayedOut = React.useMemo(
  () => benchPlayers.filter((p) => playedIds.has(p.id) && !onFieldIds.has(p.id)),
  [benchPlayers, playedIds, onFieldIds]
);
// --- ここまでヘルパー ---

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
  "指": "指名打者",
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
  "指": "DH",
};
const withMark = (pos: string) => `${posNum[pos] ?? ""}${pos}`;

const announcementText = useMemo(() => {

// --- リエントリー専用（複数件対応） ---
let reentryLines: string[] = [];

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

// --- 追加: 投手⇄投手の交代（DHで打順に投手がいないケースの補完）---
(() => {
  // ★ ここを追加：DHが有効のときだけ補完を走らせる
  const dhActiveNow = !!assignments?.["指"];
  if (!dhActiveNow) return;

  const initP = initialAssignments?.["投"];
  const curP  = assignments?.["投"];

  if (
    typeof initP === "number" &&
    typeof curP === "number" &&
    initP !== curP &&
    !changes.some(r => r.type === "replace" && r.pos === "投")
  ) {
    const from = teamPlayers.find(p => p.id === initP);
    const to   = teamPlayers.find(p => p.id === curP);
    if (from && to) {
      changes.push({
        type: "replace",
        order: 0,      // （DH運用中のみ）打順外として補完
        from,
        to,
        pos: "投",
      });
    }
  }
})();


// ▼ ここは既存の changes 構築（battingOrder を走査して replace/mixed/shift を埋める）をそのまま維持

// 既存：通常のアナウンス文
const normalText = generateAnnouncementText(
  changes,
  teamName,
  battingOrder,
  assignments,
  teamPlayers,
  initialAssignments,
  usedPlayerInfo
);
// ★ 追加：DH解除押下中は、ヘッダー行の「直後」に告知文を挿入する
const injectDhDisabledAfterHeader = (txt: string) => {
  if (!dhDisableDirty) return txt;

  const lines = txt.split("\n");
  // ヘッダー行（…お知らせいたします。／.）を探す
  const headerIdx = lines.findIndex((l) =>
    /お知らせいたします[。.]$/.test(l.trim())
  );
  if (headerIdx >= 0) {
    lines.splice(headerIdx + 1, 0, "ただいまより、指名打者制を解除します。");
    return lines.join("\n");
  }
  // ヘッダーが見つからなければ先頭に付ける（保険）
  return `ただいまより、指名打者制を解除します。\n${txt}`;
};

// ★ 追加：DH解除ボタン押下中は、先頭に告知文を付加する
const addDhDisabledHeader = (txt: string) =>
  dhDisableDirty ? `ただいまより、指名打者制を解除します。\n${txt}` : txt;

// 既存と合体（リエントリーなしなら通常だけ返す）
if (reentryLines.length === 0) {
  return injectDhDisabledAfterHeader(normalText);

}

// 1) 通常側のヘッダーは削除（リエントリー行ですでに案内済み）
const headerRegex = new RegExp(
  `^${teamName}、(?:選手の交代並びにシートの変更|選手の交代|シートの変更)をお知らせいたします。$`
);

let normalLines = normalText
  .split("\n")
  .filter((ln) => ln.trim().length > 0 && !headerRegex.test(ln.trim()));


// 2) 同一内容の重複行（リエントリーと同旨の通常行）を全ペア分削除
for (const { A, B, posJP } of reentryPairs) {
  const keyA = lastWithHonor(A).replace(/\s+/g, "");
  const keyB = fullNameHonor(B).replace(/\s+/g, "");
  normalLines = normalLines.filter((ln) => {
    const t = ln.replace(/\s+/g, "");
    const dup = t.includes(keyA) && t.includes(keyB) && t.includes(posJP);
    return !dup;
  });
}

// ▼ リエントリー対象（B）の“打順行だけ”を 苗字＋敬称／番号なし に統一
if (reentryPairs.length > 0 && normalLines.length > 0) {
  normalLines = normalLines.map((ln) => {
    for (const { B } of reentryPairs) {
      const full = fullNameHonor(B);      // 例: <ruby>米山<rt>よねやま</rt></ruby><ruby>碧人<rt>あおと</rt></ruby>くん
      const last = lastWithHonor(B);      // 例: <ruby>米山<rt>よねやま</rt></ruby>くん
      if (ln.includes(full)) {
        // フルネーム→苗字＋敬称 に置換
        ln = ln.replace(full, last);
        // 背番号を削除（もし付いていれば）
        ln = ln.replace(/\s*背番号\s*\d+/, "");
      } else if (ln.includes(last)) {
        // すでに苗字表記だが背番号だけ付いているケースを掃除
        ln = ln.replace(/\s*背番号\s*\d+/, "");
      }
    }
    return ln;
  });
}


// リエントリーの句点調整：続きがある行は「…に入ります。」→「…、」
if (reentryLines.length > 0) {
  // リエントリーが複数なら、最後以外はすべて「、」で終える
  for (let i = 0; i < reentryLines.length - 1; i++) {
    reentryLines[i] = reentryLines[i].replace(/に入ります。$/, "、");
  }
  // リエントリーの後ろに通常の交代アナウンスが続く場合、
  // リエントリー最後の行も「、」で繋ぐ
  if (normalLines.length > 0) {
    reentryLines[reentryLines.length - 1] =
      reentryLines[reentryLines.length - 1].replace(/に入ります。$/, "、");
  }
}

return normalText;


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

// ✅ ベンチは“常に最新の assignments”から再計算する
useEffect(() => {
  if (!teamPlayers || teamPlayers.length === 0) return;

  const assignedIdsNow = Object.values(assignments)
    .filter((id): id is number => typeof id === "number");

  (async () => {
    const benchOutIds: number[] = (await localForage.getItem("benchOutIds")) || [];
    setBenchPlayers(
      teamPlayers.filter(
        (p) => !assignedIdsNow.includes(p.id) && !benchOutIds.includes(p.id)
      )
    );
  })();
}, [assignments, teamPlayers]);


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

  // ★ イベントから切り離して保持
  const el = e.currentTarget as HTMLDivElement;

  const target =
    el.querySelector<HTMLElement>("div[draggable='true']") || el;

  const { ghost, rect } = makeDragGhost(target);
  e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);

  const onEnd = () => {
    try { ghost.remove(); } catch {}
    try { el.removeEventListener("dragend", onEnd); } catch {}
    window.removeEventListener("dragend", onEnd);
    window.removeEventListener("drop", onEnd);
  };

  // once: true で二重解除を気にしない
  el.addEventListener("dragend", onEnd, { once: true });
  window.addEventListener("dragend", onEnd, { once: true });
  window.addEventListener("drop", onEnd, { once: true });
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
// ★ オンフィールド同士の入替では打順は触らない
//    影響しうる打順スロット（from/to の元スタメン）だけ置換を消す
if (fromId !== null && toId !== null) {
  battingOrder.forEach((starter, index) => {
    if (starter.id === fromId || starter.id === toId) {
      setBattingReplacements((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
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

      // --- リエントリー判定（ベンチ→守備の“その位置”だけを入替） ---
    let allowDrop = true; // 🆕 不可ならこのターンの配置を中止
    (() => {
      // playerId はベンチから落とした選手
      const info: any = (usedPlayerInfo as any)?.[playerId]; // ← “元先発B”なら usedPlayerInfo に記録あり
      const reason = info?.reason as "代打" | "代走" | undefined;
      const isReentryCandidate = reason === "代打" || reason === "代走";

      // B の「元いた守備」を略号に正規化（例: "サード"→"三"）
      const fromSym = (posNameToSymbol as any)[info?.fromPos] ?? info?.fromPos;

      // 連鎖の末端まで辿って、B に対して実際に出ていた “代打/代走 A（最新）” を取得
      const latest = resolveLatestSubId(playerId, (usedPlayerInfo as any) || {});
      const isPinchAtThatPos =
        replacedId != null && (replacedId === latest || replacedId === info?.subId);

      if (isReentryCandidate) {
        // ✅ リエントリー成立条件：
        //  1) B を “元いた守備” に戻す（toPos === fromSym）
        //  2) その位置にいたのが “自分に出ていた代打/代走（A最新）”
        const ok = fromSym === toPos && isPinchAtThatPos;

        if (!ok) {
          // ✖ 条件を満たさない → この配置は行わない
          allowDrop = false;
          window.alert("リエントリー対象選手ではありません。");
          // 念のため、このBの古いリエントリー記録を掃除
          setReentryInfos((prev) => prev.filter((x) => x.originalId !== playerId));
          return;
        }

        // ✅ 正常なリエントリー：記録を積む（重複防止つき）
        setReentryInfos((prev) => {
          if (replacedId == null) return prev;
          const exists = prev.some(
            (x) => x.originalId === playerId && x.pinchId === replacedId && x.pos === toPos
          );
          return exists ? prev : [...prev, { originalId: playerId, pinchId: replacedId, pos: toPos, reason }];
        });
      } else {
        // 通常の控え選手：リエントリー記録が残っていたら消す
        setReentryInfos((prev) => prev.filter((x) => x.originalId !== playerId));
      }
    })();
    // 🛑 不成立ならこのドロップは無効（状態は一切変えない）
    if (!allowDrop) { e.dataTransfer.dropEffect = "none"; return prev; }

      // === 追加：Aの位置へCを入れた瞬間、Aのロック相手をB→Cに付け替える ===
    // toPos が「Aの元ポジ」かどうかを initialAssignments で判定
      const aIdAtThisPos = initialAssignments[toPos]; // ← A（元）のID（なければ undefined/ null）

    // === 追加：Aの位置へCを入れた瞬間、B→AロックをB→Cへ付け替えつつAを完全解除 ===
    // toPos が「元の先発(B)のポジション」かどうかを initialAssignments で判定
    const starterAtThisPos = initialAssignments[toPos]; // 元の先発 = B
    if (
      starterAtThisPos != null &&
      replacedId != null &&                      // 直前までそこにいたのが A
      pairLocks[starterAtThisPos] === replacedId // いま B→A のロックになっている
    ) {
      setPairLocks((m) => {
        const copy = { ...m };

        // 1) B→A を B→C に付け替え
        //    playerId はいま落とした C
        copy[starterAtThisPos] = playerId;

        // 2) A を完全に自由化（A をキーにしたロックも、値として参照されているロックも掃除）
        delete copy[replacedId]; // key = A のロックを削除
        for (const [k, v] of Object.entries(copy)) {
          if (v === replacedId) delete copy[Number(k)]; // partner = A を参照するエントリを掃除
        }

        return copy;
      });
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

    // 先発（画面を開いた時点でフィールドにいた選手）にだけロックを作る
    if (
      replacedId != null &&
      isStarter(replacedId) &&        // ★ これを追加
      pairLocks[replacedId] == null &&
      replacedId !== playerId         // 念のため：同一IDの自爆防止
    ) {
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


    // 🟢（ベンチ → 先発 のときだけ）battingReplacements を更新
    // 既にグラウンドにいる選手同士の入替え（守備位置の交換）は打順を触らない
    if (fromPos === BENCH && targetIndex !== -1 && replacedId !== playerId) {
      const benchPlayer = teamPlayers.find((p) => p.id === playerId);
      if (benchPlayer) {
        setBattingReplacements((prev) => ({
          ...prev,
          [targetIndex]: benchPlayer,
        }));
      }
    } else {
      // on-field ⇄ on-field の入替えは念のため置換を消しておく
      if (targetIndex !== -1) {
        setBattingReplacements((prev) => {
          const next = { ...prev };
          delete next[targetIndex];
          return next;
        });
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
  // usedInfo を読み出し
  const usedInfo: Record<
    number,
    {
      fromPos: string;
      subId: number;
      reason: "守備交代";
      order: number | null;     // ← number | null にしておくと安全
      wasStarter: boolean;
    }
  > = (await localForage.getItem("usedPlayerInfo")) || {};

    // ▼ ここから追加：確定時に最終状態を作る（DH解除をここで反映）
  let finalAssignments = { ...assignments };
  let finalBattingOrder = [...battingOrder];
  let finalDhEnabledAtStart = dhEnabledAtStart;

  if (pendingDisableDH) {
    const dhId = finalAssignments["指"];
    const pitcherId = finalAssignments["投"];

    if (typeof dhId === "number" && typeof pitcherId === "number") {
      const idx = finalBattingOrder.findIndex(e => e.id === dhId);
      if (idx !== -1) {
        // 指名打者の打順を投手に置換
        finalBattingOrder[idx] = { id: pitcherId, reason: "スタメン" };
      }
    } else {
      window.alert("DH解除に必要な情報（指名打者 or 投手）が不足しています。");
      return; // 不整合は保存しない
    }

    // 守備の「指」を空にしてDHなしへ
    finalAssignments["指"] = null;
    finalDhEnabledAtStart = false; // 以後“指”へのD&Dは禁止・9番下の投手表示も出なくなる
  }
  // ▲ ここまで追加

  // ★ ここで一度だけ取得（ループ内で await しない）
  const startingOrder: Array<{ id: number; reason?: string }> =
    (await localForage.getItem("startingBattingOrder")) || [];

  // 守備交代で usedInfo を更新（order/wasStarter を必ず書く）
  positions.forEach((pos) => {
    const initialId = initialAssignments[pos];  // 元の選手（先発想定）
    const currentId = assignments[pos];         // 現在の選手
    const playerChanged = initialId && currentId && initialId !== currentId;

    if (playerChanged) {
      // 1) 打順 order（1始まり）：battingOrder → なければ startingOrder でフォールバック
      const idxNow = battingOrder.findIndex((e) => e.id === initialId);
      const idxStart = startingOrder.findIndex((e) => e.id === initialId);
      const order: number | null =
        idxNow !== -1 ? idxNow + 1 :
        idxStart !== -1 ? idxStart + 1 :
        null;

      // 2) wasStarter：開始スナップショットに居たら true
      const wasStarter = idxStart !== -1;

      // 3) fromPos：代打/代走で入っていたなら "代打"/"代走"
      const battingReasonNow = idxNow !== -1 ? battingOrder[idxNow]?.reason : undefined;
      const fromPos =
        battingReasonNow === "代打" ? "代打" :
        battingReasonNow === "代走" ? "代走" :
        pos;

      usedInfo[initialId] = {
        fromPos,
        subId: currentId!,
        reason: "守備交代",
        order,        // ← null の可能性も許容
        wasStarter,
      };
    }
  });

  // 🆕 リエントリー確定した元選手(B)の代打/代走痕跡を掃除する
{
  // いまフィールドに出ている選手の集合（数値IDだけ）
  const onFieldIds = new Set(
    Object.values(assignments).filter(
      (v): v is number => typeof v === "number"
    )
  );

  // usedPlayerInfo の「元選手B（キー）」側に 代打/代走 が残っていて、
  // かつ B がフィールドに戻っている → リエントリー確定としてクリア
  for (const [origIdStr, info] of Object.entries(usedInfo)) {
    const origId = Number(origIdStr);
    const reason = (info as any)?.reason as string | undefined;
    if ((reason === "代打" || reason === "代走") && onFieldIds.has(origId)) {
      (usedInfo as any)[origIdStr] = { ...(info as any), hasReentered: true };
      delete (usedInfo as any)[origIdStr].reason;   // 代打/代走フラグを消す
      delete (usedInfo as any)[origIdStr].subId;    // 代打/代走の相手の紐付けを消す
      delete (usedInfo as any)[origIdStr].fromPos;  // 元ポジ情報も不要
    }
  }
}
// （この直後に既存の保存行が続く）
await localForage.setItem("usedPlayerInfo", usedInfo);

  console.log("✅ 守備交代で登録された usedPlayerInfo：", usedInfo);

  // ---- 打順は「並びを固定」する：入替や移動では一切並べ替えない ----
  const updatedOrder = structuredClone(battingOrder);

  // フィールドに居る選手集合（数値のみ）
  const onFieldIds = new Set(
    Object.values(assignments).filter((v): v is number => typeof v === "number")
  );

  // “打順に元から居る（＝先発 or 既に登録済み）選手”集合
  const startersOrRegistered = new Set(
    updatedOrder.map(e => e?.id).filter((id): id is number => typeof id === "number")
  );

  // 守備位置ごとに差分を確認（並びは一切変更しない）
  positions.forEach((pos) => {
    const initialId = initialAssignments[pos];
    const currentId = assignments[pos];

    if (!initialId || !currentId || initialId === currentId) return;

    const replacedIndex = updatedOrder.findIndex(e => e.id === initialId);
    if (replacedIndex === -1) return;

    const currentIsAlreadyInOrder = startersOrRegistered.has(currentId);
    const initialStillOnField     = onFieldIds.has(initialId);

    // A) 位置替えだけ → 触らない
    if (currentIsAlreadyInOrder && initialStillOnField) return;

    // B) 元の選手がベンチに下がり、今いる選手が“新規” → 途中出場で上書き
    if (!currentIsAlreadyInOrder && !initialStillOnField) {
      updatedOrder[replacedIndex] = { id: currentId, reason: "途中出場" };
      startersOrRegistered.add(currentId);
    }
    // C) それ以外 → 何もしない
  });

  // 代打が守備に就いたら理由だけ“途中出場”に補正
  updatedOrder.forEach((entry, index) => {
    if (["代打", "代走"].includes(entry?.reason) && onFieldIds.has(entry.id)) {
      updatedOrder[index] = { ...entry, reason: "途中出場" };
    }
  });

  // battingReplacements を確定反映
  Object.entries(battingReplacements).forEach(([idxStr, repl]) => {
    const idx = Number(idxStr);
    const starterId = battingOrder[idx]?.id;
    if (starterId == null) return;

    const replacementId = repl.id;
    const starterStillOnField = onFieldIds.has(starterId);
    const replacementOnField  = onFieldIds.has(replacementId);

    if (!starterStillOnField && replacementOnField) {
      updatedOrder[idx] = { id: replacementId, reason: "途中出場" };
      startersOrRegistered.add(replacementId);
    }
  });

  // 保存
  await localForage.setItem("lineupAssignments", assignments);
  await localForage.setItem("battingReplacements", battingReplacements);
  await localForage.setItem("battingOrder", updatedOrder);
  await localForage.setItem("dhEnabledAtStart",  dhEnabledAtStart);

  console.log("[CONFIRM] 守備交代確定後の battingOrder:");
  console.table(updatedOrder);

  setPairLocks({});
  onConfirmed?.();
  console.log("✅ onConfirmed called");
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
      
      onDragOver={(e) => { if (pos !== "指" || dhEnabledAtStart) e.preventDefault(); }}
      onDrop={(e) => { if (pos !== "指" || dhEnabledAtStart) handleDrop(pos, e); }}
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
    <span className="text-gray-300 text-base">DHなし</span>
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
  className="flex flex-col gap-2 mb-6"
  onDragOver={(e) => { if (pos !== "指" || dhEnabledAtStart) e.preventDefault(); }}
  onDrop={(e) => handleDrop(BENCH, e)}
>
  {/* 未出場の控え */}
  {benchNeverPlayed.length === 0 ? (
    <div className="text-xs text-gray-400 mb-1">（なし）</div>
  ) : (
    <div className="flex flex-wrap gap-2 mb-2">
      {benchNeverPlayed.map((p) => (
        <div
          key={`bench-${p.id}`}
          draggable
          onDragStart={(e) => handleBenchDragStart(e, p.id)}
          className="px-2 py-1 bg-gray-200 rounded cursor-move select-none"
        >
          {formatPlayerLabel(p)}
        </div>
      ))}
    </div>
  )}

  {/* 出場済み（いまはベンチ） */}
  <div className="text-xs font-semibold text-gray-600 mt-1">出場済み選手</div>
  {benchPlayedOut.length === 0 ? (
    <div className="text-xs text-gray-400">（なし）</div>
  ) : (
    <div className="flex flex-wrap gap-2">
      {benchPlayedOut.map((p) => (
        <div
          key={`played-${p.id}`}
          draggable
          onDragStart={(e) => handleBenchDragStart(e, p.id)}
          className="px-2 py-1 bg-gray-100 text-gray-600 border border-gray-300 rounded cursor-move select-none"
          title="一度出場済みの選手"
        >
          {formatPlayerLabel(p)}
        </div>
      ))}
    </div>
  )}
</div>


<div className="mt-8 flex flex-col lg:flex-row gap-6">
  {/* 打順一覧（左） */}
  <div className="flex-1">
    <h2 className="text-lg font-semibold mb-2">打順（1番〜9番）</h2>
    <ul className="space-y-1 text-sm border border-gray-300 p-2 rounded">
{battingOrder.map((entry, index) => {
  const displayId = battingReplacements[index]?.id ?? entry.id;

   const starter = teamPlayers.find(p => p.id === entry.id);
  const player  = teamPlayers.find(p => p.id === displayId);
  if (!starter || !player) return null;

  const currentPos = getPositionName(assignments, displayId);
  const initialPos = getPositionName(initialAssignments, entry.id);

  const playerChanged   = displayId !== entry.id;
  const positionChanged = currentPos !== initialPos;

  const isPinchHitter = entry.reason === "代打";
  const isPinchRunner = entry.reason === "代走";
  const isPinch = isPinchHitter || isPinchRunner;
  const pinchLabel = isPinchHitter ? "代打" : isPinchRunner ? "代走" : "";

  return (
    <li key={`${index}-${displayId}`} className="border px-2 py-1 rounded bg-white">
      <div className="flex items-start gap-2">
        <span className="w-8">{index + 1}番</span>
        <div>
          {isPinch && playerChanged ? (
            // 代打/代走の選手が別人に交代した（=displayIdが変わった）
            <>
              <div className="line-through text-gray-500 text-sm">
                {pinchLabel} {starter.lastName}{starter.firstName} #{starter.number}
              </div>
              <div className="text-red-600 font-bold">
                {currentPos}　{player.lastName}{player.firstName} #{player.number}
              </div>
            </>
          ) : isPinch ? (
            // 代打/代走のまま（同一ID）で守備入り or 位置だけ変わった
            <>
              <div>
                <span className="line-through">{pinchLabel}</span>&nbsp;
                {starter.lastName}{starter.firstName} #{starter.number}
              </div>
              <div className="pl-0 text-red-600 font-bold">
                {currentPos}
              </div>
            </>
          ) : playerChanged ? (
            // スタメンから別選手に交代
            <>
              <div className="line-through text-gray-500 text-sm">
                {initialPos}　{starter.lastName}{starter.firstName} #{starter.number}
              </div>
              <div className="text-red-600 font-bold">
                {currentPos}　{player.lastName}{player.firstName} #{player.number}
              </div>
            </>
) : positionChanged ? (
  // 守備だけの入替（DH中の「投⇄捕」など）は打順は据え置き。
  // 上段はそのまま（取り消し線なし）、下段に“ポジション名だけ”を赤字で出す。
  (() => {
    const dhActive = !!assignments["指"];
    const isOnlyDefSwap =
      dhActive &&
      ((initialPos === "捕" && currentPos === "投") ||
       (initialPos === "投" && currentPos === "捕"));

    if (isOnlyDefSwap) {
      return (
        <>
          {/* 上段：元の選手だけ（そのまま） */}
          <div>{initialPos}　{starter.lastName}{starter.firstName} #{starter.number}</div>
          {/* 下段：相手の“名前”は出さず、ポジション名だけ赤字で */}
          <div className="text-red-600 font-bold">{currentPos}</div>
        </>
      );
    }

    // ↑以外の通常の“位置だけ変更”は従来表示
    return (
      <>
        <div className="line-through text-gray-500 text-sm">{initialPos}</div>
        <div>
          <span className="text-red-600 font-bold">{currentPos}</span>　{starter.lastName}{starter.firstName} #{starter.number}
        </div>
      </>
    );
  })()
) : (
  // 変更なし
  <div>{currentPos}　{starter.lastName}{starter.firstName} #{starter.number}</div>
)}

        </div>
      </div>
    </li>
  );
})}

{(() => {
  // DHが使われていなければ出さない
  const dhActive = !!assignments["指"];
  if (!dhActive) return null;

  // 先発（試合開始時）の投手IDを基準に表示
  const starterPitcherId =
    typeof initialAssignments?.["投"] === "number"
      ? (initialAssignments["投"] as number)
      : null;
  if (!starterPitcherId) return null;

  // 先発投手が打順に含まれているときは出さない（DH時のみ表示）
  const inBatting = battingOrder.some((e) => e.id === starterPitcherId);
  if (inBatting) return null;

  // 現在の投手（控えから交代後を含む）
  const currentPitcherId =
    typeof assignments?.["投"] === "number" ? (assignments["投"] as number) : null;

  const oldP = teamPlayers.find((p) => p.id === starterPitcherId);
  const newP = currentPitcherId
    ? teamPlayers.find((p) => p.id === currentPitcherId)
    : undefined;
  if (!oldP) return null;

  // 交代が起きたか？（先発投手IDと現在投手IDが異なる）
  const replaced = !!newP && currentPitcherId !== starterPitcherId;

  return (
<li key="pitcher-under-9" className="border px-2 py-1 rounded bg-white">
  <div className="flex items-start gap-2">
    <span className="w-8" />
    <div>
      {replaced ? (
        (() => {
          // 安全に取得
          const oldPosNow =
            Object.entries(assignments).find(([k, v]) => v === oldP?.id)?.[0] ?? "投";
          const isSwapWithFielder = oldPosNow !== "投";

          // データ欠落時は何も出さずに保護
          if (!oldP) return null;

          if (isSwapWithFielder) {
            // 守備だけ入替：上段=旧投手、下段=旧投手の新守備（略号だけ）
            return (
              <>
                <div>
                  投　{oldP.lastName}{oldP.firstName} #{oldP.number}
                </div>
                <div className="text-red-600 font-bold">{oldPosNow}</div>
              </>
            );
          }

          // 通常の投手交代：新投手が未取得なら安全にスキップ
          if (!newP) {
            return (
              <div>
                投　{oldP.lastName}{oldP.firstName} #{oldP.number}
              </div>
            );
          }
          return (
            <>
              <div className="line-through text-gray-500 text-sm">
                投　{oldP.lastName}{oldP.firstName} #{oldP.number}
              </div>
              <div className="text-red-600 font-bold">
                投　{newP.lastName}{newP.firstName} #{newP.number}
              </div>
            </>
          );
        })()
      ) : (
        // 交代なし（保険）
        (() => {
          if (!oldP) return null;
          const posSym =
            Object.entries(assignments).find(([k, v]) => v === oldP.id)?.[0] ?? "投";
          return (
            <div>
              {posSym}　{oldP.lastName}{oldP.firstName} #{oldP.number}
            </div>
          );
        })()
      )}
    </div>
  </div>
</li>



  );
})()}



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

        // --- 追加: DHありで打順に投手が居ないケースでも投手交代を表示する ---
        // --- 追加: 先発投手が「投」以外の守備に就いている場合も1行出す ---
(() => {
  const initP = initialAssignments?.["投"];
  // 先発投手が打順にいない（DH時）前提。重複回避で既存行を確認。
  if (typeof initP !== "number") return;

  // 先発投手が今どの守備に就いているか
  const nowPos =
    Object.entries(assignments).find(([pos, id]) => id === initP)?.[0];

  // 「投」以外の守備に移っていたら表示（既に同じposのshift行があれば出さない）
  if (nowPos && nowPos !== "投" && !changes.some(c => c.type === 4 && c.pos === nowPos)) {
    const from = teamPlayers.find(p => p.id === initP);
    if (from) {
      changes.push({
        key: "pitcher-shift-extra",
        type: 4,            // 守備位置変更（shift）扱い
        pos: nowPos,        // 並び順は移動先の守備でソート
        jsx: (
          <li key="pitcher-shift-extra">
            {withFull("投")}：{from.lastName}{from.firstName} #{from.number}
            {" "}➡ {withFull(nowPos)}
          </li>
        ),
      });
    }
  }
})();

(() => {
  const initP = initialAssignments?.["投"];
  const curP  = assignments?.["投"];

  // 両方とも数値で、かつ別人、かつ既に投手の行が無いときだけ追加
  if (
    typeof initP === "number" &&
    typeof curP === "number" &&
    initP !== curP &&
    !changes.some(c => c.pos === "投")
  ) {
    const from = teamPlayers.find(p => p.id === initP);
    const to   = teamPlayers.find(p => p.id === curP);
    if (from && to) {
      changes.push({
        key: "pitcher-change-extra",
        type: 3,             // 通常の「交代」扱い
        pos: "投",
        jsx: (
          <li key="pitcher-change-extra">
            {withFull("投")}：{from.lastName}{from.firstName} #{from.number}
            {" "}➡ {withFull("投")}：{to.lastName}{to.firstName} #{to.number}
          </li>
        ),
      });
    }
  }
})();

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
  type="button"
  onClick={handleDisableDH}
  disabled={!assignments?.["指"]}
  className="bg-gray-800 text-white px-6 py-2 rounded disabled:bg-gray-300"
>
  DH解除
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
      ref={modalTextRef} 
      className="text-red-600 text-lg font-bold whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: announcementText }}
    />
  </div>
)}

{/* いつでも見える操作フッター */}
<div className="sticky bottom-0 left-0 right-0 bg-white pt-3 pb-2">
  <div className="flex justify-center gap-4">
    <button
      onClick={speakVisibleAnnouncement}
      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
    >
      読み上げ
    </button>
    <button
      onClick={stopSpeaking}
      className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
    >
      停止
    </button>
  </div>
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