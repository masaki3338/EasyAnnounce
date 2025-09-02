import React, { useEffect, useState } from "react";
import localForage from "localforage";

interface Props {
  onNavigate: (screen: string) => void;
  onBack?: () => void; // ← ✅ 追加
}

  const StartGreeting: React.FC<Props> = ({ onNavigate, onBack }) => {
  const [reading, setReading] = useState(false);
  const [tournamentName, setTournamentName] = useState("");
  const [matchNumber, setMatchNumber] = useState("");
  const [teamName, setTeamName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [benchSide, setBenchSide] = useState<"1塁側" | "3塁側">("1塁側");
const [teamFurigana, setTeamFurigana] = useState("");
const [opponentFurigana, setOpponentFurigana] = useState("");

  useEffect(() => {
    const load = async () => {
      const team = await localForage.getItem<any>("team");
      const matchInfo = await localForage.getItem<any>("matchInfo");

      if (team) {
        setTeamName(team.name || "");
        // ★ 自チームかな（チーム登録画面の保存値を最優先）
        setTeamFurigana(team.furigana ?? team.nameFurigana ?? team.nameKana ?? "");
      }
      if (matchInfo) {
        setTournamentName(matchInfo.tournamentName || "");
        setMatchNumber(matchInfo.matchNumber || "〇");
        setOpponentName(matchInfo.opponentTeam || "");
        setBenchSide(matchInfo.benchSide || "1塁側");
        setOpponentFurigana(matchInfo.opponentTeamFurigana || "");
      }
    };
    load();
  }, []);

  const team1st = benchSide === "1塁側" ? teamName : opponentName;
  const team3rd = benchSide === "3塁側" ? teamName : opponentName;
// ★ 読み上げ用（かな優先、無ければ漢字名にフォールバック）
const team1stRead = benchSide === "1塁側" ? (teamFurigana || teamName) : (opponentFurigana || opponentName);
const team3rdRead = benchSide === "3塁側" ? (teamFurigana || teamName) : (opponentFurigana || opponentName);

// ★ 読み上げ用の文章（読みにくい語は少し“かな寄せ”）
const messageSpeak =
  `おまたせいたしました。${tournamentName}。` +
  `ほんじつの だい ${matchNumber} しあい、` +
  `いちるいがわ：${team1stRead} たい さんるいがわ：${team3rdRead} の しあい、` +
  `まもなく かいし でございます。`;

  const message = `お待たせいたしました。${tournamentName} \n本日の第${matchNumber}試合、\n一塁側：${team1st}　対　三塁側：${team3rd} の試合、\nまもなく開始でございます。`;
 
  const handleSpeak = () => {
    const utter = new SpeechSynthesisUtterance(messageSpeak); // ← ★ かな文に変更
    utter.lang = "ja-JP";
    utter.onstart = () => setReading(true);
    utter.onend = () => setReading(false);
    utter.onerror = () => setReading(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  };

  const handleStop = () => {
    speechSynthesis.cancel();
    setReading(false);
  };

  return (
    <div className="min-h-screen bg-white p-6 flex flex-col items-center space-y-6">


      <div className="flex justify-center items-center mb-6 space-x-2">
        {/* 中央タイトル */}
        <h1 className="text-2xl font-bold">試合開始挨拶</h1>
        {/* 右隣ボタン */}
        <button className="border px-4 py-1 rounded-full text-sm">先攻チーム🎤</button>
      </div>

      <div className="flex items-center space-x-2">
        <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold text-left">
          <span className="mr-2 text-2xl">⚠️</span> 後攻チームが守備につくタイミング 
        </div>
      </div>

      <div className="border border-red-500 bg-red-200 text-red-700 p-4 rounded relative text-left">
        <img src="/icons/mic-red.png" alt="Mic" className="w-10 h-10" />
        <p className="text-red-600 font-semibold whitespace-pre-wrap text-sm">
          {message}
        </p>
      </div>

      <div className="space-x-4">
        <button
          onClick={handleSpeak}
          className={`px-6 py-2 rounded text-white ${
            reading ? "bg-green-600" : "bg-blue-600"
          } hover:bg-blue-700`}
        >
          読み上げ
        </button>
        <button
          onClick={handleStop}
          className="px-6 py-2 rounded bg-red-600 text-white hover:bg-red-700"
          disabled={!reading}
        >
          停止
        </button>
      </div>
    </div>
  );
};

export default StartGreeting;
