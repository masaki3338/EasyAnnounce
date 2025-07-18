import React, { useState, useRef, useEffect } from "react";
import localForage from "localforage";
import { ScreenType } from "./App";

const Warmup: React.FC<{ onBack: () => void; onNavigate?: (screen: ScreenType) => void }> = ({ onBack }) => {
  const [teamName, setTeamName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [benchSide, setBenchSide] = useState<"1塁側" | "3塁側">("1塁側");
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [timer1Active, setTimer1Active] = useState(false);
  const [timer1TimeLeft, setTimer1TimeLeft] = useState(0);
  const [timer2Active, setTimer2Active] = useState(false);
  const [timer2TimeLeft, setTimer2TimeLeft] = useState(0);
  const [showEndModal1, setShowEndModal1] = useState(false);
  const [showEndModal2, setShowEndModal2] = useState(false);

const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const team1 = benchSide === "1塁側" ? teamName : opponentName;
  const team3 = benchSide === "3塁側" ? teamName : opponentName;

  const speak = (text: string, key: string) => {
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = "ja-JP";
    uttr.onstart = () => setReadingKey(key);
    uttr.onend = () => setReadingKey(null);
    uttr.onerror = () => setReadingKey(null);
    window.speechSynthesis.speak(uttr);
  };

  const stopSpeak = () => {
    window.speechSynthesis.cancel();
    setReadingKey(null);
  };

  const startTimer = (num: 1 | 2) => {
    if (num === 1) {
      setTimer1TimeLeft(300);
      setTimer1Active(true);
    } else {
      setTimer2TimeLeft(300);
      setTimer2Active(true);
    }
  };

  const stopTimer = (num: 1 | 2) => {
    if (num === 1 && timer1Ref.current) {
      clearInterval(timer1Ref.current);
      setTimer1Active(false);
    }
    if (num === 2 && timer2Ref.current) {
      clearInterval(timer2Ref.current);
      setTimer2Active(false);
    }
  };

  const resetTimer = (num: 1 | 2) => {
    if (num === 1 && timer1Ref.current) {
      clearInterval(timer1Ref.current);
      setTimer1TimeLeft(0);
      setTimer1Active(false);
    }
    if (num === 2 && timer2Ref.current) {
      clearInterval(timer2Ref.current);
      setTimer2TimeLeft(0);
      setTimer2Active(false);
    }
  };

  useEffect(() => {
    if (timer1Active) {
      timer1Ref.current = setInterval(() => {
        setTimer1TimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer1Ref.current!);
            setTimer1Active(false);
            setShowEndModal1(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer1Ref.current!);
  }, [timer1Active]);

  useEffect(() => {
    if (timer2Active) {
      timer2Ref.current = setInterval(() => {
        setTimer2TimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer2Ref.current!);
            setTimer2Active(false);
            setShowEndModal2(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer2Ref.current!);
  }, [timer2Active]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}分${s.toString().padStart(2, "0")}秒`;
  };

  const MessageBlock = ({ text, keyName }: { text: string; keyName: string }) => (
    <div className="border border-black p-4 my-3 bg-white rounded-md">
      <div className="flex items-start gap-2 mb-2">
        <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6" />
        <p className="text-red-600 font-bold whitespace-pre-wrap">{text}</p>
      </div>
      <div className="flex gap-2">
        <button
          className={`px-4 py-1 text-white rounded ${readingKey === keyName ? "bg-green-600" : "bg-blue-600"}`}
          onClick={() => speak(text, keyName)}
        >
          読み上げ
        </button>
        <button
          className="px-4 py-1 text-white bg-red-600 rounded"
          onClick={stopSpeak}
          disabled={readingKey !== keyName}
        >
          停止
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 text-center">
      {/* モーダル */}
      {showEndModal1 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg text-center w-72">
            <p className="text-lg font-semibold mb-4">タイマーが終了しました。</p>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              onClick={() => setShowEndModal1(false)}
            >OK</button>
          </div>
        </div>
      )}
      {showEndModal2 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg text-center w-72">
            <p className="text-lg font-semibold mb-4">タイマーが終了しました。</p>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              onClick={() => setShowEndModal2(false)}
            >OK</button>
          </div>
        </div>
      )}

      <button onClick={onBack} className="mb-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 text-sm">
        ← 試合前アナウンスメニューに戻る
      </button>

      <div className="flex justify-end mb-4">
        <button className="border px-4 py-1 rounded-full text-sm">後攻チーム読み上げ</button>
      </div>

      <h1 className="text-2xl font-bold mb-4">ウォーミングアップ</h1>

      <div className="flex items-center justify-center bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold">
        <span className="mr-2 text-2xl">⚠️</span> 試合開始30分前にアナウンス
      </div>

      <MessageBlock
        text={`両チームはウォーミングアップに入って下さい。\n（1塁側　${team1}）はトスバッティング、\n（3塁側　${team3}）はキャッチボールを開始してください。`}
        keyName="start"
      />

      <div className="flex justify-center items-center gap-4 mt-2 font-bold">
        {timer1TimeLeft === 0 && !timer1Active ? (
          <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => startTimer(1)}>
            5分間タイマー開始
          </button>
        ) : (
          <>
            <span>残り時間　{formatTime(timer1TimeLeft)}</span>
            {timer1Active ? (
              <button className="bg-yellow-600 text-white px-4 py-2 rounded" onClick={() => stopTimer(1)}>
                STOP
              </button>
            ) : (
              <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => startTimer(1)}>
                START
              </button>
            )}
            <button className="bg-gray-600 text-white px-4 py-2 rounded" onClick={() => resetTimer(1)}>
              RESET
            </button>
          </>
        )}
      </div>

      <MessageBlock text="両チーム交代してください。" keyName="switch" />

      <div className="flex justify-center items-center gap-4 mt-2 font-bold">
        {timer2TimeLeft === 0 && !timer2Active ? (
          <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => startTimer(2)}>
            5分間タイマー開始
          </button>
        ) : (
          <>
            <span>残り時間　{formatTime(timer2TimeLeft)}</span>
            {timer2Active ? (
              <button className="bg-yellow-600 text-white px-4 py-2 rounded" onClick={() => stopTimer(2)}>
                STOP
              </button>
            ) : (
              <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => startTimer(2)}>
                START
              </button>
            )}
            <button className="bg-gray-600 text-white px-4 py-2 rounded" onClick={() => resetTimer(2)}>
              RESET
            </button>
          </>
        )}
      </div>

      <MessageBlock text="ウォーミングアップを終了してください。" keyName="end" />
    </div>
  );
};

export default Warmup;
