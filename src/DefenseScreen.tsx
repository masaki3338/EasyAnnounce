import React, { useState, useEffect, useRef } from 'react';
import localForage from 'localforage';

type Player = {
  id: number;
  lastName?: string;
  firstName?: string;
  number: string;
  name?: string; // フルネームも可能
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
  const [myTeamName, setMyTeamName] = useState('');
  const [opponentTeamName, setOpponentTeamName] = useState('');
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [currentPitchCount, setCurrentPitchCount] = useState(0);
  const [totalPitchCount, setTotalPitchCount] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [inning, setInning] = useState(1);
  const [isTop, setIsTop] = useState(true);
  const [isDefense, setIsDefense] = useState(true);
  const [isHome, setIsHome] = useState(false); // 自チームが後攻かどうか
  const [announceMessages, setAnnounceMessages] = useState<string[]>([]);
   const [pitchLimitMessages, setPitchLimitMessages] = useState<string[]>([]);
  const [showPitchLimitModal, setShowPitchLimitModal] = useState(false);
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const resetCurrentPitchCount = async () => {
      const saved = await localForage.getItem<{ current: number; total: number }>('pitchCounts');
      const total = saved?.total ?? 0;
      setCurrentPitchCount(0);
      await localForage.setItem('pitchCounts', { current: 0, total });
    };
    resetCurrentPitchCount();
  }, [inning, isTop]);

  useEffect(() => {
    const loadData = async () => {      
      const savedAssignments = await localForage.getItem<{ [pos: string]: number | null }>('lineupAssignments');
      const savedTeam = (await localForage.getItem<{ name: string; players: Player[] }>('team')) || { name: '', players: [] };
      const savedMatchInfo = (await localForage.getItem<{
          opponentTeam: string;
          inning?: number;
          isTop?: boolean;
          isDefense?: boolean;
          isHome?: boolean; // ← ✅これを追加
        }>('matchInfo')) || {
          opponentTeam: '',
          inning: 1,
          isTop: true,
          isDefense: true,
          isHome: false // ← 任意（なくても良い）
        };
      const savedScores = (await localForage.getItem<Scores>('scores')) || {};
      const savedPitchCount = (await localForage.getItem<{ current: number; total: number }>('pitchCounts')) || { current: 0, total: 0 };

      // ✅ ここに追記！
      const savedBattingOrder = (await localForage.getItem<{ id: number; reason: string }[]>("battingOrder")) || [];
      // ✅ デバッグログ：出場理由一覧
      console.log("【battingOrder】", savedBattingOrder);
      console.log("【出場理由一覧】", savedBattingOrder.map(entry => entry.reason));

      const hasSubPlayers = savedBattingOrder.some(
        (entry) => entry.reason === "代打" || entry.reason === "代走"
      );
      // ✅ 判定ログ
      console.log("【代打 or 代走の選手がいるか？】", hasSubPlayers);
      if (hasSubPlayers) {
        //onChangeDefense(); // 守備変更画面へ
        setShowConfirmModal(true); // モーダルを表示
        return;
      }


      if (savedAssignments) setAssignments(savedAssignments);
      if (savedTeam.name) setMyTeamName(savedTeam.name);
      if (savedTeam.players) setTeamPlayers(savedTeam.players);
      if (savedMatchInfo.opponentTeam) setOpponentTeamName(savedMatchInfo.opponentTeam);
      if (savedScores) setScores(savedScores);
      setCurrentPitchCount(savedPitchCount.current);
      setTotalPitchCount(savedPitchCount.total);
      setInning(savedMatchInfo.inning ?? 1);
      setIsTop(savedMatchInfo.isTop ?? true);
      setIsDefense(savedMatchInfo.isDefense ?? true);
      setIsHome(savedMatchInfo.isHome ?? false); 
      // 🔽 初期アナウンスメッセージを表示
      const pitcherId = savedAssignments?.['投'];
      const pitcher = savedTeam.players.find(p => p.id === pitcherId);
      const pitcherLastName = pitcher?.lastName ?? '投手';
      const newMessages = [
        `ピッチャー${pitcherLastName}くん、この回の投球数は${savedPitchCount.current}球です。`,
        `トータル${savedPitchCount.total}球です。`
      ];
      setAnnounceMessages(newMessages);
    };
    loadData();

  }, []);


  
  const addPitch = async () => {
    const newCurrent = currentPitchCount + 1;
    const newTotal = totalPitchCount + 1;
    setCurrentPitchCount(newCurrent);
    setTotalPitchCount(newTotal);
    await localForage.setItem('pitchCounts', { current: newCurrent, total: newTotal });

    const pitcherId = assignments['投'];
    const pitcher = teamPlayers.find(p => p.id === pitcherId);
    const pitcherLastName = pitcher?.lastName ?? '投手';

    const newMessages: string[] = [];

    // 「この回の投球数」は必ず表示
    newMessages.push(`ピッチャー${pitcherLastName}くん、この回の投球数は${newCurrent}球です。`);

    // トータルと同じでない場合のみ表示
    if (newCurrent !== newTotal) {
      newMessages.push(`トータル${newTotal}球です。`);
    }

    // ★ ポップアップ用：40 or 50球ちょうどのとき
    if (newTotal === 40 || newTotal === 50) {
      const specialMsg =
        newTotal === 50
          ? `ピッチャー${pitcherLastName}くん、ただいまの投球で${newTotal}球に到達しました。`
          : `ピッチャー${pitcherLastName}くん、ただいまの投球で${newTotal}球です。`; // ← 累積投球数に変更
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
    await localForage.setItem('pitchCounts', { current: newCurrent, total: newTotal });

    const pitcherId = assignments['投'];
    const pitcher = teamPlayers.find(p => p.id === pitcherId);
    const pitcherLastName = pitcher?.lastName ?? '投手';

    const newMessages = [`ピッチャー${pitcherLastName}くん、この回の投球数は${newCurrent}球です。`];

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
  const index = inning - 1;

  if (!updatedScores[index]) {
    updatedScores[index] = { top: 0, bottom: 0 };
  }

// 守備画面：相手の得点を記録
if (isHome) {
  if (isTop) {
    updatedScores[index].top = score; // 相手（先攻）の得点
  } else {
    updatedScores[index].bottom = score; // 自チーム（後攻）の守備中＝相手の得点
  }
} else {
  if (isTop) {
    updatedScores[index].top = score; // 自チーム（先攻）の守備中＝相手の得点
  } else {
    updatedScores[index].bottom = score; // 相手（後攻）の得点
  }
}

  await localForage.setItem("scores", updatedScores);
  setScores(updatedScores);
  setInputScore("");
  setShowModal(false);

  if (isTop) {
    const nextIsTop = false;
    setIsTop(nextIsTop);

    await localForage.setItem("matchInfo", {
      opponentTeam: opponentTeamName,
      inning,
      isTop: nextIsTop,
      isDefense: true,
      isHome,
    });

    const isMyTeamAttackingNext = (isHome && !nextIsTop) || (!isHome && nextIsTop);
    if (isMyTeamAttackingNext) {
      onSwitchToOffense();
    }

  } else {
    const nextInning = inning + 1;
    const nextIsTop = true; // 新しい回は「表」

    setIsTop(nextIsTop);
    setInning(nextInning);

    await localForage.setItem("matchInfo", {
      opponentTeam: opponentTeamName,
      inning: nextInning,
      isTop: nextIsTop,
      isDefense: true,
      isHome,
    });

    const isMyTeamAttackingNext = (isHome && !nextIsTop) || (!isHome && nextIsTop);
    if (isMyTeamAttackingNext) {
      onSwitchToOffense();
    }
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
                    <td className="border">{row.name}</td>
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

                      return (
                        <td
                          key={i}
                          className="border cursor-pointer hover:bg-gray-200"
                          onClick={() => addScore(i, target as "top" | "bottom")}
                        >
                          {i + 1 > inning ? "" : value ?? ""}
                        </td>
                      );
                    })}
                    <td className="border font-bold">
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
              className="absolute text-xs font-bold text-white bg-black bg-opacity-60 rounded px-1 py-0.5"
              style={{ ...positionStyles[pos], transform: 'translate(-50%, -50%)' }}
            >
              {playerNameNum ?? <span className="text-gray-300">空き</span>}
            </div>
          );
        })}
      </div>

<div className="flex items-center gap-4">
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
        <div className="border border-red-500 bg-white p-4 my-4 rounded-lg shadow-md">
          <div className="flex items-start gap-4">
            <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6" />
            <div className="text-red-600 text-lg font-bold space-y-1">
              {announceMessages.map((msg, index) => (
                <p key={index}>{msg}</p>
              ))}
            </div>
            <div className="ml-auto flex flex-col justify-between gap-2">
              <button onClick={handleSpeak} className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700">
                読み上げ
              </button>
              <button onClick={handleStop} className="bg-red-600 text-white px-4 py-1 rounded hover:bg-red-700">
                停止
              </button>
            </div>
          </div>

          {/* ★ ここが追加部分（注意マーク＋説明文） */}
          <div className="mt-2 flex items-center gap-2">
            <img src="/icons/warning-icon.png" alt="warning" className="w-5 h-5" />
            <span className="text-blue-600 font-semibold">守備回終了時にアナウンス</span>
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
      <h2 className="text-xl font-bold text-red-600">代打/代走の選手の守備位置を設定して下さい</h2>
      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={() => {
            setShowConfirmModal(false);
            onChangeDefense(); // 守備交代へ
          }}
          className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700"
        >
          ＯＫ
        </button>
      </div>
    </div>
  </div>
)}


      {showPitchLimitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4">
            <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6 mx-auto" />
            <div className="text-red-600 text-lg font-bold space-y-2">
              {pitchLimitMessages.map((msg, idx) => (
                <p key={idx}>{msg}</p>
              ))}
            </div>

            {/* ★ 読み上げ／停止ボタンを追加 */}
            <div className="flex justify-center gap-4">
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
            </div>

            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={() => {
                  setShowPitchLimitModal(false);
                  setPitchLimitMessages([]);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded"
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

    </div>
  );
};

export default DefenseScreen;
