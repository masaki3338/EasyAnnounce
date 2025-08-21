import React, { useState, useEffect, useRef } from "react";
import localForage from "localforage";
import { ScreenType } from "./App"; // ✅ 追加

const positionMapJP: Record<string, string> = {
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

const AnnounceStartingLineup: React.FC<{ onNavigate: (screen: ScreenType) => void }> = ({ onNavigate }) => {
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [assignments, setAssignments] = useState<{ [pos: string]: number | null }>({});
  const [battingOrder, setBattingOrder] = useState<{ id: number; reason: string }[]>([]);
  const [homeTeamName, setHomeTeamName] = useState<string>("");
  const [awayTeamName, setAwayTeamName] = useState<string>("");
  const [isHomeTeamFirstAttack, setIsHomeTeamFirstAttack] = useState<boolean>(true);
  const [umpires, setUmpires] = useState<Umpire[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const startingIds = battingOrder.map((e) => e.id);
  const [benchOutIds, setBenchOutIds] = useState<number[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const benchOut = await localForage.getItem<number[]>("benchOutIds");
      if (Array.isArray(benchOut)) {
        setBenchOutIds(benchOut);
      }
    };
    loadData();
  }, []);

useEffect(() => {
  const loadData = async () => {
    const [team, matchInfo] = await Promise.all([
      localForage.getItem<{ name: string; players: Player[] }>("team"),
      localForage.getItem("matchInfo"),
    ]);

    // ★ StartGame と同じ優先順位で読む（starting* → 通常キー）
    const assignRaw =
      (await localForage.getItem<Record<string, number | null>>("startingassignments")) ??
      (await localForage.getItem<Record<string, number | null>>("lineupAssignments")) ??
      {};

    const orderRaw =
      (await localForage.getItem<Array<{ id?: number; playerId?: number; reason?: string }>>("startingBattingOrder")) ??
      (await localForage.getItem<Array<{ id?: number; playerId?: number; reason?: string }>>("battingOrder")) ??
      [];

    // ID を数値に正規化（null はそのまま）
    const normalizedAssign: { [pos: string]: number | null } = {};
    Object.entries(assignRaw).forEach(([pos, id]) => {
      normalizedAssign[pos] = id == null ? null : Number(id);
    });
    setAssignments(normalizedAssign);

    // 打順も {id, reason} に正規化（playerId 形式も吸収）
    const normalizedOrder = (orderRaw as any[])
      .map((e) => {
        const id = typeof e?.id === "number" ? e.id : e?.playerId;
        if (typeof id !== "number") return null;
        return { id: Number(id), reason: e?.reason ?? "スタメン" };
      })
      .filter(Boolean)
      .slice(0, 9) as { id: number; reason: string }[];
    setBattingOrder(normalizedOrder);

    if (team) {
      setTeamPlayers((team as any).players || []);
      setHomeTeamName((team as any).name || "");
    }
    if (matchInfo && typeof matchInfo === "object") {
      const mi = matchInfo as any;
      setAwayTeamName(mi.opponentTeam || "");
      setIsHomeTeamFirstAttack(!mi.isHome);
      if (Array.isArray(mi.umpires)) setUmpires(mi.umpires);
    }
  };
  loadData();
}, []);


  const getPositionName = (pos: string) => positionMapJP[pos] || pos;
  const getHonorific = (p: Player) => (p.isFemale ? "さん" : "くん");

  const renderFurigana = (kanji: string, kana: string) => (
    <ruby className="ruby-text">
      {kanji}
      <rt className="ruby-reading">{kana}</rt>
    </ruby>
  );

  const renderFullName = (p: Player) => (
    <>
      {renderFurigana(p.lastName, p.lastNameKana)}
      {renderFurigana(p.firstName, p.firstNameKana)}
    </>
  );

  const renderLastName = (p: Player) => renderFurigana(p.lastName, p.lastNameKana);

  const createSpeechText = () => {
    const selfTeamName = homeTeamName;
    const header = isHomeTeamFirstAttack
      ? `お待たせいたしました、${selfTeamName}対${awayTeamName}のスターティングラインナップ並びに審判員をお知らせいたします。`
      : "";

    const lineupLabel = isHomeTeamFirstAttack
      ? `先攻（${selfTeamName}）`
      : `続きまして後攻（${selfTeamName}）`;

    const lineupText = battingOrder
      .map((entry, idx) => {
        const p = teamPlayers.find((pl) => pl.id === entry.id);
        if (!p) return null;
        const pos = Object.entries(assignments).find(([_, pid]) => pid === entry.id)?.[0] || "-";
        const posName = getPositionName(pos);
        const honorific = getHonorific(p);
        return `${idx + 1}番　[${posName}]　${p.lastNameKana}${p.firstNameKana}${honorific}、　[${posName}]　${p.lastNameKana}${honorific}、背番号${p.number}、`;
      })
      .filter(Boolean)
      .join("\n");

    const benchText = teamPlayers
      .filter((p) => !battingOrder.includes(p.id))
      .map((p) => `${p.lastNameKana}${p.firstNameKana}${getHonorific(p)}、背番号${p.number}、`)
      .join("\n");

    const umpireText =
      umpires.length === 4
        ? `なお、この試合の審判は球審（${umpires[0].name}）、塁審は1塁（${umpires[1].name}）、2塁（${umpires[2].name}）、3塁（${umpires[3].name}）以上4氏でございます。試合開始まで今しばらくお待ちください。`
        : "";

    return `${header}\n${lineupLabel}\n${lineupText}\nベンチ入りの選手をお知らせいたします。\n${benchText}\n${umpireText}`;
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
    <div className="p-6 max-w-4xl mx-auto bg-white border rounded-xl shadow">


      <div className="flex justify-center items-center mb-6 space-x-2">
        {/* 中央タイトル */}
        <h1 className="text-2xl font-bold">スタメン発表</h1>
        {isHomeTeamFirstAttack && (
          <button className="border px-4 py-1 rounded-full text-sm">先攻チーム🎤</button>
        )}
        {!isHomeTeamFirstAttack && (
          <button className="border px-4 py-1 rounded-full text-sm">後攻チーム🎤</button>
        )}
      </div>


      {isHomeTeamFirstAttack && (
        
       <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold text-left">
          <span className="mr-2 text-2xl">⚠️</span> シートノック後、グラウンド整備中に読み上げ 
        </div>
      )}
      {!isHomeTeamFirstAttack && (
       <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold text-left">
          <span className="mr-2 text-2xl">⚠️</span> 先攻チームのアナウンスが終わったタイミング 
        </div>
      )}
    

      <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left font-bold">
        <div className="flex flex-col items-start">
          <img src="/icons/mic-red.png" className="w-6 h-6 mb-2" alt="Mic" />
          <div>
            {isHomeTeamFirstAttack && (
              <p>
                お待たせいたしました、{homeTeamName} 対 {awayTeamName} のスターティングラインナップ並びに審判員をお知らせいたします。
              </p>
            )}
            <p className="mt-2 font-bold">
              {isHomeTeamFirstAttack ? `先攻 ${homeTeamName} ` : `続きまして後攻 ${homeTeamName} `}
            </p>

            {battingOrder.map((entry, idx) => {
              const p = teamPlayers.find((pl) => pl.id === entry.id);
              if (!p) return null;
              const pos = Object.entries(assignments).find(([_, pid]) => pid === p.id)?.[0] || "-";
              const posName = getPositionName(pos);
              const honorific = getHonorific(p);
              return (
                <p key={entry.id}>
                  {idx + 1}番 {posName} {renderFullName(p)}{honorific}、{posName} {renderLastName(p)}{honorific}、背番号{p.number}、
                </p>
              );
            })}

            <p className="mt-4">ベンチ入りの選手をお知らせいたします。</p>
            {teamPlayers
              .filter((p) => !startingIds.includes(p.id) && !benchOutIds.includes(p.id)) // ✅ 控えのみ
              .map((p) => (
                <p key={p.id}>
                  {renderFullName(p)}{getHonorific(p)}、背番号{p.number}、
                </p>
              ))}

            {!isHomeTeamFirstAttack && umpires.length === 4 && (
              <p className="mt-4">
                なお、この試合の審判は 球審（{renderFurigana(umpires[0].name, umpires[0].furigana)}）、
                塁審は1塁（{renderFurigana(umpires[1].name, umpires[1].furigana)}）、
                2塁（{renderFurigana(umpires[2].name, umpires[2].furigana)}）、
                3塁（{renderFurigana(umpires[3].name, umpires[3].furigana)}）以上4氏でございます。
                試合開始まで今しばらくお待ちください。
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-4">
        <button
          onClick={handleSpeak}
          disabled={speaking}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow disabled:bg-gray-400"
        >
          読み上げ
        </button>
        <button
          onClick={handleStop}
          disabled={!speaking}
          className="bg-red-600 text-white px-4 py-2 rounded shadow disabled:bg-gray-400"
        >
          停止
        </button>
      </div>
    </div>
  );
};

export default AnnounceStartingLineup;
