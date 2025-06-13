import React, { useState, useEffect, useRef } from "react";
import localForage from "localforage";

// 守備位置略称（日本語）→正式守備名マップ
const positionMapJP: Record<string, string> = {
  投: "ピッチャー",
  捕: "キャッチャー",
  一: "ファースト",
  二: "セカンド",
  三: "サード",
  遊: "ショート",
  左: "レフト",
  中: "センター",
  右: "ライト",
  "-": "ー",
};

type Player = {
  id: number;
  lastName: string;      // 漢字姓
  firstName: string;     // 漢字名
  lastNameKana: string;  // ふりがな（姓）
  firstNameKana: string; // ふりがな（名）
  number: string;
  isFemale?: boolean;    // 女子選手フラグ
};

const AnnounceStartingLineup: React.FC = () => {
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [battingOrder, setBattingOrder] = useState<number[]>([]);
  const [firstBaseTeamName, setFirstBaseTeamName] = useState<string>("");
  const [thirdBaseTeamName, setThirdBaseTeamName] = useState<string>("");
  const [isTopTeamFirstBase, setIsTopTeamFirstBase] = useState<boolean>(true);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    Promise.all([
      localForage.getItem<{ players: Player[] }>("team"),
      localForage.getItem("lineupAssignments"),
      localForage.getItem("battingOrder"),
      localForage.getItem<string>("firstBaseTeamName"),
      localForage.getItem<string>("thirdBaseTeamName"),
      localForage.getItem<boolean>("isTopTeamFirstBase"),
    ]).then(([team, savedAssignments, savedBattingOrder, firstName, thirdName, isTopFirst]) => {
      setTeamPlayers(team?.players || []);
      setAssignments(savedAssignments as { [pos: string]: number | null } || {});
      setBattingOrder(savedBattingOrder as number[] || []);
      setFirstBaseTeamName(firstName || "");
      setThirdBaseTeamName(thirdName || "");
      setIsTopTeamFirstBase(isTopFirst === null || isTopFirst === undefined ? true : isTopFirst);
    });
  }, []);

  // ふりがな付き名前表示
  const renderFurigana = (kanji: string, kana: string) => (
    <ruby>
      {kanji}
      <rt style={{ fontSize: "0.6em" }}>{kana}</rt>
    </ruby>
  );

  // 敬称を選択（女子は「さん」、それ以外は「くん」）
  const getHonorific = (player: Player) => (player.isFemale ? "さん" : "くん");

  // 表示用守備位置名を略称から変換
  const getPositionName = (pos: string) => {
    return positionMapJP[pos] || pos;
  };

  // フルネーム（姓＋名）のふりがな付き表示
  const renderFullName = (player: Player) => (
    <>
      {renderFurigana(player.lastName, player.lastNameKana)}
      {renderFurigana(player.firstName, player.firstNameKana)}
    </>
  );

  // 名字のみのふりがな付き表示
  const renderLastName = (player: Player) => renderFurigana(player.lastName, player.lastNameKana);

  // スターティングラインナップの読み上げテキスト生成（ふりがな＋敬称＋背番号）
  const createStartingLineupText = () => {
    const topTeamName = isTopTeamFirstBase ? firstBaseTeamName : thirdBaseTeamName;

    const topOrderLines = battingOrder
      .map((playerId, index) => {
        const player = teamPlayers.find((p) => p.id === playerId);
        if (!player) return null;
        const pos = Object.entries(assignments).find(([_, id]) => id === playerId)?.[0] || "-";
        const posName = getPositionName(pos);
        const honorific = getHonorific(player);

        // ふりがな読み上げ用フルネーム
        const fullKanaName = `${player.lastNameKana}${player.firstNameKana}`;

        return `${index + 1}番　${posName}　${fullKanaName}${honorific}、背番号${player.number}、`;
      })
      .filter(Boolean)
      .join("\n");

    const benchPlayers = teamPlayers.filter((p) => !battingOrder.includes(p.id));
    const benchLines = benchPlayers
      .map((p) => {
        const honorific = getHonorific(p);
        const kanaName = `${p.lastNameKana}${p.firstNameKana}`;
        return `${kanaName}${honorific}、背番号${p.number}、`;
      })
      .join("\n");

    return `
お待たせいたしました、${firstBaseTeamName}対${thirdBaseTeamName}の
スターティングラインナップ並びに審判員をお知らせいたします。

先攻（${topTeamName}）
${topOrderLines}

ベンチ入りの選手をお知らせいたします。
${benchLines}
`;
  };

  const handleSpeak = () => {
    if (speaking) return;
    const text = createStartingLineupText();
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  // 表示部分
  const renderStartingLineup = () => {
    const topTeamName = isTopTeamFirstBase ? firstBaseTeamName : thirdBaseTeamName;

    return (
      <div style={{ whiteSpace: "pre-line", fontFamily: "Yu Gothic, Meiryo, sans-serif" }}>
        <p>先攻（{topTeamName}）</p>
        {battingOrder.map((playerId, index) => {
          const player = teamPlayers.find((p) => p.id === playerId);
          if (!player) return null;
          const pos = Object.entries(assignments).find(([_, id]) => id === playerId)?.[0] || "-";
          const posName = getPositionName(pos);
          const honorific = getHonorific(player);

          return (
            <div key={playerId} style={{ marginBottom: "0.5em" }}>
              <span>{index + 1}番　</span>
              <span>{posName}　</span>
              <span>
                {renderFullName(player)}
                {honorific}、
              </span>
              <span>{posName}　</span>
              <span>
                {renderLastName(player)}
                {honorific}、背番号{player.number}、
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBenchPlayers = () => {
    const benchPlayers = teamPlayers.filter((p) => !battingOrder.includes(p.id));
    return (
      <div style={{ whiteSpace: "pre-line", marginTop: "1em" }}>
        <p>ベンチ入りの選手をお知らせいたします。</p>
        {benchPlayers.map((p) => (
          <div key={p.id} style={{ marginBottom: "0.3em" }}>
            {renderFullName(p)}
            {getHonorific(p)}、背番号{p.number}、
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">スタメン発表画面</h1>
      <p>
        お待たせいたしました、{firstBaseTeamName}対{thirdBaseTeamName}の
        <br />
        スターティングラインナップ並びに審判員をお知らせいたします。
      </p>

      {renderStartingLineup()}

      {renderBenchPlayers()}

      <div className="mt-6 space-x-4">
        <button
          onClick={handleSpeak}
          disabled={speaking}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          読み上げ開始
        </button>
        <button
          onClick={handleStop}
          disabled={!speaking}
          className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          読み上げ停止
        </button>
      </div>
    </div>
  );
};

export default AnnounceStartingLineup;
