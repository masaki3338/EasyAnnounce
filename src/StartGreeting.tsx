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

  useEffect(() => {
    const load = async () => {
      const team = await localForage.getItem<any>("team");
      const matchInfo = await localForage.getItem<any>("matchInfo");

      if (team) setTeamName(team.name || "");
      if (matchInfo) {
        setTournamentName(matchInfo.tournamentName || "");
        setMatchNumber(matchInfo.matchNumber || "〇");
        setOpponentName(matchInfo.opponentTeam || "");
        setBenchSide(matchInfo.benchSide || "1塁側");
      }
    };
    load();
  }, []);

  const team1st = benchSide === "1塁側" ? teamName : opponentName;
  const team3rd = benchSide === "3塁側" ? teamName : opponentName;

  const message = `お待たせいたしました。${tournamentName} \n本日の第${matchNumber}試合、\n一塁側：${team1st}　対　三塁側：${team3rd} の試合、\nまもなく開始でございます。`;
 
  const handleSpeak = () => {
    const utter = new SpeechSynthesisUtterance(message);
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


      <h1 className="text-2xl font-bold text-gray-800">試合開始挨拶</h1>

      <div className="flex items-center space-x-2">
        <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold text-left">
          <span className="mr-2 text-2xl">⚠️</span> 後攻チームが守備につくタイミング  ※先攻チーム🎤
        </div>
      </div>

      <div className="border border-black bg-red-50 p-4 rounded-md flex items-start space-x-4 max-w-xl">
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
