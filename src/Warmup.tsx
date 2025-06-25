import React, { useState, useRef, useEffect } from "react";
import localForage from "localforage";

const Warmup: React.FC = () => {
  const [teamName, setTeamName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [benchSide, setBenchSide] = useState<"1塁側" | "3塁側">("1塁側");

  // 読み上げ中の項目キー
  const [readingKey, setReadingKey] = useState<string | null>(null);

  // 2つのタイマー用ステート
  const [timer1Active, setTimer1Active] = useState(false);
  const [timer1TimeLeft, setTimer1TimeLeft] = useState(0);

  const [timer2Active, setTimer2Active] = useState(false);
  const [timer2TimeLeft, setTimer2TimeLeft] = useState(0);

  const timer1Ref = useRef<NodeJS.Timeout | null>(null);
  const timer2Ref = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const load = async () => {
      const matchInfo = await localForage.getItem("matchInfo");
      const team = await localForage.getItem("team");

      if (matchInfo && typeof matchInfo === "object") {
        const mi = matchInfo as any;
        setOpponentName(mi.opponentTeam || "");
        setBenchSide(mi.benchSide || "1塁側");
      }

      if (team && typeof team === "object") {
        setTeamName((team as any).name || "");
      }
    };
    load();
  }, []);

  const team1BaseSide = benchSide === "1塁側" ? teamName : opponentName;
  const team3BaseSide = benchSide === "3塁側" ? teamName : opponentName;

  // 音声読み上げ関数
  const handleSpeak = (text: string, key: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.onstart = () => setReadingKey(key);
    utterance.onend = () => setReadingKey(null);
    utterance.onerror = () => setReadingKey(null);
    window.speechSynthesis.speak(utterance);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setReadingKey(null);
  };

  // タイマー制御関数
  const startTimer = (timerNum: 1 | 2) => {
    if (timerNum === 1) {
      setTimer1TimeLeft(5 * 60);
      setTimer1Active(true);
    } else {
      setTimer2TimeLeft(5 * 60);
      setTimer2Active(true);
    }
  };

  const stopTimer = (timerNum: 1 | 2) => {
    if (timerNum === 1 && timer1Ref.current) {
      clearInterval(timer1Ref.current);
      setTimer1Active(false);
    }
    if (timerNum === 2 && timer2Ref.current) {
      clearInterval(timer2Ref.current);
      setTimer2Active(false);
    }
  };

  const resetTimer = (timerNum: 1 | 2) => {
    if (timerNum === 1 && timer1Ref.current) {
      clearInterval(timer1Ref.current);
      setTimer1TimeLeft(0);
      setTimer1Active(false);
    }
    if (timerNum === 2 && timer2Ref.current) {
      clearInterval(timer2Ref.current);
      setTimer2TimeLeft(0);
      setTimer2Active(false);
    }
  };

  // タイマーの副作用：カウントダウン処理
  useEffect(() => {
    if (timer1Active && timer1TimeLeft > 0) {
      timer1Ref.current = setInterval(() => {
        setTimer1TimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer1Ref.current!);
            setTimer1Active(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer1Ref.current!);
  }, [timer1Active]);

  useEffect(() => {
    if (timer2Active && timer2TimeLeft > 0) {
      timer2Ref.current = setInterval(() => {
        setTimer2TimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer2Ref.current!);
            setTimer2Active(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer2Ref.current!);
  }, [timer2Active]);

  // 時間表示整形
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // 読み上げテキスト
  const warmingUpStartText = `両チームはウォーミングアップに入って下さい。\n（1塁側 ${team1BaseSide}）はトスバッティング、\n（3塁側 ${team3BaseSide}）はキャッチボールを開始してください。`;

  const switchTeamsText = "両チーム交代してください。";

  const warmingUpEndText = "ウォーミングアップを終了してください。";

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">試合前アナウンス - ウォーミングアップ</h1>

      {/* ウォーミングアップ開始 */}
      <section className="border p-4 rounded mb-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-2">ウォーミングアップ開始</h2>
        <p className="whitespace-pre-wrap">{warmingUpStartText}</p>
        <div className="mt-4 space-x-4">
          <button
            className={`px-4 py-2 rounded text-white ${
              readingKey === "warmingUpStart" ? "bg-green-600" : "bg-blue-600"
            } hover:bg-blue-700`}
            onClick={() => handleSpeak(warmingUpStartText, "warmingUpStart")}
          >
            読み上げ
          </button>
          <button
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={handleStop}
            disabled={readingKey !== "warmingUpStart"}
          >
            停止
          </button>
        </div>

        {/* タイマー */}
        <div className="mt-4">
          {timer1TimeLeft > 0 && (
            <p className="text-2xl font-bold text-center">残り時間: {formatTime(timer1TimeLeft)}</p>
          )}
          {!timer1Active && timer1TimeLeft === 0 && (
            <button
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              onClick={() => startTimer(1)}
            >
              5分間タイマー開始
            </button>
          )}
          {timer1TimeLeft > 0 && (
            <div className="flex justify-center space-x-4 mt-2">
              <button
                className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                onClick={() => stopTimer(1)}
              >
                ストップ
              </button>
              <button
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                onClick={() => resetTimer(1)}
              >
                リセット
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 両チーム交代 */}
      <section className="border p-4 rounded mb-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-2">両チーム交代</h2>
        <p>{switchTeamsText}</p>
        <div className="mt-2 space-x-4">
          <button
            className={`px-4 py-2 rounded text-white ${
              readingKey === "switchTeams" ? "bg-green-600" : "bg-blue-600"
            } hover:bg-blue-700`}
            onClick={() => handleSpeak(switchTeamsText, "switchTeams")}
          >
            読み上げ
          </button>
          <button
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={handleStop}
            disabled={readingKey !== "switchTeams"}
          >
            停止
          </button>
        </div>

        {/* タイマー */}
        <div className="mt-4">
          {timer2TimeLeft > 0 && (
            <p className="text-2xl font-bold text-center">残り時間: {formatTime(timer2TimeLeft)}</p>
          )}
          {!timer2Active && timer2TimeLeft === 0 && (
            <button
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              onClick={() => startTimer(2)}
            >
              5分間タイマー開始
            </button>
          )}
          {timer2TimeLeft > 0 && (
            <div className="flex justify-center space-x-4 mt-2">
              <button
                className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                onClick={() => stopTimer(2)}
              >
                ストップ
              </button>
              <button
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                onClick={() => resetTimer(2)}
              >
                リセット
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ウォーミングアップ終了 */}
      <section className="border p-4 rounded shadow-sm">
        <h2 className="text-xl font-semibold mb-2">ウォーミングアップ終了</h2>
        <p>{warmingUpEndText}</p>
        <div className="mt-2 space-x-4">
          <button
            className={`px-4 py-2 rounded text-white ${
              readingKey === "warmingUpEnd" ? "bg-green-600" : "bg-blue-600"
            } hover:bg-blue-700`}
            onClick={() => handleSpeak(warmingUpEndText, "warmingUpEnd")}
          >
            読み上げ
          </button>
          <button
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={handleStop}
            disabled={readingKey !== "warmingUpEnd"}
          >
            停止
          </button>
        </div>
      </section>
    </div>
  );
};

export default Warmup;
