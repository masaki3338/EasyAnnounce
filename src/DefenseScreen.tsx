import React, { useState, useEffect, useRef } from 'react';
import localForage from 'localforage';

type Player = {
  id: number;
  lastName?: string;
  firstName?: string;
  number: string;
  name?: string; // フルネームも可能
  lastNameKana?: boolean;
  isFemale?: boolean;
};

const positionStyles: { [key: string]: React.CSSProperties } = {
  投: { top: '65%', left: '50%' },
  捕: { top: '89%', left: '50%' },
  一: { top: '66%', left: '80%' },
  二: { top: '45%', left: '66%' },
  三: { top: '66%', left: '17%' },
  遊: { top: '45%', left: '32%' },
  左: { top: '22%', left: '17%' },
  中: { top: '22%', left: '50%' },
  右: { top: '22%', left: '80%' },
};

const positions = Object.keys(positionStyles);

type Scores = {
  [inning: number]: { top: number; bottom: number };
};

type DefenseScreenProps = {
  onChangeDefense: () => void;
  onSwitchToOffense: () => void; // ✅ 追加
  onBack?: () => void; // ✅ 任意として追加
};





const DefenseScreen: React.FC<DefenseScreenProps> = ({ onChangeDefense, onSwitchToOffense }) => {  
  const [showModal, setShowModal] = useState(false);
  const [inputScore, setInputScore] = useState("");
  const [editInning, setEditInning] = useState<number | null>(null);
  const [editTopBottom, setEditTopBottom] = useState<"top" | "bottom" | null>(null);
  const [myTeamName, setMyTeamName] = useState('');
  const [opponentTeamName, setOpponentTeamName] = useState('');
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [currentPitchCount, setCurrentPitchCount] = useState(0);
  const [totalPitchCount, setTotalPitchCount] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [inning, setInning] = useState(1);
  const [isTop, setIsTop] = useState(true);
 const handleStartGame = () => {
      const now = new Date();
      const timeString = now.toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
      setGameStartTime(timeString);
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
  const [isDefense, setIsDefense] = useState(true);
  const [isHome, setIsHome] = useState(false); // 自チームが後攻かどうか
  const [announceMessages, setAnnounceMessages] = useState<string[]>([]);
   const [pitchLimitMessages, setPitchLimitMessages] = useState<string[]>([]);
  const [showPitchLimitModal, setShowPitchLimitModal] = useState(false);
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

// ▼リエントリー用 state と関数を追加
const [battingOrder, setBattingOrder] = useState<{ id: number; reason: string }[]>([]);
const [reEntryTarget, setReEntryTarget] = useState<{ id: number; fromPos: string } | null>(null);
const [reEntryMessage, setReEntryMessage] = useState("");

 // プレイヤー取得を安全に
  const getPlayerSafe = (id: number) => {
    if (typeof getPlayer === "function") {
      const p = getPlayer(id);
      if (p) return p;
    }
    return (Array.isArray(teamPlayers) ? teamPlayers.find((tp:any)=>tp.id===id) : null) || null;
  };

  const playerLabel = (id: number) => {
    const p: any = getPlayerSafe(id);
    if (!p) return `ID:${id}`;
    const last = p.lastName ?? p.familyName ?? p.last_name ?? "";
    const first = p.firstName ?? p.givenName ?? p.first_name ?? "";
    const lastKana = p.lastNameKana ?? p.last_name_kana ?? "";
    const firstKana = p.firstNameKana ?? p.first_name_kana ?? "";
    const number = p.number ? `（${p.number}）` : "";
    const name =
      (last || first) ? `${last}${first}` :
      (lastKana || firstKana) ? `${lastKana}${firstKana}` :
      `ID:${id}`;
    return `${name}${number}`;
  };

  const honor = (id: number) => {
    const p: any = getPlayerSafe(id);
    if (!p) return "";
    return p.isFemale ? "さん" : "くん";
  };

// 読み上げ関数
const speak = (t: string) => {
  const s = window.speechSynthesis;
  if (s.speaking) s.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = "ja-JP";
  s.speak(u);
};
const stopSpeak = () => window.speechSynthesis?.cancel();

// A(代打/代走ID)からB(元先発)を特定し、文面とターゲットをセット
const buildReentryMessage = async (pinchId: number) => {
  if (!pinchId) { setReEntryTarget(null); setReEntryMessage(""); return; }

  const used: Record<number, any> =
    (await localForage.getItem("usedPlayerInfo")) || {};
  const assignmentsNow: Record<string, number | null> =
    (await localForage.getItem("lineupAssignments")) || {};
  const battingOrder: Array<{ id: number; reason?: string }> =
    (await localForage.getItem("battingOrder")) || [];
  const team: { name?: string } =
    (await localForage.getItem("team")) || {};

  // A: 代打/代走の選手
  const A = teamPlayers.find(p => p.id === pinchId);
  const aReason = battingOrder.find(e => e.id === pinchId)?.reason || "代打";

  // usedPlayerInfo から subId === A.id の元先発Bを探す
  let starterId: number | null = null;
  let fromPos: string | undefined;

  for (const [sid, info] of Object.entries(used || {})) {
    if (Number((info as any)?.subId) === pinchId) {
      starterId = Number(sid);
      fromPos = (info as any)?.fromPos as string | undefined;
      break;
    }
  }

  if (!starterId || !fromPos) {
    setReEntryTarget(null);
    setReEntryMessage("");
    alert("この選手に対応するリエントリー対象はありません。");
    return;
  }

  // すでに出場中ならリエントリー不可
  const isInDefense = Object.values(assignmentsNow || {}).some(id => id === starterId);
  const isInOrder   = battingOrder.some(e => e.id === starterId);
  if (isInDefense || isInOrder) {
    setReEntryTarget(null);
    setReEntryMessage("");
    alert("リエントリー可能な状態ではありません。");
    return;
  }

  // B: 元先発
  const B = teamPlayers.find(p => p.id === starterId);
  const honor = (p?: any) => (p?.isFemale ? "さん" : "くん");
  const teamName = team?.name || "東京武蔵ポニー";
  const posJP: Record<string, string> = {
    "投":"ピッチャー","捕":"キャッチャー","一":"ファースト","二":"セカンド",
    "三":"サード","遊":"ショート","左":"レフト","中":"センター","右":"ライト"
  };

  const msg =
    `${teamName}、選手の交代をお知らせいたします。\n` +
    `先ほど${aReason}いたしました ` +
    `${A?.lastName ?? ""}${A?.firstName ?? ""}${honor(A)} に代わりまして ` +
    `${B?.lastName ?? ""}${B?.firstName ?? ""}${honor(B)} がリエントリーで ` +
    `${posJP[fromPos] ?? fromPos} に入ります。`;

  setReEntryTarget({ id: starterId, fromPos });
  setReEntryMessage(msg);
};

// 「代打/代走の守備位置を設定」ポップアップのリエントリー ボタンから呼ぶ
const handleReentryCheck = async () => {
  // 初期化（毎回リセット）
  setReEntryMessage("");
  setReEntryTarget(null);

  // 現在の打順と開始スナップショットを取得
  const battingOrder: Array<{ id: number; reason?: string }> =
    (await localForage.getItem("battingOrder")) || [];
  const startingOrder: Array<{ id: number; reason?: string }> =
    (await localForage.getItem("startingBattingOrder")) || [];

  // 代打/代走で入っている打順を 1 件だけ拾う（最初の1件）
  const pinchIdx = battingOrder.findIndex(e => e?.reason === "代打" || e?.reason === "代走");
  if (pinchIdx === -1) {
    setReEntryMessage("対象選手なし");
    return;
  }
  const pinchId = battingOrder[pinchIdx]?.id;

  // その打順の“元の先発”を開始スナップショットから逆引き
  const starterId = startingOrder[pinchIdx]?.id;
  if (!starterId) {
    setReEntryMessage("対象選手なし");
    return;
  }

  // 先発の元守備位置を現在の守備配置から特定
  const assignmentsNow: Record<string, number | null> =
    (await localForage.getItem("lineupAssignments")) || {};
  const fromPos = Object.keys(assignmentsNow).find(pos => assignmentsNow[pos] === starterId);

  if (!fromPos) {
    // 守備配置にいない場合は “元ポジ不明” だが、対象としては成立
    // メッセージだけ「守備位置」を省いて出すか、startingAssignments を別途保存して使う想定
    setReEntryMessage("対象選手なし");
    return;
  }

  // A, B の情報と文面を作成（守備に居ても弾かない）
  const A = teamPlayers.find(p => p.id === pinchId);
  const B = teamPlayers.find(p => p.id === starterId);
  const aReason = battingOrder[pinchIdx]?.reason || "代打";
  const team: { name?: string } = (await localForage.getItem("team")) || {};
  const teamName = team?.name || "東京武蔵ポニー";
  const honor = (p?: any) => (p?.isFemale ? "さん" : "くん");
  const posJP: Record<string, string> = {
    "投":"ピッチャー","捕":"キャッチャー","一":"ファースト","二":"セカンド",
    "三":"サード","遊":"ショート","左":"レフト","中":"センター","右":"ライト"
  };

  const msg =
    `${teamName}、選手の交代をお知らせいたします。\n` +
    `先ほど${aReason}いたしました ` +
    `${A?.lastName ?? ""}${A?.firstName ?? ""}${honor(A)} に代わりまして ` +
    `${B?.lastName ?? ""}${B?.firstName ?? ""}${honor(B)} がリエントリーで ` +
    `${posJP[fromPos] ?? fromPos} に入ります。`;

  setReEntryTarget({ id: starterId, fromPos });
  setReEntryMessage(msg);
};





useEffect(() => {

  localForage.setItem("lastGameScreen", "defense");
  const loadData = async () => {
    const savedAssignments = await localForage.getItem<{ [pos: string]: number | null }>('lineupAssignments');
    const savedTeam = (await localForage.getItem<{ name: string; players: Player[] }>('team')) || { name: '', players: [] };
    const savedMatchInfo = (await localForage.getItem<{
      opponentTeam: string;
      inning?: number;
      isTop?: boolean;
      isDefense?: boolean;
      isHome?: boolean;
    }>('matchInfo')) || {
      opponentTeam: '',
      inning: 1,
      isTop: true,
      isDefense: true,
      isHome: false
    };
    const savedScores = (await localForage.getItem<Scores>('scores')) || {};
    const savedPitchCount = (await localForage.getItem<{ current: number; total: number; pitcherId?: number }>('pitchCounts')) || { current: 0, total: 0 };

   

    const savedBattingOrder = (await localForage.getItem<{ id: number; reason: string }[]>("battingOrder")) || [];
    setBattingOrder(savedBattingOrder); // ← この行を追加
    const hasSubPlayers = savedBattingOrder.some(
      (entry) => entry.reason === "代打" || entry.reason === "代走"
    );
    if (hasSubPlayers) {
      setShowConfirmModal(true);
      return;
    }

    if (savedAssignments) setAssignments(savedAssignments);
    if (savedTeam.name) setMyTeamName(savedTeam.name);
    if (savedTeam.players) setTeamPlayers(savedTeam.players);
    if (savedMatchInfo.opponentTeam) setOpponentTeamName(savedMatchInfo.opponentTeam);
    if (savedScores) setScores(savedScores);
    setInning(savedMatchInfo.inning ?? 1);
    setIsTop(savedMatchInfo.isTop ?? true);
    setIsDefense(savedMatchInfo.isDefense ?? true);
    setIsHome(savedMatchInfo.isHome ?? false);

// 🟡 ピッチャー交代チェック
const currentPitcherId = savedAssignments?.['投'];
const previousPitcherId = savedPitchCount.pitcherId;
const pitcher = savedTeam.players.find(p => p.id === currentPitcherId);
const pitcherName = pitcher?.lastName ?? "投手";
const pitcherKana = pitcher?.lastNameKana ?? "とうしゅ";
const pitcherSuffix = pitcher?.isFemale ? "さん" : "くん";
let current = 0;
let total = savedPitchCount.total ?? 0;

// ✅ イニングの変化を判定
const isSameInning = savedMatchInfo.inning === inning && savedMatchInfo.isTop === isTop;

if (currentPitcherId !== undefined && currentPitcherId === previousPitcherId) {
  // 🟢 同じ投手
  current = savedPitchCount.current ?? 0;
  total = savedPitchCount.total ?? 0;

  const msgs = [
    `ピッチャー<ruby>${pitcherName}<rt>${pitcherKana}</rt></ruby>${pitcherSuffix}、この回の投球数は${current}球です。`
  ];

 
  if (!isSameInning) {
    msgs.push(`トータル${total}球です。`);
  }
  setAnnounceMessages(msgs);
} else {
  // 🔴 投手交代 → 両方リセット
  current = 0;
  total = 0;
  setAnnounceMessages([
    `ピッチャー${pitcherName}くん、`,
    `この回の投球数は0球です。`,
    `トータル0球です。`
  ]);
}

// 状態更新
setCurrentPitchCount(current);
setTotalPitchCount(total);
await localForage.setItem("pitchCounts", {
  current,
  total,
  pitcherId: currentPitcherId ?? null
});


    setCurrentPitchCount(current);
    setTotalPitchCount(total);

    // 保存
    await localForage.setItem('pitchCounts', {
      current,
      total,
      pitcherId: currentPitcherId ?? null
    });


  };

  loadData();
}, []);


  
  const addPitch = async () => {
  const newCurrent = currentPitchCount + 1;
  const newTotal = totalPitchCount + 1;
  setCurrentPitchCount(newCurrent);
  setTotalPitchCount(newTotal);

  const pitcherId = assignments['投'];

  // 🔽 matchInfo を取得
  const savedMatchInfo = await localForage.getItem<{
    inning?: number;
    isTop?: boolean;
  }>('matchInfo');

  const isSameInning =
    savedMatchInfo?.inning === inning && savedMatchInfo?.isTop === isTop;

  // 保存
  await localForage.setItem('pitchCounts', {
    current: newCurrent,
    total: newTotal,
    pitcherId: pitcherId ?? null
  });

const pitcher = teamPlayers.find(p => p.id === pitcherId);
const pitcherName = pitcher?.lastName ?? '投手';
const pitcherKana = pitcher?.lastNameKana ?? 'とうしゅ';
const pitcherSuffix = pitcher?.isFemale ? "さん" : "くん";
const newMessages: string[] = [];

// ✅ この回の投球数は常に表示（ふりがな付き）
newMessages.push(
  `ピッチャー<ruby>${pitcherName}<rt>${pitcherKana}</rt></ruby>${pitcherSuffix}、この回の投球数は${newCurrent}球です。`
);

  // ✅ イニングが変わっている時だけトータルも表示
  if (newCurrent !== newTotal) {
    newMessages.push(`トータル${newTotal}球です。`);
  }

  // ★ ポップアップ用：65 or 75球ちょうどのとき
  if (newTotal === 65 || newTotal === 75) {
    const specialMsg =
      newTotal === 75
        ? `ピッチャー${pitcherName}${pitcherSuffix}、ただいまの投球で${newTotal}球に到達しました。`
        : `ピッチャー${pitcherName}${pitcherSuffix}、ただいまの投球で${newTotal}球です。`;
    setPitchLimitMessages([specialMsg]);
    setShowPitchLimitModal(true);
  }

  setAnnounceMessages(newMessages);
};

  const subtractPitch = async () => {
  const newCurrent = Math.max(currentPitchCount - 1, 0);
  const newTotal = Math.max(totalPitchCount - 1, 0);
  setCurrentPitchCount(newCurrent);
  setTotalPitchCount(newTotal);

  const pitcherId = assignments['投'];

  // 🔽 matchInfo を取得して現在の回と比較
  const savedMatchInfo = await localForage.getItem<{
    inning?: number;
    isTop?: boolean;
  }>('matchInfo');

  const isSameInning =
    savedMatchInfo?.inning === inning && savedMatchInfo?.isTop === isTop;

  // 保存
  await localForage.setItem('pitchCounts', {
    current: newCurrent,
    total: newTotal,
    pitcherId: pitcherId ?? null
  });

  const pitcher = teamPlayers.find(p => p.id === pitcherId);
  const pitcherLastName = pitcher?.lastName ?? '投手';
  const pitcherSuffix = pitcher?.isFemale ? "さん" : "くん";

  const newMessages = [
    `ピッチャー${pitcherLastName}${pitcherSuffix}、この回の投球数は${newCurrent}球です。`
  ];

  // ✅ イニングが変わっていたらトータルも表示
  if (newCurrent !== newTotal) {
    newMessages.push(`トータル${newTotal}球です。`);
  }

  setAnnounceMessages(newMessages);
};




  const addScore = async (inningIndex: number, topOrBottom: 'top' | 'bottom') => {
    if (inningIndex + 1 > inning) return;
    const currentScore = scores[inningIndex] || { top: 0, bottom: 0 };
    const newScore = { ...currentScore };
    topOrBottom === 'top' ? newScore.top++ : newScore.bottom++;
    const newScores = { ...scores, [inningIndex]: newScore };
    setScores(newScores);
    await localForage.setItem('scores', newScores);
  };

const confirmScore = async () => {
  const score = parseInt(inputScore || "0", 10);
  const updatedScores = { ...scores };

  // ✅ 編集モード
  if (editInning !== null && editTopBottom !== null) {
    const index = editInning - 1;
    if (!updatedScores[index]) {
      updatedScores[index] = { top: 0, bottom: 0 };
    }
    updatedScores[index][editTopBottom] = score;

    await localForage.setItem("scores", updatedScores);
    setScores(updatedScores);
    setInputScore("");
    setEditInning(null);
    setEditTopBottom(null);
    setShowModal(false);
    return;
  }

  // ✅ 通常モード（イニング終了）
  const index = inning - 1;
  if (!updatedScores[index]) {
    updatedScores[index] = { top: 0, bottom: 0 };
  }

  if (isTop) {
    updatedScores[index].top = score;
  } else {
    updatedScores[index].bottom = score;
  }

  await localForage.setItem("scores", updatedScores);
  setScores(updatedScores);
  setInputScore("");
  setShowModal(false);

  // 🟡 次の状態を定義
  const nextIsTop = !isTop;
  const nextInning = isTop ? inning : inning + 1;

  // 🟡 matchInfo 更新
  await localForage.setItem("matchInfo", {
    opponentTeam: opponentTeamName,
    inning: nextInning,
    isTop: nextIsTop,
    isDefense: true,
    isHome,
  });

  setIsTop(nextIsTop);
  if (!isTop) setInning(nextInning);

   // 🟢 イニング変化時に投球数リセット
  const pitcherId = assignments["投"];
  const updatedPitchCounts = {
    current: 0,
    total: totalPitchCount,
    pitcherId: pitcherId ?? null,
  };
  await localForage.setItem("pitchCounts", updatedPitchCounts);
  setCurrentPitchCount(0);


  // ✅ 攻撃に切り替わるタイミングで攻撃画面に遷移
  const isNextOffense = (nextIsTop && !isHome) || (!nextIsTop && isHome);
  if (isNextOffense) {
    onSwitchToOffense();
  }
};



const totalRuns = () => {
  let myTeamTotal = 0;
  let oppTotal = 0;
  Object.entries(scores).forEach(([inningStr, s]) => {
    if (!s) return;

    if (isHome) {
      myTeamTotal += s.bottom;
      oppTotal += s.top;
    } else {
      myTeamTotal += s.top;
      oppTotal += s.bottom;
    }
  });
  return { myTeamTotal, oppTotal };
};


  const getPlayerNameNumber = (id: number | null) => {
    if (id === null) return null;
    const p = teamPlayers.find(pl => pl.id === id);
    return p?.name ?? `${p?.lastName ?? ''}${p?.firstName ?? ''} #${p?.number}`;
  };

  const handleSpeak = () => {
    if (synthRef.current?.speaking) synthRef.current.cancel();
    if (announceMessages.length === 0) return;
    const text = announceMessages.join('。');
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const handlePitchLimitSpeak = () => {
    if (synthRef.current?.speaking) synthRef.current.cancel();
    if (pitchLimitMessages.length === 0) return;
    const text = pitchLimitMessages.join('。');
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };


  const handleStop = () => {
    if (synthRef.current?.speaking) synthRef.current.cancel();
  };

  return (
    
    <div className="max-w-4xl mx-auto p-4">
      <section className="mb-4">
        <h2 className="text-xl font-bold mb-2">
          {myTeamName || '自チーム'} vs {opponentTeamName || '対戦相手'}
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
            <span>{isDefense ? "守備中" : "攻撃中"}</span>
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

        <table className="w-full border border-gray-400 text-center text-sm">
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
    { name: myTeamName || "自チーム", isMyTeam: true },
    { name: opponentTeamName || "対戦相手", isMyTeam: false },
  ]
    .sort((a, b) => {
      // 先攻（isHome=false）なら自チームを上に、後攻（isHome=true）なら下に
      if (isHome) return a.isMyTeam ? 1 : -1;
      else return a.isMyTeam ? -1 : 1;
    })
    .map((row, rowIndex) => {
      return (
        <tr key={rowIndex} className={row.isMyTeam ? "bg-gray-100" : ""}>
          <td className="border text-center">{row.name}</td>
          {[...Array(9).keys()].map((i) => {
            const value = row.isMyTeam
              ? isHome
                ? scores[i]?.bottom
                : scores[i]?.top
              : isHome
              ? scores[i]?.top
              : scores[i]?.bottom;

            const target = row.isMyTeam
              ? isHome
                ? "bottom"
                : "top"
              : isHome
              ? "top"
              : "bottom";

            const isHighlight = i + 1 === inning && target === (isTop ? "top" : "bottom");
            const display = isHighlight && value === 0 ? "" : value ?? "";

            return (
            <td
              key={i}
              className={`border cursor-pointer text-center hover:bg-gray-200 ${
                isHighlight ? "bg-yellow-300 font-bold border-2 border-yellow-500" : ""
              }`}
              onClick={() => {
                // ✅ 現在のイニング（黄色）または未来の回は無効
                if (isHighlight || i + 1 >= inning) return;
                setEditInning(i + 1);
                setEditTopBottom(target);
                const existing = scores[i]?.[target];
                setInputScore(existing !== undefined ? String(existing) : "");
                setShowModal(true);
              }}
            >
              {i + 1 > inning ? "" : display}
            </td>
            );
          })}
          <td className="border font-bold text-center">
            {Object.values(scores).reduce((sum, s) => {
              const v = row.isMyTeam
                ? isHome
                  ? s.bottom ?? 0
                  : s.top ?? 0
                : isHome
                ? s.top ?? 0
                : s.bottom ?? 0;
              return sum + v;
            }, 0)}
          </td>
        </tr>
      );
    })}
</tbody>
        </table>
      </section>
      <div className="relative w-full max-w-2xl mx-auto my-6">
        <img src="/field.jpg" alt="フィールド図" className="w-full rounded shadow" />
        {positions.map(pos => {
          const playerId = assignments[pos];
          const playerNameNum = getPlayerNameNumber(playerId);
          return (            
          <div
            key={pos}
            className="absolute text-base font-bold text-white bg-black bg-opacity-60 rounded px-1 py-0.5 whitespace-nowrap text-center"
            style={{ 
              ...positionStyles[pos], 
              transform: 'translate(-50%, -50%)', 
              minWidth: '80px' 
            }}
          >
            {playerNameNum ?? <span className="text-gray-300">空き</span>}
          </div>
          );
        })}
      </div>

<div className="flex items-center justify-center gap-4">
  <button onClick={subtractPitch} className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600">
    投球数－１
  </button>
  <div>
    <p>この回の投球数: <strong>{currentPitchCount}</strong></p>
    <p>累計投球数: <strong>{totalPitchCount}</strong></p>
  </div>
  <button onClick={addPitch} className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600">
    投球数＋１
  </button>
</div>

      {/* 🔽 マイクアイコン付きアナウンスエリア */}
{announceMessages.length > 0 && (
  <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
    {/* 🔴 上段：マイクアイコン + 注意書き */}
    <div className="flex items-start gap-2">
      <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mt-[-2px]" />
      <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-0.5 text-sm font-semibold whitespace-nowrap leading-tight mt-[-2px]">
        <span className="mr-2 text-2xl">⚠️</span> 守備回終了時に🎤
      </div>
    </div>

    {/* 🔽 下段：アナウンスメッセージとボタン（縦に表示） */}
    <div className="flex flex-col text-red-600 text-lg font-bold space-y-1 mt-2 leading-tight">
      {announceMessages.map((msg, index) => (
        <p
          key={index}
          className="leading-tight"
          dangerouslySetInnerHTML={{ __html: msg }}
        />
      ))}

      {/* ボタン（横並び） */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSpeak}
          className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700"
        >
          読み上げ
        </button>
        <button
          onClick={handleStop}
          className="bg-red-600 text-white px-4 py-1 rounded hover:bg-red-700"
        >
          停止
        </button>
      </div>
    </div>
  </div>
)}

      {/* 🔽 守備交代ボタン */}
      <div className="my-6 text-center">
        <button
          onClick={onChangeDefense}
          className="px-4 py-2 bg-orange-500 text-white rounded shadow hover:bg-orange-600"
        >
          守備交代
        </button>
      </div>


{showConfirmModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4 max-w-sm">
      <h2 className="text-xl font-bold text-red-600">
        代打/代走の選手の守備位置を設定して下さい
      </h2>

      <div className="flex justify-center gap-4 mt-4">
        {/* 守備交代へ */}
        <button
          onClick={() => {
            setShowConfirmModal(false);
            onChangeDefense();
          }}
          className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700"
        >
          ＯＫ
        </button>

        {/* リエントリー（結果はこの画面に出す） */}
        <button
          onClick={handleReentryCheck}
          className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
        >
          リエントリー
        </button>
      </div>

      {/* ▼ ここに結果をその場表示 */}
      {reEntryMessage && (
        <div className="mt-3 space-y-3">
          {(!reEntryTarget || reEntryMessage === "対象選手なし") ? (
            <div className="text-sm text-gray-700 border rounded p-3 bg-gray-50">
              対象選手なし
            </div>
          ) : (
            <>
              <div className="whitespace-pre-wrap text-left border rounded p-3 bg-gray-50">
                {reEntryMessage}
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  className="px-3 py-2 bg-green-600 text-white rounded"
                  onClick={() => speak(reEntryMessage)}
                >
                  読み上げ
                </button>
                <button
                  className="px-3 py-2 bg-gray-700 text-white rounded"
                  onClick={() => window.speechSynthesis?.cancel()}
                >
                  停止
                </button>
                <button
                  className="px-3 py-2 bg-indigo-600 text-white rounded"
                  onClick={async () => {
                    if (!reEntryTarget) return;
                    if (reEntryTarget.fromPos === "投") {
                      alert("投手は投手としてのリエントリーはできません。守備位置を調整してください。");
                      return;
                    }
                    const curAssign: Record<string, number | null> =
                      (await localForage.getItem("lineupAssignments")) || assignments || {};
                    const nextAssign = { ...curAssign };
                    nextAssign[reEntryTarget.fromPos] = reEntryTarget.id;
                    setAssignments(nextAssign);
                    await localForage.setItem("lineupAssignments", nextAssign);

                    const usedNow: Record<number, any> =
                      (await localForage.getItem("usedPlayerInfo")) || {};
                    usedNow[reEntryTarget.id] = {
                      ...(usedNow[reEntryTarget.id] || {}),
                      hasReentered: true,
                    };
                    await localForage.setItem("usedPlayerInfo", usedNow);

                    // 閉じる処理（この確認モーダルは用途次第で閉じてもOK）
                    setReEntryMessage("");
                    setReEntryTarget(null);
                    window.speechSynthesis?.cancel();
                  }}
                >
                  確定
                </button>
                <button
                  className="px-3 py-2 bg-gray-400 text-white rounded"
                  onClick={() => {
                    setReEntryMessage("");
                    setReEntryTarget(null);
                    window.speechSynthesis?.cancel();
                  }}
                >
                  キャンセル
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  </div>
)}




      {showPitchLimitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-red-200 p-6 rounded-xl shadow-xl text-center space-y-4">
            <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mt-[-2px]" />
            <div className="text-red-600 text-lg font-bold space-y-2">
              {pitchLimitMessages.map((msg, idx) => (
                <p key={idx}>{msg}</p>
              ))}
            </div>

            {/* ★ 読み上げ／停止ボタンを追加 */}
            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={handlePitchLimitSpeak}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                読み上げ
              </button>
              <button
                onClick={handleStop}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                停止
              </button>
              <button
                onClick={() => {
                  setShowPitchLimitModal(false);
                  setPitchLimitMessages([]);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded ml-16" // ← 停止との間に余白を追加
              >
                OK
              </button>
            </div>

          </div>
        </div>
      )}


      {showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4">
      <h2 className="text-lg font-bold">得点を入力してください</h2>
      <div className="text-2xl border p-2 w-24 mx-auto">{inputScore || "0"}</div>
      <div className="grid grid-cols-3 gap-2">
        {[..."1234567890"].map((digit) => (
          <button
            key={digit}
            onClick={() => {
              if (inputScore.length < 2) {
                setInputScore(prev => prev + digit);
              }
            }}
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
      setEditInning(null);
      setEditTopBottom(null);
    }}
    className="bg-gray-600 text-white px-4 py-2 rounded"
  >
    キャンセル
  </button>
</div>
    </div>
  </div>
      )}

    </div>
  );
};

export default DefenseScreen;
