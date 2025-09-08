// SheetKnock.tsx（全文置き換え）
import React, { useEffect, useState, useRef } from "react";
import localForage from "localforage";

type Props = {
  onBack: () => void; // 戻るボタン用
};

/* ====== ミニSVGアイコン（依存なし） ====== */
const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);
const IconKnock = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 2l7 4v5c0 5-3.5 9.5-7 10-3.5-.5-7-5-7-10V6l7-4zM8 11h8v2H8v-2z" />
  </svg>
);
const IconGym = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4.5" r="2" />
    <path d="M4 9 L12 8 L20 9" />
    <path d="M12 8 L12 14" />
    <path d="M12 14 L7.5 19" />
    <path d="M12 14 L16.5 19" />
  </svg>
);
const IconAlert: React.FC = () => (
  <img
    src="/icons/warning-icon.png"        // ← public/icons/warning-icon.png
    alt="注意"
    className="w-6 h-6 object-contain select-none pointer-events-none"
    aria-hidden
    draggable={false}
    width={24}
    height={24}
  />
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm-7-3h2a5 5 0 0010 0h2a7 7 0 01-6 6.9V20h3v2H8v-2h3v-2.1A7 7 0 015 11z"/>
  </svg>
);
const IconTimer = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M15 1H9v2h6V1zm-3 4a9 9 0 109 9 9 9 0 00-9-9zm0 16a7 7 0 117-7 7 7 0 01-7 7zm1-11h-2v5h5v-2h-3z"/>
  </svg>
);

/* ====== 共通カード（番号バッジ＋アイコン＋タイトル） ====== */
const StepCard: React.FC<{
  step: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: "blue" | "amber" | "red" | "gray";
}> = ({ step, icon, title, children, accent = "blue" }) => {
  const accents: Record<string, string> = {
    blue: "from-sky-400/25 via-sky-400/10 to-sky-300/5 border-sky-300/60 ring-sky-300/30",
    amber: "from-amber-400/25 via-amber-400/10 to-amber-300/5 border-amber-300/60 ring-amber-300/30",
    red: "from-rose-400/25 via-rose-400/10 to-rose-300/5 border-rose-300/60 ring-rose-300/30",
    gray: "from-white/10 via-white/5 to-transparent border-white/10 ring-white/10",
  };


  return (
    <section className={`relative rounded-2xl p-4 shadow-lg text-left
      bg-gradient-to-br ${accents[accent]}
      border ring-1 ring-inset`}>
      {/* 左の番号バッジ */}
      <div className="absolute -left-3 -top-3 w-8 h-8 rounded-full bg-white/90 text-gray-800 text-sm font-bold shadow flex items-center justify-center">
        {step}
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-white">
          {icon}
        </div>
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
};

/* ====== 読み上げ用のメッセージカード ====== */
const MessageBlock: React.FC<{
  text: string;
  keyName: string;
  readingKey: string | null;
  onSpeak: (t: string, k: string) => void;
  onStop: () => void;
  label?: string;
}> = ({ text, keyName, readingKey, onSpeak, onStop, label }) => (
// 置き換え：MessageBlock の返却JSX内（最外の <div> の className）
<div className="
  rounded-2xl p-4
  border border-rose-500/80
  bg-gradient-to-br from-rose-600/40 via-rose-500/35 to-rose-400/30
  ring-1 ring-inset ring-rose-500/50
  shadow-lg
">
  <div className="flex items-start gap-2 mb-2">
    <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6" />
    <div className="flex-1">
      {label && <div className="text-[11px] text-rose-50/90 mb-1">{label}</div>}
      {/* ← 文言は白文字で視認性UP */}
      <p className="text-white whitespace-pre-wrap font-semibold leading-relaxed drop-shadow">
        {text}
      </p>
    </div>
  </div>
  <div className="flex gap-2">
    <button
      className={`px-4 py-2 text-white rounded-lg shadow ${readingKey === keyName ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"} active:scale-95`}
      onClick={() => onSpeak(text, keyName)}
    >
      読み上げ
    </button>
    <button
      className="px-4 py-2 text-white bg-gray-600 hover:bg-gray-700 rounded-lg shadow active:scale-95 disabled:opacity-50"
      onClick={onStop}
      disabled={readingKey !== keyName}
    >
      停止
    </button>
  </div>
</div>

);

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
        setIsHome(info.isHome === true ? "後攻" : "先攻");
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
    if (timeLeft === 0) setTimeLeft(420); // 7分
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
          }
          if (next <= 0) {
            clearInterval(timerRef.current!);
            setTimerActive(false);
            setShowEndModal(true);
            return 0;
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current!);
  }, [timerActive, timeLeft]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const prepMessage =
    isHome === "後攻" ? ` ${teamName} はシートノックの準備に入って下さい。` : null;

  const mainMessage =
    isHome === "後攻"
      ? ` ${teamName} はシートノックに入って下さい。\nノック時間は7分以内です。`
      : ` ${teamName} はシートノックに入って下さい。\nノック時間は同じく7分以内です。`;

  const hasTimingHint = isHome === "先攻";
  const stepNum = (n: number) => n + (hasTimingHint ? 1 : 0);

  return (
    <div
      className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      {/* ヘッダー */}
      <header className="w-full max-w-md">
        <div className="flex items-center justify-between">

          <div className="w-10" />
        </div>

        {/* 中央大タイトル */}
        <div className="mt-3 text-center select-none">
          <h1 className="inline-flex items-center gap-2 text-3xl md:text-4xl font-extrabold tracking-wide leading-tight">
            <span className="text-2xl md:text-3xl">🏟️</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
              シートノック
            </span>
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs">
            <span>上から順に進行</span>
            <span className="opacity-70">／</span>
            <span>現在: {isHome === "後攻" ? "後攻チーム" : "先攻チーム"}</span>
          </div>
        </div>
      </header>



      {/* 本体：カード群（縦にステップ表示） */}
{/* 本体：カード群（縦にステップ表示） */}

<main className="w-full max-w-md mt-6 space-y-5">
  {/* ★ 先攻時だけ：一番最初に読み上げタイミングを表示 */}
  {hasTimingHint && (
    <StepCard step={1} icon={<IconAlert />} title="読み上げタイミング" accent="amber">
      <div className="text-amber-50/90 text-sm leading-relaxed">
        後攻チームのノック終了後に🎤
      </div>
    </StepCard>
  )}

  {/* 1 準備案内（後攻のときのみ） */}
  {prepMessage && (
    <StepCard step={stepNum(1)} icon={<IconGym />} title="準備の案内" accent="blue">
      <MessageBlock
        text={prepMessage}
        keyName="prep"
        readingKey={readingKey}
        onSpeak={speak}
        onStop={stopSpeak}
        label="（ノックの準備が出来ていない場合のみ）"
      />
    </StepCard>
  )}

  {/* 2 注意事項 */}
  <StepCard
    step={stepNum(prepMessage ? 2 : 1)}
    icon={<IconAlert />}
    title="スタートの取り方"
    accent="amber"
  >
    <div className="text-amber-50/90 text-sm leading-relaxed">
      最初のボールがノッカーの手から離れた時、<br />
      もしくはボール回しから始まる場合はキャッチャーの手から<br />
      ボールが離れてからスタート
    </div>
  </StepCard>

  {/* 3 本アナウンス */}
  <StepCard
    step={stepNum(prepMessage ? 3 : 2)}
    icon={<IconMic />}
    title="本アナウンス"
    accent="blue"
  >
    <MessageBlock
      text={mainMessage}
      keyName="main"
      readingKey={readingKey}
      onSpeak={speak}
      onStop={stopSpeak}
    />
  </StepCard>

  {/* 4 タイマー */}
  <StepCard
    step={stepNum(prepMessage ? 4 : 3)}
    icon={<IconTimer />}
    title="7分タイマー"
    accent="gray"
  >
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="text-4xl font-black tracking-widest tabular-nums">
        {timeLeft === 0 && !timerActive ? "7:00" : formatTime(timeLeft)}
      </div>
      <div className="flex items-center gap-2">
        {timeLeft === 0 && !timerActive ? (
          <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-semibold active:scale-95">
            <span onClick={startTimer}>開始</span>
          </button>
        ) : (
          <>
            {timerActive ? (
              <button
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-xl font-semibold active:scale-95"
                onClick={stopTimer}
              >
                STOP
              </button>
            ) : (
              <button
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-semibold active:scale-95"
                onClick={startTimer}
              >
                START
              </button>
            )}
            <button
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl font-semibold active:scale-95"
              onClick={resetTimer}
            >
              RESET
            </button>
          </>
        )}
      </div>
    </div>
  </StepCard>

  {/* 5 残り2分アナウンス */}
  <StepCard
    step={stepNum(prepMessage ? 5 : 4)}
    icon={<IconMic />}
    title="残り2分の案内"
    accent="blue"
  >
    <MessageBlock
      text={"ノック時間、残り2分です。"}
      keyName="2min"
      readingKey={readingKey}
      onSpeak={speak}
      onStop={stopSpeak}
    />
  </StepCard>

  {/* 6 終了アナウンス */}
  <StepCard
    step={stepNum(prepMessage ? 6 : 5)}
    icon={<IconMic />}
    title="終了案内"
    accent="blue"
  >
    <MessageBlock
      text={"ノックを終了してください。"}
      keyName="end"
      readingKey={readingKey}
      onSpeak={speak}
      onStop={stopSpeak}
    />
  </StepCard>

  {/* ▼ ⑥のカードの下：横幅いっぱいの「戻る」ボタン */}
  <div className="mt-2">
    <button
      onClick={onBack}
      className="w-full py-3 rounded-xl font-semibold
                bg-white/90 text-gray-900
                hover:bg-white active:scale-95
                shadow-lg border border-white/60"
    >
      ← 戻る
    </button>
  </div>
</main>

{/* ✅ モーダル（残り2分） */}
{showTwoMinModal && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-2xl shadow-2xl text-center w-auto max-w-[90vw] text-gray-900">
      <p className="text-lg font-semibold mb-4 whitespace-nowrap">残り2分です。</p>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 active:scale-95"
        onClick={() => setShowTwoMinModal(false)}
      >
        OK
      </button>
    </div>
  </div>
)}

{/* ✅ モーダル（タイマー終了） */}
{showEndModal && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-2xl shadow-2xl text-center w-auto max-w-[90vw] text-gray-900">
      <p className="text-lg font-semibold mb-4">タイマーが終了しました。</p>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 active:scale-95"
        onClick={() => setShowEndModal(false)}
      >
        OK
      </button>
    </div>
  </div>
)}

    </div>
  );
};

export default SheetKnock;
