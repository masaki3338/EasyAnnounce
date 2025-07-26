import React, { useEffect, useState, useRef } from "react";
import localForage from "localforage";

type Props = {
  onBack: () => void; // 戻るボタン用
};

const SheetKnock: React.FC<Props> = ({ onBack }) => {
  const [teamName, setTeamName] = useState("");
  const [opponentTeamName, setOpponentTeamName] = useState("");
  const [isHome, setIsHome] = useState<"先攻" | "後攻">("先攻");
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [showTwoMinModal, setShowTwoMinModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const warned2Min = useRef(false);

  useEffect(() => {
    const load = async () => {
      const team = await localForage.getItem("team");
      const matchInfo = await localForage.getItem("matchInfo");

      if (team && typeof team === "object") {
        setTeamName((team as any).name || "");
      }

      if (matchInfo && typeof matchInfo === "object") {
        const info = matchInfo as any;
        setIsHome(info.isHome === true ? "後攻" : "先攻"); //
        setOpponentTeamName(info.opponentTeam || "");
      }
    };
    load();
  }, []);

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

  const startTimer = () => {
    if (timeLeft === 0) {
      setTimeLeft(420); // 7分
    }
    setTimerActive(true);
    warned2Min.current = false;
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerActive(false);
  };

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerActive(false);
    setTimeLeft(0);
    warned2Min.current = false;
  };

  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          const next = prev - 1;

          if (next === 120 && !warned2Min.current) {
            warned2Min.current = true;
            setShowTwoMinModal(true);
            // 🔕 自動読み上げは行わない（仕様に従い speak 削除）
          }

          if (next <= 0) {
            clearInterval(timerRef.current!);
            setTimerActive(false);
            setShowEndModal(true);
            // 🔕 自動読み上げは行わない
            return 0;
          }

          return next;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current!);
  }, [timerActive]);

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

  const readingLabel = isHome === "後攻" ? "後攻チーム🎤" : "先攻チーム🎤";

  const prepMessage =
    isHome === "後攻"
      ? ` ${teamName} はシートノックの準備に入って下さい。`
      : null;

  const mainMessage =
    isHome === "後攻"
      ? ` ${teamName} はシートノックに入って下さい。\nノック時間は7分以内です。`
      : ` ${teamName} はシートノックに入って下さい。\nノック時間は同じく7分以内です。`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 text-center">

      {/* ✅ モーダル（残り2分） */}
      {showTwoMinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg text-center w-72">
            <p className="text-lg font-semibold mb-4">残り2分になりました。</p>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              onClick={() => setShowTwoMinModal(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ✅ モーダル（タイマー終了） */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg text-center w-72">
            <p className="text-lg font-semibold mb-4">タイマー終了になりました。</p>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              onClick={() => setShowEndModal(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}



      <div className="flex justify-end mb-4">
        <button className="border px-4 py-1 rounded-full text-sm">{readingLabel}</button>
      </div>

      <h1 className="text-2xl font-bold mb-6">シートノック</h1>

      {isHome === "後攻" && (
        <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold text-left">
          <span className="mr-2 text-2xl">⚠️</span> ノックの準備ができていない場合のみ
        </div>
      )}

      {prepMessage && <MessageBlock text={prepMessage} keyName="prep" />}

      {isHome === "先攻" && (
        <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold text-left">
          <span className="mr-2 text-2xl">⚠️</span>
          後攻チームのノック終了後に🎤
        </div>
      )}
      <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 mb-3 text-sm font-semibold text-left">
        <span className="mr-2 text-2xl">⚠️</span>
        最初のボールがノッカーの手から離れた時、<br/>
        もしくはボール回しから始まる場合はキャッチャーの手から<br/>
        ボールが離れてからスタート
      </div>

      <MessageBlock text={mainMessage} keyName="main" />

      <div className="flex justify-center items-center gap-4 mt-4 text-lg font-bold">
        {timeLeft === 0 && !timerActive ? (
          <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={startTimer}>
            7分タイマー開始
          </button>
        ) : (
          <>
            <span>残り時間　{formatTime(timeLeft)}</span>
            {timerActive ? (
              <button className="bg-yellow-600 text-white px-4 py-2 rounded" onClick={stopTimer}>
                STOP
              </button>
            ) : (
              <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={startTimer}>
                START
              </button>
            )}
            <button className="bg-gray-600 text-white px-4 py-2 rounded" onClick={resetTimer}>
              RESET
            </button>
          </>
        )}
      </div>

      <MessageBlock text={"ノック時間、残り2分です。"} keyName="2min" />
      <MessageBlock text={"ノックを終了してください。"} keyName="end" />
    </div>
  );
};

export default SheetKnock;
