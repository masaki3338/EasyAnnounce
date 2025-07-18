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

  const message = `お待たせいたしました。${tournamentName}、\n本日の第${matchNumber}試合、\n一塁側：${team1st}　対　三塁側：${team3rd} の試合、\nまもなく開始でございます。`;
 
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
    <button
      className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 py-3 rounded-lg text-base mt-8"
      onClick={() => {
        if (typeof onBack === "function") {
          onBack(); // App.tsx から渡された場合はこちらを優先
        } else {
          onNavigate("startGame"); // fallback
        }
      }}
    >
      ← 試合開始画面に戻る
    </button>

      <h1 className="text-2xl font-bold text-gray-800">試合開始挨拶</h1>

      <div className="flex items-center space-x-2">
        <img src="/icons/warning-icon.png" alt="注意" className="w-5 h-5" />
        <p className="text-blue-900 text-sm font-semibold">
          後攻チームが守備につくタイミング
        </p>
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
