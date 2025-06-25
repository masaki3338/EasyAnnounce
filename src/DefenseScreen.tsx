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
  投: { top: '45%', left: '50%' },
  捕: { top: '70%', left: '50%' },
  一: { top: '60%', left: '80%' },
  二: { top: '40%', left: '70%' },
  三: { top: '60%', left: '20%' },
  遊: { top: '40%', left: '30%' },
  左: { top: '20%', left: '10%' },
  中: { top: '10%', left: '50%' },
  右: { top: '20%', left: '90%' },
};

const positions = Object.keys(positionStyles);

type Scores = {
  [inning: number]: { top: number; bottom: number };
};

type DefenseScreenProps = {
  onChangeDefense: () => void;
};

const DefenseScreen: React.FC<DefenseScreenProps> = ({ onChangeDefense }) => {
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
  const [announceMessages, setAnnounceMessages] = useState<string[]>([]);
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setCurrentPitchCount(0);
  }, [inning, isTop]);

  useEffect(() => {
    const loadData = async () => {
      const savedAssignments = await localForage.getItem<{ [pos: string]: number | null }>('lineupAssignments');
      const savedTeam = (await localForage.getItem<{ name: string; players: Player[] }>('team')) || { name: '', players: [] };
      const savedMatchInfo = (await localForage.getItem<{ opponentTeam: string; inning?: number; isTop?: boolean; isDefense?: boolean }>('matchInfo')) || { opponentTeam: '', inning: 1, isTop: true, isDefense: true };
      const savedScores = (await localForage.getItem<Scores>('scores')) || {};
      const savedPitchCount = (await localForage.getItem<{ current: number; total: number }>('pitchCounts')) || { current: 0, total: 0 };

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

    const newMessages = [
      `ピッチャー${pitcherLastName}くん、この回の投球数は${newCurrent}球です。トータル${newTotal}球です。`,
      `ピッチャー${pitcherLastName}くん、ただいまの投球で${newCurrent}球です。`,
    ];
    if (newTotal % 10 === 0) {
      newMessages.push(`ピッチャー${pitcherLastName}くん、ただいまの投球で${newTotal}球に到達しました。`);
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

  const totalRuns = () => {
    let myTeamTotal = 0;
    let oppTotal = 0;
    for (const inningIdx in scores) {
      const iNum = Number(inningIdx);
      if (iNum + 1 > inning) continue;
      const s = scores[iNum];
      if (!s) continue;
      myTeamTotal += s.bottom;
      oppTotal += s.top;
    }
    return { myTeamTotal, oppTotal };
  };

  const getPlayerNameNumber = (id: number | null) => {
    if (id === null) return null;
    const p = teamPlayers.find(pl => pl.id === id);
    return p?.name ?? `${p?.lastName ?? ''}${p?.firstName ?? ''}（${p?.number}）`;
  };

  const handleSpeak = () => {
    if (synthRef.current?.speaking) synthRef.current.cancel();
    if (announceMessages.length === 0) return;
    const text = announceMessages.join('。');
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
          <div>
            <strong>{inning}{isTop ? '回表' : '回裏'}　{isDefense ? '守備中' : '攻撃中'}</strong>
          </div>
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
            <tr className="bg-gray-100">
              <td className="border">{myTeamName || '自チーム'}</td>
              {[...Array(9).keys()].map(i =>
                <td key={i} className="border cursor-pointer hover:bg-gray-200" onClick={() => addScore(i, 'bottom')}>
                  {i + 1 > inning ? '' : scores[i]?.bottom ?? 0}
                </td>
              )}
              <td className="border font-bold">{totalRuns().myTeamTotal}</td>
            </tr>
            <tr>
              <td className="border">{opponentTeamName || '対戦相手'}</td>
              {[...Array(9).keys()].map(i =>
                <td key={i} className="border cursor-pointer hover:bg-gray-200" onClick={() => addScore(i, 'top')}>
                  {i + 1 > inning ? '' : scores[i]?.top ?? 0}
                </td>
              )}
              <td className="border font-bold">{totalRuns().oppTotal}</td>
            </tr>
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
              {pos}: {playerNameNum ?? <span className="text-gray-300">空き</span>}
            </div>
          );
        })}
      </div>

      <section className="mb-4">
        <div className="flex items-center space-x-4">
          <button onClick={addPitch} className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600">
            投球数＋１
          </button>
          <div>
            <p>この回の投球数: <strong>{currentPitchCount}</strong></p>
            <p>累計投球数: <strong>{totalPitchCount}</strong></p>
          </div>
        </div>
      </section>

      <section className="mb-4">
        <h3 className="font-bold mb-2">アナウンスメッセージ</h3>
        <ul className="mb-2 list-disc list-inside max-h-32 overflow-y-auto border border-gray-300 p-2 bg-gray-50">
          {announceMessages.length > 0
            ? announceMessages.map((msg, i) => <li key={i}>{msg}</li>)
            : <li>読み上げメッセージはありません。</li>
          }
        </ul>
        <div className="space-x-2">
          <button onClick={handleSpeak} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            読み上げ
          </button>
          <button onClick={handleStop} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">
            停止
          </button>
        </div>
      </section>

      {/* 🔽 守備交代ボタン */}
      <div className="my-6 text-center">
        <button
          onClick={onChangeDefense}
          className="px-4 py-2 bg-orange-500 text-white rounded shadow hover:bg-orange-600"
        >
          守備交代
        </button>
      </div>
    </div>
  );
};

export default DefenseScreen;
