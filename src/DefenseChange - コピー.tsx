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




const generateAnnouncementText = (  
  records: ChangeRecord[],
  teamName: string,
  battingOrder?: { id: number; reason: string }[],
  assignments?: Record<string, number | null>,
  teamPlayers?: Player[],
  initialAssignments?: Record<string, number | null>,
  usedPlayerInfo?: Record<number, UsedPlayerInfo>
): string => {
  const posJP: Record<string, string> = {
    "投": "ピッチャー", "捕": "キャッチャー", "一": "ファースト", "二": "セカンド",
    "三": "サード", "遊": "ショート", "左": "レフト", "中": "センター", "右": "ライト"
  };
  const jpPos = (sym: string) => posJP[sym] ?? posJP[posNameToSymbol[sym] ?? ""] ?? sym;
 

  const mixed = records.filter(r => r.type === "mixed") as Extract<ChangeRecord, { type: "mixed" }>[];
  const replace = records.filter(r => r.type === "replace") as Extract<ChangeRecord, { type: "replace" }>[];
  const shift = records.filter(r => r.type === "shift") as Extract<ChangeRecord, { type: "shift" }>[];

  const result: string[] = [];
  const samePosPinch: string[] = [];   // ① そのまま同守備位置
  const shiftPosPinch: string[] = [];  // ② 守備位置が替わったパターン
  const handledShift = new Set<number>();  // 🆕 二重 push 防止

  // ✅ 代打・代走 → 守備入りパターン専用出力
  console.log("[DEBUG] 代打/代走のそのまま守備入り判定開始");
  console.log(`[DEBUG] records.length=${records.length} assignments=${assignments} `);
  if ( battingOrder && assignments) {
  const lines: string[] = [];
  const posEntries = Object.entries(assignments);

 
  battingOrder.forEach((entry, index) => {
    if (handledShift.has(entry.id)) return;
    if (entry.reason === "代打" || entry.reason === "代走") {
      const pos = Object.entries(assignments).find(([_, id]) => id === entry.id)?.[0];
      const player = teamPlayers?.find(p => p.id === entry.id);
      if (!pos || !player) {
        console.warn(`[WARN] posまたはplayerが取得できません: pos=${pos}, player=${player}`);
      //  return;
      }

      const currentId = assignments[pos];
      const currentPlayer = teamPlayers?.find(p => p.id === currentId);
      const initialId = initialAssignments?.[pos];
      const isReplaced = !!usedPlayerInfo?.[entry.id];
      const posName = posJP[pos];
      const honorific = player.isFemale ? "さん" : "くん";

      console.log("=== 分岐チェック ===");
      console.log("entry.id", entry.id, "entry.reason", entry.reason);
      console.log("pos", pos);
      console.log("currentId", currentId);
      console.log("currentPlayer", currentPlayer);
      console.log("player", player);
      const isOutOfDefense = !Object.values(assignments).includes(entry.id);

      // ✅ 分岐1: そのまま守備入り（交代なし＋同一守備位置）
      if (!isReplaced && currentId === entry.id && currentId === initialId) {
        samePosPinch.push(
           `<ruby>${player.lastName}<rt>${player.lastNameKana}</rt></ruby>${honorific} がそのまま ${posName} に`
        );

        // 打順 1 行は従来どおり result に貯めて OK
        result.push(`${index + 1}番 ${posName} <ruby>${player.lastName}<rt>${player.lastNameKana}</rt></ruby>${honorific}。`);

        // 先に交代系を無効化する処理はそのまま
        //replace.length = 0;
        //mixed.length   = 0;
        //shift.length   = 0;
      }
      // ✅ 分岐2: 守備位置が変わって入った（交代なし＋違う守備位置）
      /* ───── 代打した選手が “別の守備位置” に入るパターン ───── */
      else if (!isReplaced && currentId === entry.id && currentId !== initialId) {
         if (handledShift.has(entry.id)) return;
        // 既に同じ選手を shift 処理済みなら、まとめ文用だけ追加してスキップ
        if (handledShift.has(entry.id)) {
          shiftPosPinch.push(
            `<ruby>${player.lastName}<rt>${player.lastNameKana}</rt></ruby>${honorific} が ${posName} に入`
          );
          return; // ← 個別行と打順行を追加しない
        }
        /* ① 文頭用バッファに追加（ここでは result に push しない） */
        shiftPosPinch.push(
          `<ruby>${player.lastName}<rt>${player.lastNameKana}</rt></ruby>${honorific} が ${posName} に入`
        );

        /* ② サブで守備をスライドした選手（shiftRecord）がいる場合は
              その１行をすぐ result に加える（従来ロジックを維持） */
        const shiftRecord = shift.find(s => s.fromPos === pos);
        const shiftPlayer = shiftRecord?.player;
        const shiftToPos   = shiftRecord?.toPos;
        const shiftToPosName = shiftToPos ? jpPos(shiftToPos) : "";

        /* ★ ② “移動させられた選手” もフレーズに追加 */
        if (shiftRecord && shiftPlayer && shiftToPos) {
          const shiftH = shiftPlayer.isFemale ? "さん" : "くん";
          shiftPosPinch.push(
            `<ruby>${shiftPlayer.lastName}<rt>${shiftPlayer.lastNameKana}</rt></ruby>${shiftH} が ${shiftToPosName} に入`
          );
        }
          /* ── 打順行を作るロジック（announceOrderList…）は既存のまま ── */

  
        if (shiftRecord && shiftPlayer) {

          /* 🆕 この選手は後続ループで重複しないよう登録 */
          //handledShift.add(shiftPlayer.id);

          /* shift リストから除いて二重表現を防止 */
          const i = shift.indexOf(shiftRecord);
          if (i !== -1) shift.splice(i, 1);
        }

        // 🔽 打順表示を一時リストに
        const announceOrderList: string[] = [];
        // 交代で入った選手の打順
        if (!handledShift.has(player.id)) {
          announceOrderList.push(
            `${index + 1}番 ${posName} <ruby>${player.lastName}<rt>${player.lastNameKana}</rt></ruby>${honorific}`
          );
          //handledShift.add(player.id);   // 登録
        }

        // 移動した選手の打順（存在する場合）
        if (shiftRecord && shiftPlayer && shiftToPos) {
          const shiftOrder = battingOrder.findIndex(e => e.id === shiftPlayer.id);
          const shiftToPosJP = posJP[shiftToPos] || shiftToPos;
          const shiftH = shiftPlayer.isFemale ? "さん" : "くん";
          if (shiftOrder !== -1) {
            if (!handledShift.has(shiftPlayer.id)) {
              announceOrderList.push(
                `${shiftOrder + 1}番 ${shiftToPosName} <ruby>${shiftPlayer.lastName}<rt>${shiftPlayer.lastNameKana}</rt></ruby>${shiftH}`
              );
              //handledShift.add(shiftPlayer.id);
            }
          }
        }
        // 🔽 打順順にソートして追加
        announceOrderList
          .sort((a, b) => parseInt(a) - parseInt(b))
          .forEach(line => result.push(line));

        // 他の分岐を無効化
        replace.length = 0;
        mixed.length = 0;
        shift.length = 0;
      } 

      // ✅ 分岐3: 守備から外れており、控え選手が代打の選手と同じ守備位置に入った場合
      if (replace.length > 0 || mixed.length > 0) {
        if(entry.reason === "代打"){
            ChangeFlg = 1; // 値を変更
        }
        else{ //代走
            ChangeFlg = 10; // 値を変更
        }        
      }
      // ✅ 分岐4: 守備位置が変わって入った（交代あり＋違う守備位置）
      if (mixed.length > 0 || (replace.length > 0 && shift.length > 0)){
        if(entry.reason === "代打"){
            ChangeFlg = 2; // 値を変更 
        }
        else{ //代走
            ChangeFlg = 20; // 値を変更 
        }
      }
    }
  });

  if (samePosPinch.length > 0) {
 const hasMore = replace.length > 0 || mixed.length > 0 || shift.length > 0;
 const joined = samePosPinch
    .map((txt, i) => (i === 0
      ? `先ほど代打致しました${txt}`
      : `同じく先ほど代打致しました${txt}`) +
      (i === samePosPinch.length - 1
        ? hasMore ? "入り、" : "入ります。"
        : "り、"))
    .join("");
  result.unshift(joined);
}

if (shiftPosPinch.length > 0) {
  const joinedShift = shiftPosPinch
    .map((txt, i) => (i === 0
      ? `先ほど代打致しました${txt}`
      : `同じく先ほど代打致しました${txt}`) +
      (i === shiftPosPinch.length - 1 ? "ります。" : "り、"))
    .join("");
  result.unshift(joinedShift);
}
/*  代打/代走が守備に入るケースでは冒頭にヘッダーを付ける */
if (shiftPosPinch.length > 0 && samePosPinch.length === 0 && teamName) {
  result.unshift(`${teamName}、選手の交代をお知らせいたします。`);
}

}
  if (
    result.length > 0 &&
    replace.length === 0 &&
    mixed.length === 0 &&
    shift.length === 0
  ) {
    result.push("以上に代わります。");
    return result.join("\n");
  }

  // ***************//
  //  通常の交代文言 //
  // ***************//
  if (records.length === 0) return "交代内容はありません。";
  if (mixed.length > 0 || (replace.length > 0 && shift.length > 0)) {
    if (ChangeFlg === 0) {
      result.push(`${teamName}、選手の交代並びにシートの変更をお知らせいたします。`);
    }
    else if ((ChangeFlg === 2) || (ChangeFlg === 20)) {//代打or代走の時{
      result.push(`${teamName}、選手の交代をお知らせいたします。`);
    }  
  } else if (replace.length > 0 || mixed.length > 0) {
    if (ChangeFlg === 0) {//代打の時は非表示
      result.push(`${teamName}、選手の交代をお知らせいたします。`);
    }  
  }  
  else if (shift.length > 0) {
    result.push(`${teamName}、シートの変更をお知らせいたします。`);
  }

  // ✅ 交代パート（replace + mixed）
  const allReplacements = [...mixed, ...replace];
  const posOrder = ["投", "捕", "一", "二", "三", "遊", "左", "中", "右"];
  allReplacements.sort((a, b) => {
    const aPos = a.type === "mixed" ? a.fromPos : a.pos;
    const bPos = b.type === "mixed" ? b.fromPos : b.pos;
    return posOrder.indexOf(aPos) - posOrder.indexOf(bPos);
  });

  allReplacements.forEach((r, index) => {
    if (r.type === "mixed") {
      const fromH = r.from.isFemale ? "さん" : "くん";
      const toH = r.to.isFemale ? "さん" : "くん";
      if( (ChangeFlg === 2)||(ChangeFlg === 20) ) {  //代打時の表示          
            if (ChangeFlg === 2) {
                result.push(`先ほど代打致しました ${r.from.lastName}${fromH} に代わりまして、${r.to.lastName}${toH} が入り${posJP[r.toPos]}、`); 
            }
            else{
                result.push(`先ほど代走致しました ${r.from.lastName}${fromH} に代わりまして、${r.to.lastName}${toH} が入り${posJP[r.toPos]}、`); 
            }
      }
      else{  
        const line = `${posJP[r.fromPos]} ${r.from.lastName}${fromH} に代わりまして、${r.order}番に ${r.to.lastName}${r.to.firstName}${toH} が入り ${posJP[r.toPos]}へ`;
        result.push(index === allReplacements.length - 1 ? line + "。" : line + "、");
      }
    } else {
      const from = r.from;
      const to = r.to;
      const fromH = from.isFemale ? "さん" : "くん";
      const toH = to.isFemale ? "さん" : "くん";
      if((ChangeFlg === 1)||(ChangeFlg === 10)) {  //代打時の表示
         if(ChangeFlg === 1){
            const posName = jpPos(r.pos);            // ← "ピッチャー" 等
            result.push(`${posName} ${from.lastName}${fromH} に代わりまして、${to.lastName}${toH} がそのまま入り${posName}、`);
         }
         else{
            result.push(
            `先ほど代走致しました ${from.lastName}${fromH} に代わりまして、${to.lastName}${toH} がそのまま入り${posJP[r.pos]}、`);        
         }
      }
      else{
        const line = `${posJP[r.pos]}の ${from.lastName}${fromH} に代わりまして、${to.lastName}${to.firstName}${toH}`;
        result.push(index === allReplacements.length - 1 ? line + " が入ります。" : line + "、");
      }  
    }
  });

  // ✅ 守備位置変更パート
  const buildLinkedShiftOrder = (shifts: typeof shift) => {
    const fromToMap = new Map<string, typeof shift[0]>();
    const toSet = new Set<string>();
    const used = new Set<string>();

    shifts.forEach(r => {
      fromToMap.set(r.fromPos, r);
      toSet.add(r.toPos);
    });

    const start = posOrder
      .map(pos => shifts.find(r => r.fromPos === pos))
      .find(r => r !== undefined) ?? shifts[0];

    const chain: typeof shift = [];
    let current = start;
    while (current && !used.has(current.fromPos)) {
      chain.push(current);
      used.add(current.fromPos);
      current = shifts.find(r => r.fromPos === current.toPos && !used.has(r.fromPos));
    }

    shifts.forEach(r => {
      if (!used.has(r.fromPos)) chain.push(r);
    });

    return chain;
  };

  const sortedShift = buildLinkedShiftOrder(shift);

  sortedShift.forEach((r, index) => {
    const h = r.player.isFemale ? "さん" : "くん";
    const line = `${posJP[r.fromPos]}の ${r.player.lastName}${h} が ${posJP[r.toPos]} に`;
    result.push(index === sortedShift.length - 1 ? line + "入ります。" : line + "、");
  });

  // ✅ 最終打順一覧
  const allForDisplay: { order: number, text: string }[] = [];

  allReplacements.forEach(r => {
    const to = r.type === "mixed" ? r.to : r.to;
    const pos = r.type === "mixed" ? r.toPos : r.pos;
    const h = to.isFemale ? "さん" : "くん";
    allForDisplay.push({
      order: r.order,
      text: `${r.order}番 ${posJP[pos]} ${to.lastName}${to.firstName}${h} 背番号 ${to.number}`
    });
  });

  shift.forEach(r => {
    const h = r.player.isFemale ? "さん" : "くん";
    allForDisplay.push({
      order: r.order,
      text: `${r.order}番 ${posJP[r.toPos]} ${r.player.lastName}${h} `
    });
  });

  allForDisplay.sort((a, b) => a.order - b.order).forEach(r => result.push(r.text));
  if (ChangeFlg === 0) {  //代打時は非表示
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
  const replacedIndex = battingOrder.findIndex(entry => entry.id === replacedId);
  if (replacedIndex !== -1 && replacedId !== playerId) {
    const benchPlayer = teamPlayers.find((p) => p.id === playerId);
    if (benchPlayer) {
      setBattingReplacements((prev) => ({
        ...prev,
        [replacedIndex]: benchPlayer,
      }));
    }
  }

  // 🔄 交代取り消しのチェック（初期と一致していたら削除）
  setBattingReplacements((_) => {
    const rebuilt: { [idx: number]: Player } = {};

    battingOrder.forEach((starter, idx) => {
      const starterPos = getPositionName(initialAssignments, starter.id);   // もともとの守備位置
      const assignedId = newAssignments[starterPos];                       // 今そこにいる選手

      if (assignedId && assignedId !== starter.id) {
        const p = teamPlayers.find((pl) => pl.id === assignedId);
        if (p) rebuilt[idx] = p;                                            // 置き換え登録
      }
      // 同一人物なら登録しない（前回の置き換えも消える）
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

  // 代打・代走 → 控え交代の特殊パターン
  const isPinchHitterReplaced = entry.reason === "代打" ;

  return (
    <li key={`${index}-${currentId}`} className="border px-2 py-1 rounded bg-white">
      <div className="flex items-start gap-2">
        <span className="w-8">{index + 1}番</span>
        <div>
          {isPinchHitterReplaced ? (
            <>
              {/* 1行目に出場理由（例：代打） */}
              <div className="text-gray-500 text-sm">代打</div>
              {/* 2行目に新選手（赤文字） */}
              <div className="text-red-600 font-bold">
                {currentPos}　{currentPlayer.lastName}{currentPlayer.firstName} #{currentPlayer.number}
              </div>
            </>
          ) : playerChanged ? (
            <>
              {/* スタメンが交代された場合 */}
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

      if (isPinchHitter &&  currentPos) {
      // 🆕 replacedが未定義でも代打選手が存在するなら補完
        if (!replaced) {
          replaced = teamPlayers.find(p => p.id === entry.id);
        }
        console.log(`✅ [${index + 1}番] 条件一致（代打 ➡ 守備位置あり）`);
        return {
          key: `pinch-assigned-${index}`,
          type: 1,
          pos: currentPos,
          jsx: (
            <li key={`pinch-assigned-${index}`}>
              代打 ➡ {withMark(currentPos)}：{replaced.lastName}{replaced.firstName} #{replaced.number}
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
              代走 ➡ {currentPos ?? "―"}：{replaced.lastName}{replaced.firstName} #{replaced.number}
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
    <div className="bg-white rounded p-6 max-w-md w-full text-left">
      <div className="flex items-center mb-4">
        <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6" />        
      </div>

{/* ✅ アナウンス文言表示（ルビ対応） */}
{announcementText && (
  <div className="mt-4 px-4 py-3 border rounded bg-white">
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