import React, { useEffect, useState, useRef } from "react";
import localForage from "localforage";

const SheetKnock: React.FC = () => {
  const [teamName, setTeamName] = useState("");
  const [attackOrDefense, setAttackOrDefense] = useState<"先攻" | "後攻">("先攻");
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [highlight2Min, setHighlight2Min] = useState(false);
  const [highlightEnd, setHighlightEnd] = useState(false);

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
        setAttackOrDefense((matchInfo as any).attackOrDefense || "先攻");
      }
    };
    load();
  }, []);

  const getKnockText = () => {
    return attackOrDefense === "先攻"
      ? `${teamName} はシートノックに入って下さい。\nノック時間は同じく7分以内です。`
      : `${teamName} はシートノックに入って下さい。\nノック時間は7分以内です。`;
  };

  const knockText = getKnockText();

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
    setTimeLeft(7 * 60);
    setTimerActive(true);
    setHighlight2Min(false);
    setHighlightEnd(false);
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
    setHighlight2Min(false);
    setHighlightEnd(false);
    warned2Min.current = false;
  };

  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          const next = prev - 1;

          if (next === 120 && !warned2Min.current) {
            warned2Min.current = true;
            setHighlight2Min(true);
          }

          if (next <= 0) {
            clearInterval(timerRef.current!);
            setTimerActive(false);
            setHighlightEnd(true);
            return 0;
          }

          return next;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current!);
  }, [timerActive]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">試合前アナウンス - シートノック</h1>

      <p className="mb-4 text-lg">
        自チームは <strong>{attackOrDefense}</strong> です。
      </p>

      <section className="border p-4 rounded shadow-sm">
        <h2 className="text-xl font-semibold mb-2">シートノック開始</h2>

        {/* 先攻チームへの案内メッセージ */}
        {attackOrDefense === "先攻" && (
          <p className="text-red-600 font-semibold mb-4">
            後攻チームのノック終了後に行います。
          </p>
        )}

        {/* 読み上げ対象テキスト（青色・太字） */}
        <p className="whitespace-pre-wrap text-blue-700 font-bold text-lg mb-2">{knockText}</p>

        {/* 読み上げ・停止ボタン */}
        <div className="mt-2 space-x-4">
          <button
            className={`px-4 py-2 rounded text-white ${
              readingKey === "knock" ? "bg-green-600" : "bg-blue-600"
            } hover:bg-blue-700`}
            onClick={() => speak(knockText, "knock")}
          >
            読み上げ
          </button>
          <button
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={stopSpeak}
            disabled={readingKey !== "knock"}
          >
            停止
          </button>
        </div>

        {/* タイマー通知とボタン */}
        <div className="mt-6 text-center">
          {timeLeft > 0 && (
            <p className="text-2xl font-bold mb-2">残り時間: {formatTime(timeLeft)}</p>
          )}

          {/* 通知メッセージ（常時表示） */}
          <p
            className={`text-lg font-semibold mb-1 ${
              highlight2Min ? "text-red-500" : "text-gray-400"
            }`}
          >
            残り時間、2分です。
          </p>
          <p
            className={`text-lg font-semibold ${
              highlightEnd ? "text-red-600" : "text-gray-400"
            }`}
          >
            ノックを終了して下さい。
          </p>

          {!timerActive && timeLeft === 0 && (
            <button
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 mt-4"
              onClick={startTimer}
            >
              7分タイマー開始
            </button>
          )}

          {timeLeft > 0 && (
            <div className="flex justify-center gap-4 mt-4">
              <button
                className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                onClick={stopTimer}
              >
                停止
              </button>
              <button
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                onClick={resetTimer}
              >
                リセット
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SheetKnock;
