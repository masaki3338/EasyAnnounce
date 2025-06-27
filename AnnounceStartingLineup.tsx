import React, { useState, useEffect, useRef } from "react";
import localForage from "localforage";

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
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  number: string;
  isFemale?: boolean;
};

type Umpire = {
  role: string;
  name: string;
  furigana: string;
};

const AnnounceStartingLineup: React.FC = () => {
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [battingOrder, setBattingOrder] = useState<number[]>([]);
  const [homeTeamName, setHomeTeamName] = useState<string>("");
  const [awayTeamName, setAwayTeamName] = useState<string>("");
  const [isHomeTeamFirstAttack, setIsHomeTeamFirstAttack] = useState<boolean>(true); // trueなら自チーム先攻
  const [umpires, setUmpires] = useState<Umpire[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const [
        team,
        assign,
        order,
        matchInfo,
        umpireInfo,
      ] = await Promise.all([
        localForage.getItem<{ name: string; players: Player[] }>("team"),
        localForage.getItem("lineupAssignments"),
        localForage.getItem("battingOrder"),
        localForage.getItem("matchInfo"),
      ]);

      if (team) {
        setTeamPlayers(team.players || []);
        setHomeTeamName(team.name || "");
      }

      if (assign && typeof assign === "object") {
        setAssignments(assign as { [pos: string]: number | null });
      }

      if (Array.isArray(order)) {
        setBattingOrder(order.map((id) => Number(id)));
      }

      if (matchInfo && typeof matchInfo === "object") {
        const mi = matchInfo as any;
        setAwayTeamName(mi.opponentTeam || "");
        setIsHomeTeamFirstAttack(mi.isHome !== "後攻");
        // ✅ この行を追加して審判情報を読み込む
        if (Array.isArray(mi.umpires)) {
          setUmpires(mi.umpires);
        }
      }      
    };
    loadData();
  }, []);

  const getPositionName = (pos: string) => positionMapJP[pos] || pos;

  const getHonorific = (p: Player) => (p.isFemale ? "さん" : "くん");

  const renderFurigana = (kanji: string, kana: string) => (
    <ruby>
      {kanji}
      <rt style={{ fontSize: "0.6em" }}>{kana}</rt>
    </ruby>
  );

  const renderFullName = (p: Player) => (
    <>
      {renderFurigana(p.lastName, p.lastNameKana)}
      {renderFurigana(p.firstName, p.firstNameKana)}
    </>
  );

  const renderLastName = (p: Player) => renderFurigana(p.lastName, p.lastNameKana);

  // 読み上げテキスト作成（必要に応じて改造してください）
  const createSpeechText = () => {
    const selfTeamName = homeTeamName;

    const header = isHomeTeamFirstAttack
      ? `お待たせいたしました、${selfTeamName}対${awayTeamName}の
スターティングラインナップ並びに審判員をお知らせいたします。\n`
      : "";

    const lineupLabel = isHomeTeamFirstAttack
      ? `先攻（${selfTeamName}）\n`
      : `続きまして後攻（${selfTeamName}）\n`;

    const lineupText = battingOrder
      .map((id, idx) => {
        const p = teamPlayers.find((pl) => pl.id === id);
        if (!p) return null;
        const pos = Object.entries(assignments).find(([_, pid]) => pid === id)?.[0] || "-";
        const posName = getPositionName(pos);
        const honorific = getHonorific(p);
        return `　${idx + 1}番　[${posName}]　${p.lastNameKana}${p.firstNameKana}${honorific}、　[${posName}]　${p.lastNameKana}${honorific}、背番号${p.number}、`;
      })
      .filter(Boolean)
      .join("\n");

    const benchText = teamPlayers
      .filter((p) => !battingOrder.includes(p.id))
      .map((p) => `${p.lastNameKana}${p.firstNameKana}${getHonorific(p)}、背番号${p.number}、`)
      .join("\n");

    const umpireText =
      umpires.length === 4
        ? `なお、この試合の審判は
球審（${umpires[0].name}）、塁審は1塁（${umpires[1].name}）、2塁（${umpires[2].name}）、3塁（${umpires[3].name}）
以上4氏でございます。
試合開始まで今しばらくお待ちください。`
        : "";

    return `${header}\n${lineupLabel}\n${lineupText}\n\nベンチ入りの選手をお知らせいたします。\n${benchText}\n\n${umpireText}`;
  };

  const handleSpeak = () => {
    if (speaking) return;
    const text = createSpeechText();
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

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">スタメン発表画面</h1>

      {/* 先攻のときだけ表示 */}
      {isHomeTeamFirstAttack && (
        <p>
          お待たせいたしました、{homeTeamName}対{awayTeamName}の
          <br />
          スターティングラインナップ並びに審判員をお知らせいたします。
        </p>
      )}

      <div className="mt-4 whitespace-pre-line font-mono">
        {isHomeTeamFirstAttack ? (
          <>
            <p>先攻（{homeTeamName}）</p>
            {battingOrder.map((id, idx) => {
              const p = teamPlayers.find((pl) => pl.id === id);
              if (!p) return null;
              const pos = Object.entries(assignments).find(([_, pid]) => pid === id)?.[0] || "-";
              const posName = getPositionName(pos);
              const honorific = getHonorific(p);
              return (
                <p key={id}>
                  {idx + 1}番　[{posName}]　{renderFullName(p)}
                  {honorific}、　[{posName}]　{renderLastName(p)}
                  {honorific}、背番号{p.number}、
                </p>
              );
            })}
          </>
        ) : (
          <>
            <p>続きまして後攻（{homeTeamName}）</p>
            {battingOrder.map((id, idx) => {
              const p = teamPlayers.find((pl) => pl.id === id);
              if (!p) return null;
              const pos = Object.entries(assignments).find(([_, pid]) => pid === id)?.[0] || "-";
              const posName = getPositionName(pos);
              const honorific = getHonorific(p);
              return (
                <p key={id}>
                  {idx + 1}番　[{posName}]　{renderFullName(p)}
                  {honorific}、　[{posName}]　{renderLastName(p)}
                  {honorific}、背番号{p.number}、
                </p>
              );
            })}
          </>
        )}

        <p className="mt-4">ベンチ入りの選手をお知らせいたします。</p>
        {teamPlayers
          .filter((p) => !battingOrder.includes(p.id))
          .map((p) => (
            <p key={p.id}>
              {renderFullName(p)}
              {getHonorific(p)}、背番号{p.number}、
            </p>
          ))}

        {/* 審判名表示 */}
        {!isHomeTeamFirstAttack && umpires.length === 4 && (
          <p className="mt-6 whitespace-pre-line">
          なお、この試合の審判は
              <br />
              球審（{renderFurigana(umpires[0].name, umpires[0].furigana)}）、
              塁審は1塁（{renderFurigana(umpires[1].name, umpires[1].furigana)}）、
              2塁（{renderFurigana(umpires[2].name, umpires[2].furigana)}）、
              3塁（{renderFurigana(umpires[3].name, umpires[3].furigana)}）
              <br />
              以上4氏でございます。
              <br />
              試合開始まで今しばらくお待ちください。
          </p>
        )}
      </div>

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
