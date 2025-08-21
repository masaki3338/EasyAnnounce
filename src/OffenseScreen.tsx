import React, { useState, useEffect, useRef, useMemo } from "react";

import localForage from "localforage";

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDrag, useDrop } from "react-dnd";
import { useNavigate } from "react-router-dom";

type OffenseScreenProps = {
  onSwitchToDefense: () => void;
  onGoToSeatIntroduction: () => void;
  onBack?: () => void;
};

type MatchInfo = {
  opponentTeam: string;
  inning?: number;
  isTop?: boolean;
  isDefense?: boolean;
  isHome?: boolean; // ✅ ←追加
};



const DraggablePlayer = ({ player }: { player: any }) => {
  const [, drag] = useDrag({
    type: "player",
    item: { player },
  });
  return (
    <div
      ref={drag}
      className="cursor-pointer hover:bg-gray-100 border p-2 rounded bg-white"
    >
      {player.lastName} {player.firstName} #{player.number}
    </div>
  );
};

// ⬇️ ドロップ先（1塁・2塁・3塁ランナー）
const DropTarget = ({ base, runnerAssignments, replacedRunners, setRunnerAssignments, setReplacedRunners }: any) => {
  const [, drop] = useDrop({
    accept: "player",
    drop: (item: any) => {
      const replaced = runnerAssignments[base];
      setRunnerAssignments((prev: any) => ({ ...prev, [base]: item.player }));
      setReplacedRunners((prev: any) => ({ ...prev, [base]: replaced || null }));
    },
  });

  const runner = runnerAssignments[base];
  const replaced = replacedRunners[base];

  return (
    <div ref={drop} className="p-2 border rounded bg-gray-100 min-h-[60px]">
      <div className="text-lg font-bold text-red-600">{base}ランナー</div>
      {replaced && (
        <div className="line-through text-black">
          {replaced.lastName} {replaced.firstName} #{replaced.number}
        </div>
      )}
      {runner && (
        <div className="text-red-600">
          {runner.lastName} {runner.firstName} #{runner.number}
        </div>
      )}
    </div>
  );
};

const positionNames: { [key: string]: string } = {
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



//const OffenseScreen: React.FC<OffenseScreenProps> = ({ onSwitchToDefense, onBack }) => {
const OffenseScreen: React.FC<OffenseScreenProps> = ({
  onSwitchToDefense,
  onGoToSeatIntroduction, // ← 追加！！
  matchInfo,
}) => {  
  const [players, setPlayers] = useState<any[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [battingOrder, setBattingOrder] = useState<
    { id: number; reason: string }[]
  >([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [currentBatterIndex, setCurrentBatterIndex] = useState(0);
  const [announcement, setAnnouncement] = useState<React.ReactNode>(null);
const [scores, setScores] = useState<{ [inning: number]: { top: number; bottom: number } }>({});
const [isLeadingBatter, setIsLeadingBatter] = useState(true);
const [announcedPlayerIds, setAnnouncedPlayerIds] = useState<number[]>([]);
const [substitutedIndices, setSubstitutedIndices] = useState<number[]>([]);
const [selectedRunnerIndex, setSelectedRunnerIndex] = useState<number | null>(null);
const [selectedSubRunner, setSelectedSubRunner] = useState<any | null>(null);
const [selectedBase, setSelectedBase] = useState<"1塁" | "2塁" | "3塁" | null>(null);
  const [teamName, setTeamName] = useState("");
  const [opponentTeam, setOpponentTeam] = useState("");
  const [inning, setInning] = useState(1);
  const [isTop, setIsTop] = useState(true);
  const [isHome, setIsHome] = useState(false); // 自チームが後攻かどうか
const [showGroundPopup, setShowGroundPopup] = useState(false);
const [pendingGroundPopup, setPendingGroundPopup] = useState(false);


// 🔸 DH解除モーダル表示フラグ
const [showDhDisableModal, setShowDhDisableModal] = useState(false);
// 現在DHが有効？
const dhActive = Boolean(assignments?.["指"]);
// 現在の投手ID
const pitcherId = typeof assignments?.["投"] === "number" ? (assignments["投"] as number) : null;
// DH選手ID
const dhBatterId = typeof assignments?.["指"] === "number" ? (assignments["指"] as number) : null;

// DHの打順インデックス
const dhOrderIndex = useMemo(
  () => (dhBatterId != null ? battingOrder.findIndex(e => e.id === dhBatterId) : -1),
  [battingOrder, dhBatterId]
);

// 「今の打者がDH本人か？」
const isDhTurn = dhActive && dhOrderIndex !== -1 && currentBatterIndex === dhOrderIndex;

  const [startTime, setStartTime] = useState<string | null>(null);

// 🔸 リエントリー用 state
const [showReEntryModal, setShowReEntryModal] = useState(false);
const [reEntryFromPlayer, setReEntryFromPlayer] = useState<any|null>(null); // Aくん（今いる選手）
const [reEntryTargetPlayer, setReEntryTargetPlayer] = useState<any|null>(null); // Bくん（戻す元スタメン）
const [reEntryOrder1, setReEntryOrder1] = useState<number|null>(null); // 1始まりの打順
const [noReEntryMessage, setNoReEntryMessage] = useState<string>("");

// 🔸 ルビ整形
const rubyFull = (p: any) =>
  `<ruby>${p?.lastName ?? ""}<rt>${p?.lastNameKana ?? ""}</rt></ruby>` +
  `<ruby>${p?.firstName ?? ""}<rt>${p?.firstNameKana ?? ""}</rt></ruby>`;
const rubyLast = (p: any) =>
  `<ruby>${p?.lastName ?? ""}<rt>${p?.lastNameKana ?? ""}</rt></ruby>`;

const headAnnounceKeyRef = useRef<string>("");

// TTS用にHTMLをプレーンテキスト化（rubyは<rt>だけ残す）
const normalizeForTTS = (input: string) => {
  if (!input) return "";
  let t = input;

  // 典型: <ruby>山田<rt>やまだ</rt></ruby> → やまだ
  t = t.replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gms, "$2");

  // rbタグ（使っていれば）: <rb>山田</rb><rt>やまだ</rt> の保険
  t = t.replace(/<\/?rb>/g, "").replace(/<\/?rt>/g, "");

  // 残ったタグは全除去
  t = t.replace(/<[^>]+>/g, "");

  // 連続空白を1つに
  t = t.replace(/\s+/g, " ").trim();

  // 読み固定が必要な語（必要に応じて追加）
  t = t.replace(/投球数/g, "とうきゅうすう");

  return t;
};

// 🔸 現在の打順に対してリエントリー対象（元スタメンで退場中）を探す
const findReentryCandidateForCurrentSpot = () => {
  console.log("🔍 リエントリー対象判定開始 ====================");

  // 現在の打順（1始まり）
  const order1 = (currentBatterIndex % battingOrder.length) + 1;
  console.log("現在の打順:", order1);

  // 今その枠に入っている「Aくん」
  const currentEntry = battingOrder[currentBatterIndex];
  const A = currentEntry ? getPlayer(currentEntry.id) : null;
  console.log("現在の枠にいる選手 A:", A);

  // usedPlayerInfo の中から「wasStarter && order一致」を探す
  let B: any | null = null;
  Object.entries(usedPlayerInfo || {}).forEach(([starterId, info]: any) => {
    console.log(`候補チェック: ID=${starterId}`, info);
    if (info?.wasStarter && info?.order === order1) {
      const candidate = getPlayer(Number(starterId));
      console.log(" → 打順一致＆wasStarter=true の候補:", candidate);
      if (candidate) B = candidate;
    }
  });

  // 打順・守備にいないか確認
  const isInBatting = (pid: number) => battingOrder.some(e => e.id === pid);
  const isInDefense = (pid: number) => Object.values(assignments || {}).some(id => id === pid);

  if (B) {
    console.log("B候補:", B);
    console.log("打順にいる？", isInBatting(B.id));
    console.log("守備にいる？", isInDefense(B.id));
  }

  if (B && !isInBatting(B.id) && !isInDefense(B.id)) {
    console.log("✅ リエントリー対象あり！");
    return { A, B, order1 };
  }
  console.log("❌ リエントリー対象なし");
  return { A, B: null, order1 };
};



  const handleStartGame = () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
    setStartTime(timeString);
    localForage.setItem("startTime", timeString);
    setGameStartTime(timeString);
    alert(`試合開始時間を記録しました: ${timeString}`);
  };
  const handleGameStart = () => {
    const now = new Date();
    const formatted = `${now.getHours()}時${now.getMinutes()}分`;
    setGameStartTime(formatted);
    localForage.setItem("gameStartTime", formatted);
  };
  const hasShownStartTimePopup = useRef(false);

  const [gameStartTime, setGameStartTime] = useState<string | null>(null);
  const [showStartTimePopup, setShowStartTimePopup] = useState(false);

  const [announcedIds, setAnnouncedIds] = useState<number[]>([]);

  const [lastPinchAnnouncement, setLastPinchAnnouncement] = useState<React.ReactNode | null>(null);

  // 🔹 通常アナウンスでは 代打/代走 を非表示にする
const displayReasonForLive = (reason?: string) =>
  (reason === "代打" || reason === "代走") ? "" : (reason ?? "");

const [selectedReturnPlayer, setSelectedReturnPlayer] = useState<any|null>(null);

// 初期読み込み（初回レンダリング時）
useEffect(() => {
  localForage.getItem<number[]>("announcedIds").then((saved) => {
    if (Array.isArray(saved)) {
      setAnnouncedIds(saved);
    }
  });
}, []);

const toggleAnnounced = (id: number) => {
  setAnnouncedIds((prev) => {
    const updated = prev.includes(id)
      ? prev.filter((i) => i !== id)
      : [...prev, id];
    localForage.setItem("announcedIds", updated); // 永続化
    return updated;
  });
};
const [checkedIds, setCheckedIds] = useState<number[]>([]);
// ✅ チェック状態を初期読み込み
useEffect(() => {
  localForage.getItem<number[]>("checkedIds").then((saved) => {
    if (Array.isArray(saved)) {
      setCheckedIds(saved);
    }
  });
}, []);

// ✅ チェック状態を切り替えて永続化
const toggleChecked = (id: number) => {
  setCheckedIds((prev) => {
    const updated = prev.includes(id)
      ? prev.filter((x) => x !== id)
      : [...prev, id];
    localForage.setItem("checkedIds", updated); // 永続化
    return updated;
  });
};


// コンポーネント関数内に以下を追加
const foulRef = useRef<SpeechSynthesisUtterance | null>(null);

const handleFoulRead = () => {
  if (!window.speechSynthesis) return;
  const text = "ファウルボールの行方には十分ご注意ください。";
  const utterance = new SpeechSynthesisUtterance(text);
  foulRef.current = utterance;
  window.speechSynthesis.speak(utterance);
};

const handleFoulStop = () => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
};

  const [usedPlayerInfo, setUsedPlayerInfo] = useState<Record<number, any>>({});
    useEffect(() => {
    const loadUsedInfo = async () => {
      const info = await localForage.getItem<Record<number, any>>("usedPlayerInfo");
      if (info) {
        setUsedPlayerInfo(info);
        console.log("✅ 読み込んだ usedPlayerInfo:", info);
      }
    };
    loadUsedInfo();
  }, []);

  const [showDefensePrompt, setShowDefensePrompt] = useState(false);

  useEffect(() => {
    localForage.setItem("lastGameScreen", "offense");
    const loadData = async () => {
      const team = await localForage.getItem("team");
      const order = await localForage.getItem("battingOrder");
      const lineup = await localForage.getItem("lineupAssignments");
      const matchInfo = await localForage.getItem<MatchInfo>("matchInfo");
        const loadBattingOrder = async () => {
    const order = await localForage.getItem<number[]>("battingOrder");
    if (order) setBattingOrder(order);
  };
  //loadBattingOrder();



if (team && typeof team === "object") {
  const all = (team as any).players || [];
  setAllPlayers(all);
  setPlayers(all);
  setTeamName((team as any).name || "");

  // 打順に載っている9人
  const starterIds = new Set(
    (order as { id: number; reason: string }[]).map(e => e.id)
  );

  // ✅ DH稼働中なら「投手」もスタメン扱いに含める
  const dhActive = Boolean((lineup as any)?.["指"]);
  const pitcherStarterId = (lineup as any)?.["投"];
  if (dhActive && typeof pitcherStarterId === "number") {
    starterIds.add(pitcherStarterId);
  }

  const benchOutIds: number[] = await localForage.getItem("benchOutIds") || [];

  const bench = all.filter((p: any) =>
    !starterIds.has(p.id) && !benchOutIds.includes(p.id)
  );

  setBenchPlayers(bench);
}


      if (order && Array.isArray(order)) {
        setBattingOrder(order as { id: number; reason: string }[]);

        // ✅ 前回の打者を取得して次の先頭打者に設定
        const lastBatter = await localForage.getItem<number>("lastBatterIndex");
        if (lastBatter !== null && typeof lastBatter === "number" && order.length > 0) {
          const nextBatterIndex = (lastBatter) % order.length;
          setCurrentBatterIndex(nextBatterIndex);
          setIsLeadingBatter(true); // 先頭打者として認識
        }
      }

      if (lineup && typeof lineup === "object") {
        setAssignments(lineup as { [pos: string]: number | null });
      }
      if (matchInfo) {
        setOpponentTeam(matchInfo.opponentTeam || "");
        setInning(matchInfo.inning || 1);
        setIsTop(matchInfo.isTop ?? true);
        setIsHome(matchInfo.isHome ?? false);
      }
    
      const savedScores = await localForage.getItem("scores");
      if (savedScores && typeof savedScores === "object") {
        setScores(savedScores as any);
      }
      const savedAnnouncedIds = await localForage.getItem<number[]>("announcedPlayerIds");
      if (savedAnnouncedIds) setAnnouncedPlayerIds(savedAnnouncedIds);
    };
    loadData();
  }, []);

const [showModal, setShowModal] = useState(false);
const [showScorePopup, setShowScorePopup] = useState(false);
const [shouldNavigateAfterPopup, setShouldNavigateAfterPopup] = useState(false);
const [popupMessage, setPopupMessage] = useState("");
const [inputScore, setInputScore] = useState("");
const [editInning, setEditInning] = useState<number | null>(null);
const [editTopBottom, setEditTopBottom] = useState<"top" | "bottom" | null>(null);
const [showSubModal, setShowSubModal] = useState(false);
const [selectedSubPlayer, setSelectedSubPlayer] = useState<any | null>(null);
const [benchPlayers, setBenchPlayers] = useState<any[]>([]);
// いま守備に就いている選手IDの集合
const onFieldIds = useMemo(() => {
  return new Set(
    Object.values(assignments).filter((v): v is number => typeof v === "number")
  );
}, [assignments]);

// 「出場済み」と見なす選手IDの集合（守備に就いている・打順に載っている・代打/代走も含む）
const playedIds = useMemo(() => {
  const s = new Set<number>();
  onFieldIds.forEach((id) => s.add(id));                 // 守備で出場中
  (battingOrder || []).forEach((e) => e?.id != null && s.add(e.id)); // 打順に載っている
  const u = (usedPlayerInfo as Record<number, { subId?: number }>) || {};
  Object.entries(u).forEach(([origIdStr, info]) => {     // 代打を出された元選手＆途中出場側も出場済みに
    const origId = Number(origIdStr);
    if (!Number.isNaN(origId)) s.add(origId);
    if (typeof info?.subId === "number") s.add(info.subId);
  });
  return s;
}, [onFieldIds, battingOrder, usedPlayerInfo]);

// ベンチ選手を「出場可能」と「出場済み」に分割
// ベンチ選手を「出場可能」と「出場済み」に分割（出場経験/現在出場中を考慮）
const { activeBench, retiredBench } = useMemo(() => {
  const active: any[] = [];
  const retired: any[] = [];
  benchPlayers.forEach((p) => {
    const nowInBatting = (battingOrder || []).some(e => e?.id === p.id);
    const nowOnField   = onFieldIds.has(p.id);
    const hasPlayed    = playedIds.has(p.id) || nowInBatting || nowOnField;
    (hasPlayed ? retired : active).push(p);
  });
  return { activeBench: active, retiredBench: retired };
}, [benchPlayers, playedIds, onFieldIds, battingOrder]);


const [showRunnerModal, setShowRunnerModal] = useState(false);
const [isRunnerConfirmed, setIsRunnerConfirmed] = useState(false);
const [runnerAnnouncement, setRunnerAnnouncement] = useState<string[]>([]);
const [runnerAssignments, setRunnerAssignments] = useState<{ [base: string]: any | null }>({
  "1塁": null,
  "2塁": null,
  "3塁": null,
});
const [replacedRunners, setReplacedRunners] = useState<{ [base: string]: any | null }>({});
// どの塁で「臨時代走」チェックが入っているかを記録
const [tempRunnerFlags, setTempRunnerFlags] = useState<Record<string, boolean>>({});
// Step3 で選んだ代走候補（塁ごと）
const [selectedRunnerByBase, setSelectedRunnerByBase] = useState<Record<string, Player | null>>({});
// アナウンスの「元ランナー名」（塁ごと） ex: "山田やまだ太郎たろうくん"
const [fromNameByBase, setFromNameByBase] = useState<Record<string, string>>({});
// 画面に出すアナウンス文言プレビュー（Step3で即反映）
const [runnerAnnouncementPreview, setRunnerAnnouncementPreview] = useState<string>("");

// base: "1塁"/"2塁"/"3塁" など、fromName: "〇〇くん" or ""、to: 代走に入る選手
const makeRunnerAnnounce = (base: string, fromName: string, to: Player | null, isTemp: boolean): string => {
  if (!to) return "";
  const toNameFull = `${to.lastName}${to.firstName}くん`;
  const toNameLast = `${to.lastName}くん`;
  const baseKanji = base.replace("1", "一").replace("2", "二").replace("3", "三");
  const prefix = `${baseKanji}塁ランナー`;

  if (isTemp) {
    // 例）「一塁ランナー〇〇くんに代わりまして 臨時代走、▲▲君、臨時代走は▲▲君。」
    return `${prefix}${fromName ? fromName + "に" : ""}代わりまして 臨時代走、${toNameFull}、臨時代走は ${toNameLast}。`;
  }
  // 通常代走
  return `${prefix}${fromName ? fromName + "に" : ""}代わりまして、${toNameFull}、${prefix}は ${toNameLast}、背番号 ${to.number}。`;
};

const handleScoreInput = (digit: string) => {
  if (inputScore.length < 2) {
    setInputScore(prev => prev + digit);
  }
};


const confirmScore = async () => {
  const score = parseInt(inputScore || "0", 10);
  const updatedScores = { ...scores };

  // ✅ 編集モード時
  if (editInning !== null && editTopBottom !== null) {
    const index = editInning - 1;
    if (!updatedScores[index]) {
      updatedScores[index] = { top: 0, bottom: 0 };
    }
    updatedScores[index][editTopBottom] = score;

    await localForage.setItem("scores", updatedScores);
    setScores(updatedScores);
    setInputScore("");
    setShowModal(false);
    setEditInning(null);
    setEditTopBottom(null);
    return;
  }

  // ✅ 通常モード（イニング終了処理）
  const index = inning - 1;
  if (!updatedScores[index]) {
    updatedScores[index] = { top: 0, bottom: 0 };
  }

  if (!isHome) {
    updatedScores[index].top = score;
  } else {
    updatedScores[index].bottom = score;
  }

  await localForage.setItem("scores", updatedScores);
  setScores(updatedScores);
  setInputScore("");
  setShowModal(false);
  await localForage.setItem("lastBatterIndex", currentBatterIndex);

  if (isTop) {
    setIsTop(false);
    await localForage.setItem("matchInfo", {
      opponentTeam,
      inning,
      isTop: false,
      isHome,
    });
  } else {
    const nextInning = inning + 1;
    setIsTop(true);
    setInning(nextInning);
    await localForage.setItem("matchInfo", {
      opponentTeam,
      inning: nextInning,
      isTop: true,
      isHome,
    });
  }

  if (score > 0) {
    setPopupMessage(`${teamName}、この回の得点は${score}点です。`);
    if (isHome && inning === 4 && !isTop) setPendingGroundPopup(true);
    setShowScorePopup(true);
  } else {
    if (isHome && inning === 4 && !isTop) {
      setShowGroundPopup(true);
    } else if (inning === 1 && isTop) {
      onGoToSeatIntroduction();
    } else {
      onSwitchToDefense();
    }
  }
};





const getPlayer = (id: number) =>
  players.find((p) => p.id === id) || allPlayers.find((p) => p.id === id);
    // 位置ラベル（守備・代打・(臨時)代走）を一元判定
// 位置ラベル（守備・代打・(臨時)代走）を一元判定
// 守備位置 or 代打/代走/臨時代走 の表示用
// 守備位置 or 代打/代走/臨時代走 の表示用
// 守備位置 or 代打/代走/臨時代走 の表示用
const getPosition = (id: number): string | null => {
  // 1) 純粋な守備割当（IDは数値化して比較：保存時に文字列化していても拾える）
  const posFromDefense =
    Object.keys(assignments).find(
      (k) => Number((assignments as any)[k]) === Number(id)
    ) ?? null;

  // 2) いま塁上に「代走として」出ているか
  // runnerAssignments は { base: Player } なので v?.id で比較する
  const isRunnerNow = Object.values(runnerAssignments || {}).some(
    (v: any) => v?.id === id
  );
  if (isRunnerNow) {
    // usedPlayerInfo で理由を確認（臨時代走を最優先）
    const info = Object.values(usedPlayerInfo as any).find(
      (x: any) =>
        x?.subId === id && (x?.reason === "臨時代走" || x?.reason === "代走")
    ) as any | undefined;
    return info?.reason === "臨時代走" ? "臨時代走" : "代走";
  }

  // 3) 打順側の理由で表示（ここに "臨時代走" 分岐を追加）
  const reasonInOrder = battingOrder.find((e) => e.id === id)?.reason;
  if (reasonInOrder === "代打") return "代打";
  if (reasonInOrder === "臨時代走") return "臨時代走";
  if (reasonInOrder === "代走") {
    // usedPlayerInfo に「臨時代走」があれば上書き
    const info = Object.values(usedPlayerInfo as any).find(
      (x: any) => x?.subId === id && x?.reason === "臨時代走"
    );
    return info ? "臨時代走" : "代走";
  }

  // 4) どれでもなければ守備位置
  return posFromDefense;
};







const getFullName = (player: Player) => {
  return `${player.lastName ?? ""}${player.firstName ?? ""}`;
};

const getAnnouncementName = (player: Player) => {
  return announcedIds.includes(player.id)
    ? player.lastName ?? ""
    : `${player.lastName ?? ""}${player.firstName ?? ""}`;
};

const announce = (text: string | string[]) => {
  const joined = Array.isArray(text) ? text.join("、") : text;
  const plain = normalizeForTTS(joined);   // ★ ruby→かな、タグ除去、用語の読み補正
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(plain);
  utter.lang = "ja-JP";
  speechSynthesis.speak(utter);
};

const handleNext = () => {  

  const next = (currentBatterIndex + 1) % battingOrder.length;
// ✅ 2人目の打者の前かつ未表示ならポップアップを表示
  if (next === 1 && gameStartTime && !hasShownStartTimePopup.current) {
    setShowStartTimePopup(true);
    hasShownStartTimePopup.current = true; // ✅ 表示済みに設定
  }

  setCurrentBatterIndex(next);
  setIsLeadingBatter(false);

  const currentEntry = battingOrder[currentBatterIndex];
  if (currentEntry) {
    if (!checkedIds.includes(currentEntry.id)) {
      toggleChecked(currentEntry.id); // 未チェックの時だけチェックを追加
    }
  }

  const nextIndex = (currentBatterIndex + 1) % battingOrder.length;
  setCurrentBatterIndex(nextIndex);
  setIsLeadingBatter(false);
};


const handlePrev = () => {
  const prev = (currentBatterIndex - 1 + battingOrder.length) % battingOrder.length;
  setCurrentBatterIndex(prev);
  setIsLeadingBatter(false); // ⬅ 追加
};

const updateAnnouncement = () => {
  const entry = battingOrder[currentBatterIndex];
  const player = getPlayer(entry?.id);
  const pos = getPosition(entry?.id);

  if (player && pos) {
    const number = player.number;
    const honorific = player?.isFemale ? "さん" : "くん";
    const posName = pos ? (positionNames[pos] ?? pos) : "";

    const isChecked = checkedIds.includes(player.id);

    // 👇 アナウンス用ふりがな（チェック済み → 苗字のみ、未チェック → フルネーム）
    const displayRuby = isChecked ? (
      <ruby>{player.lastName}<rt>{player.lastNameKana}</rt></ruby>
    ) : (
      <>
        <ruby>{player.lastName}<rt>{player.lastNameKana}</rt></ruby>
        <ruby>{player.firstName}<rt>{player.firstNameKana}</rt></ruby>
      </>
    );
    const displayRuby2 = isChecked ? (
      <ruby>{player.lastName}<rt>{player.lastNameKana}</rt></ruby>
    ) : (
      <>
        <ruby>{player.lastName}<rt>{player.lastNameKana}</rt></ruby>
      </>
    );
    let lines: React.ReactNode[] = [];

    if (isLeadingBatter) {
      lines.push(
        <div>{`${inning}回${isTop ? "表" : "裏"}、${teamName}の攻撃は、`}</div>
      );
    }

    if (!isChecked) {
      lines.push(
        <div>
          {currentBatterIndex + 1}番 {posName} {displayRuby}
          {honorific}、{posName} {displayRuby2}
          {honorific}、背番号{number}。
        </div>
      );
    } else {
      lines.push(
        <div>
          {currentBatterIndex + 1}番 {posName} {displayRuby}
          {honorific}、背番号{number}。
        </div>
      );
    }

    setAnnouncement(<>{lines}</>);
  } else {
    //setAnnouncement("⚠️ アナウンスに必要な選手情報が見つかりません。");
    setAnnouncement("");
  }
};


const handleRead = async () => {
  const entry = battingOrder[currentBatterIndex]; // ✅ 修正
  const player = getPlayer(entry.id);             // ✅ 修正
  const pos = getPosition(entry.id);              // ✅ 修正

  if (player && pos) {
    const fullNameKana = `${player.lastNameKana || player.lastName}${player.firstNameKana || player.firstName}`;
    const lastNameKana = player.lastNameKana || player.lastName;
    const number = player.number;
    const honorific = player?.isFemale ? "さん" : "くん";
    const posName = pos;

    const isAnnouncedBefore = announcedPlayerIds.includes(entry.id);

    let text = "";

    if (!isAnnouncedBefore) {
      text = `${
        isLeadingBatter ? `${inning}回${isTop ? "表" : "裏"}、${teamName}の攻撃は、` : ""
      }${currentBatterIndex + 1}番 ${posName} ${fullNameKana}${honorific}、${posName} ${lastNameKana}${honorific}、背番号${number}。`;
    } else {
      text = `${currentBatterIndex + 1}番 ${posName} ${lastNameKana}${honorific}、背番号${number}。`;
    }

    announce(text);

    if (!isAnnouncedBefore) {
      const updated = [...announcedPlayerIds, entry.id];
      setAnnouncedPlayerIds(updated);
      await localForage.setItem("announcedPlayerIds", updated);
    }
  } else {
    //setAnnouncement("⚠️ アナウンスに必要な選手情報が見つかりません。");
    setAnnouncement("");
  }
};

// 音声読み上げ
const speakText = (text: string) => {
  const synth = window.speechSynthesis;
  if (synth.speaking) synth.cancel(); // 前の音声を止める
  const utter = new SpeechSynthesisUtterance(text);
  synth.speak(utter);
};

// 音声停止
const stopSpeech = () => {
  const synth = window.speechSynthesis;
  if (synth.speaking) synth.cancel();
};

useEffect(() => {
  updateAnnouncement(); // currentBatterIndexが変わるたびに実行
}, [currentBatterIndex]);

useEffect(() => {
  if (
    players.length > 0 &&
    battingOrder.length > 0 &&
    assignments &&
    teamName !== ""
  ) {
    updateAnnouncement();
  }
}, [players, battingOrder, assignments, teamName]);
   const status = (isHome && !isTop) || (!isHome && isTop) ? "攻撃中" : "守備中";

  return (
<DndProvider backend={HTML5Backend}>

  <div className="flex justify-end mb-2">


</div>
    <div className="max-w-4xl mx-auto p-4">
        <h2 className="text-xl font-bold mb-2">
          {teamName || '自チーム'} vs {opponentTeam || '対戦相手'}
        </h2>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <select value={inning} onChange={(e) => setInning(Number(e.target.value))}>
              {[...Array(9)].map((_, i) => (
                <option key={i} value={i + 1}>{i + 1}</option>
              ))}
            </select>
            <span>回</span>
            <select value={isTop ? "表" : "裏"} onChange={(e) => setIsTop(e.target.value === "表")}>
              <option value="表">表</option>
              <option value="裏">裏</option>
            </select>

          </div>
            {/* 試合開始ボタン */}
            {inning === 1 && isTop  && (
              <button
                className="bg-green-500 text-white font-bold py-2 px-4 rounded hover:bg-green-600"
                onClick={handleStartGame}
              >
                試合開始
              </button>
            )}

            {/* イニング終了ボタン */}
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1 bg-orange-700 text-white rounded"
            >
              イニング終了
            </button>
        </div>


 <table className="w-full border border-gray-400 text-center text-sm mb-6"> 
  <thead>
    <tr>
      <th className="border">回</th>
      {[...Array(9).keys()].map(i => (
        <th key={i} className="border">{i + 1}</th>
      ))}
      <th className="border">計</th>
    </tr>
  </thead>
  <tbody>
    {[
      { name: teamName || "自チーム", isMyTeam: true },
      { name: opponentTeam || "対戦相手", isMyTeam: false },
    ]
      /* 先攻／後攻で並び順を統一 */
      .sort((a, b) => {
        if (isHome) return a.isMyTeam ? 1 : -1;   // 後攻なら自チームを下段
        else        return a.isMyTeam ? -1 : 1;   // 先攻なら上段
      })
      .map((row, rowIdx) => (
        <tr key={rowIdx} className={row.isMyTeam ? "bg-gray-100" : ""}>
          <td className="border">{row.name}</td>
          {[...Array(9).keys()].map(i => {
            /* 表裏に応じてスコアを取り出す */
            const val = row.isMyTeam
              ? isHome ? scores[i]?.bottom : scores[i]?.top
              : isHome ? scores[i]?.top    : scores[i]?.bottom;

            /* 現在の回＋攻撃側セルをハイライト */
            const target = row.isMyTeam
              ? isHome ? "bottom" : "top"
              : isHome ? "top"    : "bottom";
            const isNow =
              i + 1 === inning && target === (isTop ? "top" : "bottom");

            return (
              <td
                key={i}
                className={`border text-center cursor-pointer hover:bg-gray-200 ${
                  isNow ? "bg-yellow-300 font-bold border-2 border-yellow-500" : ""
                }`}
                onClick={() => {
                  // ✅ 現在イニングまたは未来の回は編集禁止
                  if (isNow || i + 1 >= inning) return;
                  setEditInning(i + 1);
                  setEditTopBottom(target);
                  const existing = scores[i]?.[target];
                  setInputScore(existing !== undefined ? String(existing) : "");
                  setShowModal(true);
                }}
              >
                {isNow ? "" : (i + 1 > inning ? "" : val ?? "")}
              </td>
            );
          })}
          {/* ── 計 ── */}
          <td className="border font-bold">
            {Object.values(scores).reduce((sum, s) => {
              const v = row.isMyTeam
                ? isHome ? s.bottom ?? 0 : s.top ?? 0
                : isHome ? s.top ?? 0    : s.bottom ?? 0;
              return sum + v;
            }, 0)}
          </td>
        </tr>
      ))}
  </tbody>
</table>



{showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4">
      <h2 className="text-lg font-bold">得点を入力してください</h2>
      <div className="text-2xl border p-2 w-24 mx-auto">{inputScore || "0"}</div>
      <div className="grid grid-cols-3 gap-2">
        {[..."1234567890"].map((digit) => (
          <button
            key={digit}
            onClick={() => handleScoreInput(digit)}
            className="bg-blue-500 text-white p-2 rounded"
          >
            {digit}
          </button>
        ))}
      </div>
    <div className="flex justify-center gap-4 mt-4">
      <button
        onClick={confirmScore}
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        OK
      </button>
      <button
        onClick={() => setInputScore("")}
        className="bg-yellow-600 text-white px-4 py-2 rounded"
      >
        クリア
      </button>
      <button
        onClick={() => {
          setInputScore("");
          setShowModal(false);
        }}
        className="bg-gray-600 text-white px-4 py-2 rounded"
      >
        キャンセル
      </button>
    </div>
    </div>
    
  </div>
)}

    
<div className="space-y-1 text-sm font-bold text-gray-800">
{battingOrder.map((entry, idx) => {
  const player = getPlayer(entry.id);
  const isCurrent = idx === currentBatterIndex;
  const position = getPosition(entry.id);
  const positionLabel = position ?? "";
<input
  type="checkbox"
  checked={checkedIds.includes(entry.id)}
  onChange={() => toggleChecked(entry.id)}
  className="mr-2"
/>

  return (
    <div
      key={entry.id}
      onClick={() => {
        setCurrentBatterIndex(idx);
        setIsLeadingBatter(true);
      }}
      className={`px-2 py-0.5 border-b cursor-pointer ${
        isCurrent ? "bg-yellow-200" : ""
      }`}
    >
<div className="grid grid-cols-[50px_100px_150px_60px] items-center gap-2">
  <div>{idx + 1}番</div>
  <div>{positionLabel}</div>
  <div className="flex items-center gap-1">
    <input
      type="checkbox"
      checked={checkedIds.includes(entry.id)}
      onChange={() => toggleChecked(entry.id)}
      className="mr-2"
    />
    <ruby>
      {player?.lastName ?? "苗字"}
      {player?.lastNameKana && <rt>{player.lastNameKana}</rt>}
    </ruby>
    <ruby>
      {player?.firstName ?? "名前"}
      {player?.firstNameKana && <rt>{player.firstNameKana}</rt>}
    </ruby>
  </div>
  <div>#{player?.number ?? "番号"}</div>
</div>
    </div>
  );
})}

</div>

      <div className="flex justify-center gap-4 my-2">
        <button onClick={handlePrev} className="bg-green-500 text-white px-4 py-2 rounded">
          前の打者
        </button>
        <button onClick={handleNext} className="bg-green-500 text-white px-4 py-2 rounded">
          次の打者
        </button>
      </div>


{/* ⚠️ ファウルボール注意文（常時表示） */}

<div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
  <div className="flex items-center mb-2">
    <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mr-2" />
    <span className="text-red-600 font-bold whitespace-pre-line">
      ファウルボールの行方には十分ご注意ください。
    </span>
  </div>

  {/* ボタンを左寄せ */}
  <div className="mt-2 flex justify-start gap-4">
    <button
      onClick={handleFoulRead}
      className="bg-blue-600 text-white px-4 py-2 rounded"
    >
      読み上げ
    </button>
    <button
      onClick={handleFoulStop}
      className="bg-red-600 text-white px-4 py-2 rounded"
    >
      停止
    </button>
  </div>
</div>


      {isLeadingBatter && (
        <div className="flex items-center text-blue-600 font-bold mb-0">
          <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 text-sm font-semibold text-left">
            <span className="mr-2 text-2xl">⚠️</span> 攻撃回1人目のバッター紹介は、キャッチャーが2塁に送球後に🎤 
          </div>
        </div>
      )}

      <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
        <div className="flex items-center mb-2">
          <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mr-2" />
          <span className="text-red-600 font-bold whitespace-pre-line">
            {announcement || ""}
          </span>
        </div>
        <div className="flex gap-4">
          <button onClick={handleRead} className="bg-blue-600 text-white px-4 py-2 rounded">
            読み上げ
          </button>
          <button
            onClick={() => speechSynthesis.cancel()}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            停止
          </button>
        </div>
      </div>

<div className="flex justify-end space-x-2 mt-4">
  <button
    onClick={() => setShowRunnerModal(true)}
    className="bg-orange-600 text-white px-6 py-2 rounded"
  >
    代走
  </button>
  <button
    onClick={() => setShowSubModal(true)}
    className="bg-orange-600 text-white px-6 py-2 rounded"
  >
    代打
  </button>

<button
  onClick={() => {
    const { A, B, order1 } = findReentryCandidateForCurrentSpot();

    if (!B) {
      setNoReEntryMessage("この打順にリエントリー可能な選手はいません。");
      // シンプルにアラートで良ければ↓だけでも可
      alert("この打順にリエントリー可能な選手はいません。");
      return;
    }

    setReEntryFromPlayer(A || null);
    setReEntryTargetPlayer(B);
    setReEntryOrder1(order1);
    setShowReEntryModal(true);
  }}
  className="bg-purple-600 text-white px-6 py-2 rounded"
>
  リエントリー

</button>
{isDhTurn && (
  <button
    onClick={() => setShowDhDisableModal(true)}
    className="bg-gray-800 text-white px-6 py-2 rounded"
    disabled={!dhActive || !pitcherId}
  >
    DH解除
  </button>
)}


</div>


{showDhDisableModal && (() => {
  if (!dhActive || dhOrderIndex === -1 || !pitcherId) return null;

  const order1 = dhOrderIndex + 1;
  const p = getPlayer(pitcherId);
  if (!p) return null;

  const honor = p.isFemale ? "さん" : "くん";
  const line1 = "ただいまより、指名打者制を解除します。";
  const line2 = `${order1}番　ピッチャー　${p.lastName} ${p.firstName}${honor}　ピッチャー${p.lastName}${honor}　背番号${p.number}`;

  const speak = () => announce(`${line1}${line2}`);
  const stop  = () => speechSynthesis.cancel();

  const confirmDisableDH = async () => {
    // 1) 打順：DHの枠を「現在の投手」に置換
    const newOrder = [...battingOrder];
    newOrder[dhOrderIndex] = { id: pitcherId!, reason: "DH解除" };

    // 2) 守備：指名打者を無効化（=DHなし）
    const newAssignments = { ...assignments, 指: null };

    // 3) 反映＆保存（この画面で完結）
    setBattingOrder(newOrder);
    setAssignments(newAssignments);
    await localForage.setItem("battingOrder", newOrder);
    await localForage.setItem("lineupAssignments", newAssignments);
    await localForage.setItem("dhEnabledAtStart", false); // 守備画面でも“指”不可に

    // 4) ベンチ再計算（DH解除後は投手をスタメン集合に含めない）
    const all = allPlayers.length ? allPlayers : players;
    const starterIds = new Set(newOrder.map(e => e.id));
    const benchOutIds: number[] = (await localForage.getItem("benchOutIds")) || [];
    const newBench = all.filter((pp: any) => !starterIds.has(pp.id) && !benchOutIds.includes(pp.id));
    setBenchPlayers(newBench);

    setShowDhDisableModal(false);

    // もし今がDHの打席中なら、置換後の打者表示を最新化
    setCurrentBatterIndex(dhOrderIndex);
    setIsLeadingBatter(true);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4 max-w-xl w-full">
        <h2 className="text-xl font-bold">DH解除</h2>

        {/* アナウンス文言 */}
        <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
          <div className="absolute -top-4 left-4 text-2xl">🎤📢</div>
          <div className="whitespace-pre-line text-base font-bold leading-relaxed mt-2 ml-6">
            {line1}
            {"\n"}
            {line2}
          </div>
        </div>

        {/* 操作 */}
        <div className="flex flex-wrap gap-3 justify-center">
          <button onClick={speak} className="bg-blue-600 text-white px-4 py-2 rounded">読み上げ</button>
          <button onClick={stop}  className="bg-red-600  text-white px-4 py-2 rounded">停止</button>
          <button onClick={confirmDisableDH} className="bg-orange-600 text-white px-4 py-2 rounded">確定</button>
          <button onClick={() => setShowDhDisableModal(false)} className="bg-green-600 text-white px-4 py-2 rounded">キャンセル</button>
        </div>
      </div>
    </div>
  );
})()}


 {/* ✅ 得点ポップアップここに挿入 */}
{showScorePopup && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="border border-red-500 bg-red-200 p-6 rounded-lg shadow text-center text-xl text-red-600 font-bold space-y-4">
      <div className="flex items-center mb-4">
        <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6" />        
      </div>
      <p>{popupMessage}</p>
      <div className="flex justify-center gap-4">
        <button
          onClick={() => {
            const uttr = new SpeechSynthesisUtterance(popupMessage);
            speechSynthesis.speak(uttr);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          読み上げ
        </button>
        <button
          onClick={() => speechSynthesis.cancel()}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          停止
        </button>
<button
  onClick={() => {
    setShowScorePopup(false);
    if (pendingGroundPopup) {
      setPendingGroundPopup(false);
      setShowGroundPopup(true); // ✅ 得点ポップアップ閉じた後に表示！
    } else if (inning === 1 && isTop) {
      onGoToSeatIntroduction();
    } else {
      onSwitchToDefense();
    }
  }}
  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
>
  OK
</button>
      </div>
    </div>
  </div>
)}

{showDefensePrompt && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4 max-w-sm w-full">
      <h2 className="text-lg font-bold text-red-600">守備位置の設定</h2>
      <p>代打／代走で出場した選手の守備位置を設定してください。</p>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        onClick={() => {
          setShowDefensePrompt(false);
          onChangeDefense(); // モーダル経由で守備画面へ
        }}
      >
        OK
      </button>
    </div>
  </div>
)}

{showReEntryModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-gray-200 p-6 rounded-xl shadow-xl text-center max-w-3xl w-full space-y-6">
      <h2 className="text-3xl font-bold text-black">リエントリー</h2>

      {/* アナウンス表示（ルビ付き） */}
      <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
        <div className="absolute -top-4 left-4 text-2xl">🎤📢</div>
        <span
          className="whitespace-pre-line text-base font-bold text-red-700 leading-relaxed block mt-2 ml-6"
          dangerouslySetInnerHTML={{
            __html: `
            ${teamName || "自チーム"}、選手の交代をお知らせいたします。
            ${reEntryOrder1 ?? "?"}番 ${reEntryFromPlayer ? rubyLast(reEntryFromPlayer) : ""}${reEntryFromPlayer?.isFemale ? "さん" : "くん"} に代わりまして ${reEntryTargetPlayer ? rubyLast(reEntryTargetPlayer) : ""}${reEntryTargetPlayer?.isFemale ? "さん" : "くん"} がリエントリーで戻ります。
            バッターは ${reEntryTargetPlayer ? rubyLast(reEntryTargetPlayer) : ""}${reEntryTargetPlayer?.isFemale ? "さん" : "くん"}。
                        `.trim()
          }}
        />
      </div>

      {/* 操作 */}
      <div className="flex justify-center gap-3">
        <button
          onClick={() => {
            if (!reEntryTargetPlayer || reEntryOrder1 == null || !reEntryFromPlayer) return;
            const honorA = reEntryFromPlayer.isFemale ? "さん" : "くん";
            const honorB = reEntryTargetPlayer.isFemale ? "さん" : "くん";
            const kanaAFull = `${reEntryFromPlayer.lastNameKana || reEntryFromPlayer.lastName || ""}${reEntryFromPlayer.firstNameKana || reEntryFromPlayer.firstName || ""}`;
            const kanaALast = reEntryFromPlayer.lastNameKana || reEntryFromPlayer.lastName || "";
            const kanaBFull = `${reEntryTargetPlayer.lastNameKana || reEntryTargetPlayer.lastName || ""}${reEntryTargetPlayer.firstNameKana || reEntryTargetPlayer.firstName || ""}`;
            const kanaBLast = reEntryTargetPlayer.lastNameKana || reEntryTargetPlayer.lastName || "";
            announce(
              `${teamName || "自チーム"}、選手の交代をお知らせいたします。` +
              `${reEntryOrder1}番 ${kanaALast}${honorA} に代わりまして ` +
              `${kanaBLast}${honorB} がリエントリーで戻ります。` +
              `バッターは ${kanaBLast}${honorB}。`
            );
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          読み上げ
        </button>
        <button
          onClick={() => speechSynthesis.cancel()}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          停止
        </button>

        {/* 確定：メモリ更新（打順／守備位置／退場情報） */}
        <button
          onClick={async () => {
            if (!reEntryTargetPlayer || reEntryOrder1 == null) return;
            const idx = reEntryOrder1 - 1;

            // 1) 打順：元スタメン（B）で上書き（reason=リエントリー）
            const newOrder = [...battingOrder];
            newOrder[idx] = { id: reEntryTargetPlayer.id, reason: "リエントリー" };
            setBattingOrder(newOrder);
            await localForage.setItem("battingOrder", newOrder);

            // 2) 守備位置：今回は変更しない（オフェンス画面仕様）。必要ならここで assignments 更新。
            // 守備配置の現在値を取得
            const curAssignments =
              (await localForage.getItem<Record<string, number | null>>("lineupAssignments"))
              || assignments || {};
            const newAssignments = { ...curAssignments };

            // B（リエントリー対象）の元ポジションを取得
            const fromPos = (usedPlayerInfo?.[reEntryTargetPlayer.id]?.fromPos) as string | undefined;

            if (fromPos) {
              // 元ポジションにBを割り当て
              newAssignments[fromPos] = reEntryTargetPlayer.id;
            }

            // state とストレージを更新
            setAssignments(newAssignments);
            await localForage.setItem("lineupAssignments", newAssignments);

            // 3) 退場情報：Aは「退場として残す」/ 元スタメンBは「退場解除」（= usedPlayerInfo から削除）
            const newUsed = { ...(usedPlayerInfo || {}) };

            // Bの以前の記録（fromPosなど）を保険で拾っておく
            const prevB = (usedPlayerInfo || {})[reEntryTargetPlayer.id] as
              | { fromPos?: string; order?: number; subId?: number; wasStarter?: boolean }
              | undefined;

            // Aの fromPos を推定（Bの元ポジ or いまAが居た守備）
            const fromPosForA =
              prevB?.fromPos ||
              (Object.entries(newAssignments).find(([, id]) => id === reEntryFromPlayer?.id)?.[0] ?? "");

            // 🔴 A（交代で退場）をキーに退場記録を残す
            if (reEntryFromPlayer) {
              (newUsed as any)[reEntryFromPlayer.id] = {
                fromPos: fromPosForA,
                subId: reEntryTargetPlayer.id,     // AをBが置き換えた
                reason: "リエントリー",
                order: reEntryOrder1,              // 何番の話か
                wasStarter: false,
              };
            }

            // 🟢 B（元スタメン）は退場解除（＝usedから削除）
            delete (newUsed as any)[reEntryTargetPlayer.id];

            setUsedPlayerInfo(newUsed);
            await localForage.setItem("usedPlayerInfo", newUsed);


            // （任意）チーム配列にいなければ追加
            if (!players.some(p => p.id === reEntryTargetPlayer.id)) {
              setPlayers(prev => [...prev, reEntryTargetPlayer]);
            }

            // B をベンチから除外し、A を未登録ならベンチに追加
            setBenchPlayers(prev => {
              const withoutB = prev.filter(p => p.id !== reEntryTargetPlayer.id);
              if (reEntryFromPlayer && !withoutB.some(p => p.id === reEntryFromPlayer.id)) {
                return [...withoutB, reEntryFromPlayer];
              }
              return withoutB;
            });


            // 後片付け
            setShowReEntryModal(false);
            setReEntryFromPlayer(null);
            setReEntryTargetPlayer(null);
            setReEntryOrder1(null);
          }}
          className="bg-orange-600 text-white px-4 py-2 rounded"
        >
          確定
        </button>
        <button
          onClick={() => {
            setShowReEntryModal(false);
            setReEntryFromPlayer(null);
            setReEntryTargetPlayer(null);
            setReEntryOrder1(null);
          }}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
)}




{/* ✅ 代打　モーダル */}
{showSubModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-gray-200 p-6 rounded-xl shadow-xl text-center max-w-3xl w-full space-y-6">

      {/* タイトル */}
      <h2 className="text-3xl font-bold text-black">代打</h2>

      {/* 打者と代打選手を横並びで表示 */}
      <div className="flex flex-col lg:flex-row justify-center items-center gap-8">
        {/* 現打者（赤） */}
        <div className="text-red-600 font-bold text-xl">
          {currentBatterIndex + 1}番　
          {getPlayer(battingOrder[currentBatterIndex]?.id)?.lastName} {getPlayer(battingOrder[currentBatterIndex]?.id)?.firstName}　
          #{getPlayer(battingOrder[currentBatterIndex]?.id)?.number}
        </div>
        {/* 矢印 */}
        <div className="text-blue-600 text-3xl">⬅</div>
        {/* ベンチ（出場可能） */}
        <div className="w-full">
          <div className="text-sm font-bold text-gray-600 mb-1">控え選手（出場可能）</div>
          <div className="flex flex-wrap justify-center gap-2 mb-4 max-h-32 overflow-y-auto">
            {activeBench.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedSubPlayer(p)}
                className={`w-[22%] text-sm px-2 py-1 rounded border font-semibold text-center
                  ${selectedSubPlayer?.id === p.id
                    ? "bg-yellow-200 border-yellow-600 cursor-pointer"
                    : "bg-gray-100 border-gray-400 cursor-pointer"}`}
              >
                {p.lastName} {p.firstName} #{p.number}
              </div>
            ))}
            {activeBench.length === 0 && (
              <div className="text-sm text-gray-500">出場可能なベンチ選手がいません</div>
            )}
          </div>
        </div>
        {/* 出場済み選手（別セクション） */}
        {retiredBench.length > 0 && (
          <div className="w-full">
            <div className="text-sm font-bold text-gray-600 mb-1">出場済み選手（出場不可）</div>
            <div className="flex flex-wrap justify-center gap-2 max-h-32 overflow-y-auto">
              {retiredBench.map((p) => (
                <div
                  key={p.id}
                  className="w-[22%] text-sm px-2 py-1 rounded border font-semibold text-center
                            bg-gray-300 text-gray-500 cursor-not-allowed"
                  title="出場済みのため選択不可"
                >
                  {p.lastName} {p.firstName} #{p.number}
                </div>

              ))}
            </div>
          </div>
        )}
      </div>

      {/* アナウンス文（赤枠・マイク付き） */}
      <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
        <div className="absolute -top-4 left-4 text-2xl">🎤📢</div>
         
        <span className="whitespace-pre-line text-base font-bold text-red-700 leading-relaxed block mt-2 ml-6">
            {/* 先頭打者なら通常アナウンスの前置きを追加 */}
            {isLeadingBatter && (
              <>
                {`${inning}回${isTop ? "表" : "裏"}、${teamName}の攻撃は、`}
                <br />
              </>
            )}
            {currentBatterIndex + 1}番{" "}
            <ruby>
              {getPlayer(battingOrder[currentBatterIndex]?.id)?.lastName}
              <rt>{getPlayer(battingOrder[currentBatterIndex]?.id)?.lastNameKana}</rt>
            </ruby>{" "}
            {(getPlayer(battingOrder[currentBatterIndex]?.id)?.isFemale ? "さん" : "くん")} に代わりまして{" "}
            <ruby>
              {selectedSubPlayer?.lastName}
              <rt>{selectedSubPlayer?.lastNameKana}</rt>
            </ruby>{" "}
            <ruby>
              {selectedSubPlayer?.firstName}
              <rt>{selectedSubPlayer?.firstNameKana}</rt>
            </ruby>{" "}
            {(selectedSubPlayer?.isFemale ? "さん" : "くん")}、バッターは{" "}
            <ruby>
              {selectedSubPlayer?.lastName}
              <rt>{selectedSubPlayer?.lastNameKana}</rt>
            </ruby>{" "}
            {(selectedSubPlayer?.isFemale ? "さん" : "くん")}、背番号 {selectedSubPlayer?.number}
        </span>

        {/* 読み上げ・停止 */}
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={() => {
              const currentPlayer = getPlayer(battingOrder[currentBatterIndex]?.id);
              const sub = selectedSubPlayer;
              if (!currentPlayer || !sub) return;
              const kanaCurrent = currentPlayer.lastNameKana || currentPlayer.lastName || "";
              const kanaSubFull = `${sub.lastNameKana || sub.lastName || ""}${sub.firstNameKana || sub.firstName || ""}`;
              const kanaSubLast = sub.lastNameKana || sub.lastName || "";
              const honorific = sub.isFemale ? "さん" : "くん";
              const honorificBef = currentPlayer.isFemale ? "さん" : "くん";
              announce(
                `${currentBatterIndex + 1}番 ${kanaCurrent} ${honorificBef} に代わりまして、` +
                `${kanaSubFull} ${honorific}、バッターは ${kanaSubLast} ${honorific}、背番号 ${sub.number}`
              );
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            読み上げ
          </button>
          <button
            onClick={() => speechSynthesis.cancel()}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            停止
          </button>
        </div>
      </div>

      {/* 下部の確定・キャンセルボタン */}
      <div className="flex flex-col lg:flex-row justify-center gap-4 mt-2">
        <button
          onClick={async () => {
            // 2. UsedPlayerInfo に元選手情報を登録
            const replacedId = battingOrder[currentBatterIndex].id;
            const replaced = getPlayer(replacedId);
            const isStarter = battingOrder.find(e => e.id === replacedId)?.reason === "スタメン";

            if (replaced && selectedSubPlayer) {
              const usedInfo: Record<
                number,
                {
                  fromPos: string;
                  subId: number;
                  reason: "代打" | "代走" | "守備交代";
                  order: number;
                  wasStarter: boolean;
                }
              > = (await localForage.getItem("usedPlayerInfo")) || {};

              // ✅ フル→略称変換マップ
              const posMap: Record<string, string> = {
                "ピッチャー": "投", "キャッチャー": "捕", "ファースト": "一",
                "セカンド": "二", "サード": "三", "ショート": "遊",
                "レフト": "左", "センター": "中", "ライト": "右",
                "投": "投", "捕": "捕", "一": "一", "二": "二", "三": "三",
                "遊": "遊", "左": "左", "中": "中", "右": "右",
              };

              const fullFromPos = getPosition(replaced.id); // 例: "サード"
              const fromPos = posMap[fullFromPos ?? ""] ?? fullFromPos ?? "";

              usedInfo[replaced.id] = {
                fromPos,                        // 守備位置（略称）
                subId: selectedSubPlayer.id,   // 交代で入った選手
                reason: "代打",                 // ← 今回は代打
                order: currentBatterIndex + 1, // 打順（1始まり）
                wasStarter: isStarter,         // スタメンかどうか
              };

              await localForage.setItem("usedPlayerInfo", usedInfo);
              setUsedPlayerInfo(usedInfo); // ← 明示的に state 更新
                console.log("✅ 攻撃画面で登録された usedPlayerInfo：", usedInfo);
            }

            if (selectedSubPlayer) {
              // 1. 打順の入れ替え
              const newOrder = [...battingOrder];
              newOrder[currentBatterIndex] = {
                id: selectedSubPlayer.id,
                reason: "代打",
            };

            setBattingOrder(newOrder);
            await localForage.setItem("battingOrder", newOrder); // ✅ これでOK

            if (!players.some(p => p.id === selectedSubPlayer.id)) {
              setPlayers(prev => [...prev, selectedSubPlayer]);
            }

            if (!allPlayers.some(p => p.id === selectedSubPlayer.id)) {
              setAllPlayers(prev => [...prev, selectedSubPlayer]);
            }

            if (!substitutedIndices.includes(currentBatterIndex)) {
              setSubstitutedIndices(prev => [...prev, currentBatterIndex]);
            }
            setShowSubModal(false);
            }
          }}
          className="bg-orange-600 text-white px-6 py-2 rounded"
        >
          確定
        </button>
        <button
          onClick={() => setShowSubModal(false)}
          className="bg-green-600 text-white px-6 py-2 rounded"
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
)}


{/* ✅ 代走　モーダル */}
{showRunnerModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center overflow-y-auto p-2">
    <div className="bg-white p-4 rounded-xl shadow-xl w-full max-w-md space-y-4">
      <h2 className="text-2xl font-bold text-center">代走</h2>
      {/* === STEP 1 === */}
      {selectedRunnerIndex === null && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold mb-2 text-center">代走対象のランナーを選択</h3>
          <div className="space-y-2">
            {battingOrder.map((entry, index) => {
              const player = getPlayer(entry.id);
              const isUsed = Object.values(replacedRunners).some(r => r?.id === player?.id);
              if (!player) return null;
              return (
                <div
                  key={entry.id}
                  className={`border p-2 rounded cursor-pointer ${
                    selectedRunnerIndex === index ? "bg-yellow-100" : ""
                  } ${isUsed ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "hover:bg-gray-100"}`}
                  onClick={() => !isUsed && setSelectedRunnerIndex(index)}
                >
                  {index + 1}番 {player.lastName} {player.firstName} #{player.number}
                </div>
              );
            })}
          </div>

          {/* ✅ キャンセルボタン追加 */}
          <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowRunnerModal(false);
                  setSelectedRunnerIndex(null);
                  setSelectedBase(null);
                  setSelectedSubRunner(null);
                  setRunnerAssignments({ "1塁": null, "2塁": null, "3塁": null });
                  setReplacedRunners({ "1塁": null, "2塁": null, "3塁": null });
                  setRunnerAnnouncement([]);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                キャンセル
              </button>
          </div>
        </div>
      )}

      {/* === STEP 2 === */}
      {selectedRunnerIndex !== null && selectedBase === null && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-center">ランナーはどの塁にいますか？</h3>
          <div className="flex justify-center gap-2">
            {["1塁", "2塁", "3塁"].map((base) => (
              <button
                key={base}
                disabled={runnerAssignments[base] !== null}
                onClick={() => setSelectedBase(base as "1塁" | "2塁" | "3塁")}
                className={`px-4 py-2 rounded border ${
                  runnerAssignments[base]
                    ? "bg-gray-300 cursor-not-allowed text-gray-500"
                    : "bg-white hover:bg-gray-100"
                }`}
              >
                {base}
              </button>
            ))}
          </div>
          <div className="flex justify-center">
              <button
                onClick={() => {
                  setShowRunnerModal(false);
                  setSelectedRunnerIndex(null);
                  setSelectedBase(null);
                  setSelectedSubRunner(null);
                  setRunnerAssignments({ "1塁": null, "2塁": null, "3塁": null });
                  setReplacedRunners({ "1塁": null, "2塁": null, "3塁": null });
                  setRunnerAnnouncement([]);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                キャンセル
              </button>
          </div>
        </div>
      )}

      {/* STEP3: 代走選手選択 */}
      {/* 臨時代走チェック */}
      {selectedBase && (
        <div className="mb-3">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!tempRunnerFlags[selectedBase]}
              onChange={(e) => {
                const checked = e.target.checked;
                const base = selectedBase!; // STEP3 でのみ表示される想定

                // 1) フラグ更新
                setTempRunnerFlags((prev) => ({
                  ...prev,
                  [base]: checked,
                }));

                // 2) プレビュー文言を即時更新
                const runnerId =
                  selectedRunnerIndex != null ? battingOrder[selectedRunnerIndex]?.id : undefined;
                const replaced = runnerId ? getPlayer(runnerId) : null;                  // 元ランナー
                const sub = runnerAssignments[base];                                     // 代走に出す選手（未選択なら null）

                setRunnerAnnouncement((prev) => {
                  const prefix = `${base}ランナー`;
                  // 同じ塁の文言だけ置き換える
                  const updated = prev.filter((msg) => !msg.startsWith(prefix));

                  if (!sub) return updated; // まだ代走を選んでないときは何も出さない

                  // ルビと敬称
                  const rubyLastName = (p: any) =>
                    `<ruby>${p?.lastName ?? ""}<rt>${p?.lastNameKana ?? ""}</rt></ruby>`;
                  const rubyFirstName = (p: any) =>
                    `<ruby>${p?.firstName ?? ""}<rt>${p?.firstNameKana ?? ""}</rt></ruby>`;
                  const rubyFullName = (p: any) => `${rubyLastName(p)}${rubyFirstName(p)}`;

                  const honorificFrom = replaced?.isFemale ? "さん" : "くん";
                  const honorificTo = sub?.isFemale ? "さん" : "くん";

                  const fromName = replaced ? `${rubyLastName(replaced)}${honorificFrom}` : "";
                  const toNameFull = `${rubyFullName(sub)}${honorificTo}`;
                  const toNameLast = `${rubyLastName(sub)}${honorificTo}`;

                  const text = checked
                    // 臨時代走 ON
                    ? ((fromName ? `${prefix} ${fromName} に代わりまして、` : `${prefix} に代わりまして、`) +
                      `臨時代走、${toNameFull}、臨時代走は ${toNameLast}、背番号 ${sub.number}。`)
                    // 臨時代走 OFF（通常）
                    : ((fromName ? `${prefix} ${fromName} に代わりまして、` : `${prefix} に代わりまして、`) +
                      `${toNameFull}、${prefix}は ${toNameLast}、背番号 ${sub.number}。`);

                  return [...updated, text];
                });
              }}
            />

            <span className="text-red-600 font-bold">臨時代走</span>
          </label>
        </div>
      )}


      {selectedRunnerIndex !== null && selectedBase !== null && (
        <div>
          {/* 🔹 選択内容表示 */}
          <h3 className="text-lg font-bold mb-2">代走設定内容</h3>
          <div className="text-md mb-4">
            {(() => {
              const runner = getPlayer(battingOrder[selectedRunnerIndex].id);
              const sub = runnerAssignments[selectedBase];
              const fromText = runner ? `${runner.lastName}${runner.firstName} #${runner.number}` : "";
              const toText = sub ? `➡ ${sub.lastName}${sub.firstName} #${sub.number}` : "➡";
              return <p>{selectedBase}：{fromText} {toText}</p>;
            })()}
          </div>

          {/* 🔹 選手選択 */}
          <h3 className="text-lg font-bold mb-2">代走として出す選手を選択</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {activeBench.map((player) => {
              const isUsed = Object.values(runnerAssignments).some(p => p?.id === player.id);
              const isSelected = runnerAssignments[selectedBase]?.id === player.id;

              return (
                <button
                  key={player.id}
                  disabled={isUsed && !isSelected}
                  onClick={() => {
                    const runnerId = battingOrder[selectedRunnerIndex]?.id;
                    const replaced = getPlayer(runnerId);
                    const honorific = player.isFemale ? "さん" : "くん";

      // ルビ付きラストネーム生成
      const rubyLastName = (p: any) =>
        `<ruby>${p?.lastName ?? ""}<rt>${p?.lastNameKana ?? ""}</rt></ruby>`;

      // ルビ付きファーストネーム生成
      const rubyFirstName = (p: any) =>
        `<ruby>${p?.firstName ?? ""}<rt>${p?.firstNameKana ?? ""}</rt></ruby>`;

      // ルビ付きフルネーム生成
      const rubyFullName = (p: any) => `${rubyLastName(p)}${rubyFirstName(p)}`;

      // 敬称（replaced が未定義でも安全に）
      const honorificFrom = replaced?.isFemale ? "さん" : "くん";
      const honorificTo   = player?.isFemale ? "さん" : "くん";

      setRunnerAnnouncement((prev: string[]) => {
        const prefix = `${selectedBase}ランナー`;
        const updated = prev.filter((msg) => !msg.startsWith(prefix));

        const fromName = replaced
          ? `${rubyLastName(replaced)}${honorificFrom}`
          : ""; // 置換元が無いケースも一応ケア

        const toNameFull = `${rubyFullName(player)}${honorificTo}`;
        const toNameLast = `${rubyLastName(player)}${honorificTo}`;

        // ✨ 臨時代走の有無で文言を分岐
        const isTemp = selectedBase ? !!tempRunnerFlags[selectedBase] : false;

        let text: string;
        if (isTemp) {
          // 例）「一塁ランナー〇〇くんに代わりまして 臨時代走、▲▲君、臨時代走は▲▲君。」
          text =
            (fromName
              ? `${prefix} ${fromName} に代わりまして 臨時代走、`
              : `${prefix} に代わりまして 臨時代走、`) +
            `${toNameFull}、臨時代走は ${toNameLast}。`;
        } else {
          // 従来の通常代走アナウンス
          text =
            (fromName
              ? `${prefix} ${fromName} に代わりまして、`
              : `${prefix} に代わりまして、`) +
            `${toNameFull}、${prefix}は ${toNameLast}、背番号 ${player.number}。`;
        }

        return [...prev, text];

      });


                    setRunnerAssignments(prev => ({ ...prev, [selectedBase]: player }));
                    setReplacedRunners(prev => ({ ...prev, [selectedBase]: replaced }));
                    setSelectedSubRunner(player);
                  }}
                  className={`p-2 border rounded font-semibold text-center ${
                    isSelected
                      ? "bg-yellow-300 border-yellow-600 text-black"
                      : isUsed
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-white hover:bg-gray-100"
                  }`}
                >
                  {player.lastName} {player.firstName} #{player.number}
                </button>
              );
            })}
          </div>

          {/* 🔹 アナウンス文言エリア */}
          {runnerAnnouncement && runnerAnnouncement.length > 0 && (
            <div className="border p-4 bg-red-200 mb-4">
              <div className="flex items-center mb-2">
                <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mr-2" />
                <div className="text-red-600 font-bold space-y-1">
                  {["1塁", "2塁", "3塁"].map(base =>
                    runnerAnnouncement
                      .filter(msg => msg.startsWith(`${base}ランナー`))
                      .map((msg, idx) => (
                        <div
                          key={`${base}-${idx}`}
                          dangerouslySetInnerHTML={{ __html: msg }}
                        />
                      ))
                  )}
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() =>
                    announce(
                      ["1塁", "2塁", "3塁"]
                        .map(base => runnerAnnouncement.find(msg => msg.startsWith(`${base}ランナー`)))
                        .filter(Boolean)
                        .join("、")
                    )
                  }
                  className="bg-blue-600 text-white px-4 py-2 rounded"
                >
                  読み上げ
                </button>
                <button
                  onClick={() => speechSynthesis.cancel()}
                  className="bg-red-600 text-white px-4 py-2 rounded"
                >
                  停止
                </button>
              </div>
            </div>
          )}

          {/* 🔹 操作ボタン */}
          <div className="flex justify-between gap-4">
            <button
              onClick={() => {
                setSelectedSubRunner(null);
                setSelectedRunnerIndex(null);
                setSelectedBase(null);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              もう1人
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowRunnerModal(false);
                  setSelectedRunnerIndex(null);
                  setSelectedBase(null);
                  setSelectedSubRunner(null);
                  setRunnerAssignments({ "1塁": null, "2塁": null, "3塁": null });
                  setReplacedRunners({ "1塁": null, "2塁": null, "3塁": null });
                  setRunnerAnnouncement([]);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                キャンセル
              </button>
      <button
        onClick={async () => {
          const newOrder = [...battingOrder];
          const newUsed = { ...usedPlayerInfo };

          const assignments = await localForage.getItem<Record<string, number | null>>("lineupAssignments");
          const wasStarterMap = await localForage.getItem<Record<number, boolean>>("wasStarterMap");
          const updatedAssignments = { ...(assignments || {}) };
          let teamPlayerList = [...players];

      Object.entries(runnerAssignments).forEach(([base, sub]) => {
        const replaced = replacedRunners[base]; // ベース上にいた選手（= 代走で置き換える対象）
        if (!sub || !replaced) return;

        // 打順の index を取得（代打→代走に置換）
        const index = battingOrder.findIndex(entry => entry.id === replaced.id);
        if (index === -1) return;

        // ① 既存 used を読み、"代打 → 代走" のチェーンを解決
        //    先発(=originalId) → 代打(subId=replaced.id) という記録があるはず
        const chain = Object.entries(newUsed).find(([, info]: any) => info?.subId === replaced.id);
        const originalId = chain ? Number(chain[0]) : replaced.id;

        // ② fromPos を確定（先発の記録があれば継承。なければ assignments から拾う）
        const chainFromPos = chain ? (chain[1] as any).fromPos : undefined;
        let fromPos = chainFromPos;
        if (!fromPos) {
          // assignments から探す（"投/捕/一/…" のシンボル）
          const hit = Object.entries(assignments || {}).find(([, id]) => id === originalId || id === replaced.id);
          fromPos = hit?.[0] ?? ""; // 空のままは避けたいが、なければ空のまま
        }

        // ③ usedPlayerInfo を「元の先発のキー」で更新
        newUsed[originalId] = {
          ...(chain ? chain[1] : {}),
          fromPos,               // 例: "一"
          subId: sub.id,         // 代走のIDに上書き
          // ✨ 臨時代走チェックに応じて理由を切替
          reason: tempRunnerFlags[base] ? "臨時代走" : "代走",
          order: index + 1,
          wasStarter: wasStarterMap?.[originalId] ?? true,
        };


        // ④ もし "代打ID" をキーにした残骸があれば削除（あなたのログの 1752049941486 のようなやつ）
        if (newUsed[replaced.id] && replaced.id !== originalId) {
          delete (newUsed as any)[replaced.id];
        }

        // ⑤ 打順更新（代走）
        //newOrder[index] = { id: sub.id, reason: "代走" };
        const reason = tempRunnerFlags[base] ? "臨時代走" : "代走";
        newOrder[index] = { id: sub.id, reason }

        // ⑥ 守備も引き継ぎ（fromPos が取れた場合のみ）
        if (fromPos) {
          // fromPos は "投/捕/一/…" のどれか想定。もし "ファースト" 等の表記ならシンボル化してから入れてください。
          updatedAssignments[fromPos] = sub.id;
        }

        // ⑦ teamPlayers に代走選手がいなければ追加
        if (!teamPlayerList.some(p => p.id === sub.id)) {
          teamPlayerList.push(sub);
        }
      });


          // ✅ 保存と更新
          setBattingOrder(newOrder);
          setUsedPlayerInfo(newUsed);
          
          await localForage.setItem("lineupAssignments", updatedAssignments);
          await localForage.setItem("battingOrder", newOrder); 
          await localForage.setItem("usedPlayerInfo", newUsed);
          setPlayers(teamPlayerList);


          // ✅ モーダルと状態をリセット
          setShowRunnerModal(false);
          setSelectedRunnerIndex(null);
          setSelectedBase(null);
          setSelectedSubRunner(null);
          setRunnerAssignments({ "1塁": null, "2塁": null, "3塁": null });
          setReplacedRunners({ "1塁": null, "2塁": null, "3塁": null });
          setRunnerAnnouncement([]);
          setTempRunnerFlags({});
        }}
        className="bg-red-600 text-white px-4 py-2 rounded"
      >
        確定
      </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
)}

{/* ✅ グラウンド整備　モーダル */}
{showGroundPopup && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-6 border-4 border-red-500 max-w-md w-full">

      {/* 🔶 マイク＋注意メッセージ（マイクは外） */}
      <div className="flex items-center gap-2">
        <img src="icons/mic-red.png" alt="マイク" className="w-6 h-6" />
        <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 text-sm font-semibold text-left flex items-center gap-2 w-full">
          <span className="text-2xl">⚠️</span>
          <span>4回終了後🎤</span>
        </div>
      </div>

      {/* 上段：お願い */}
      <div className="flex items-center justify-center gap-4">
        <h2 className="text-lg font-bold text-red-600">両チームはグランド整備をお願いします。</h2>
      </div>
      <div className="flex justify-center gap-4">
        <button
          onClick={() => speakText("両チームはグランド整備をお願いします。")}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded"
        >
          読み上げ
        </button>
        <button
          onClick={stopSpeech}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          停止
        </button>
      </div>

      <hr />

      {/* 下段：お礼 */}
      <div>
          {/* 🔶 注意メッセージ（終了後） */}
        <div className="flex items-center gap-2">
          <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-3 py-1 text-sm font-semibold flex items-center gap-2 rounded">
            <span className="text-xl">⚠️</span>
            <span>整備終了後🎤</span>
          </div>
        </div>
        <h2 className="text-lg font-bold text-red-600">グランド整備、ありがとうございました。</h2>
        <div className="flex justify-center gap-4 mt-2">
          <button
            onClick={() => speakText("グランド整備、ありがとうございました。")}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded"
          >
            読み上げ
          </button>
          <button
            onClick={stopSpeech}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            停止
          </button>
        </div>
      </div>

      {/* OKボタン */}
      <div className="pt-2">
        <button
          onClick={() => {
            stopSpeech();
            setShowGroundPopup(false);
            onSwitchToDefense(); // ✅ 守備画面に遷移！
          }}
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-1.5 rounded font-bold"
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}


{/* ✅ 開始時刻　モーダル */}
{showStartTimePopup && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-pink-200 p-6 rounded-xl shadow-xl text-center space-y-4 max-w-md w-full">
      <div className="flex items-center gap-2">
        <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6" />
        <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-3 py-1 text-sm font-semibold inline-flex items-center gap-2 w-fit rounded">
          <span className="text-2xl">⚠️</span>2番バッター紹介前に🎤
        </div>
      </div>
      <div className="text-xl font-bold text-red-600 flex items-center justify-center gap-2">
        この試合の開始時刻は {gameStartTime} です。
      </div>
      <div className="flex justify-center gap-4">
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={() => {
            const msg = new SpeechSynthesisUtterance(`この試合の開始時刻は${gameStartTime}です`);
            speechSynthesis.speak(msg);
          }}
        >
          読み上げ
        </button>
        <button
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          onClick={() => speechSynthesis.cancel()}
        >
          停止
        </button>
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={() => setShowStartTimePopup(false)}
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}

    </div>
     </DndProvider>
  );
};

export default OffenseScreen;
