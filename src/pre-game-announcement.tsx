import React, { useEffect, useState } from "react";
import localForage from "localforage";

export type ScreenType =
  | "menu"
  | "teamRegister"
  | "matchCreate"
  | "startingLineup"
  | "startGame"
  | "announcement"
  | "warmup"
  | "sheetKnock"
  | "announceStartingLineup"
  | "templateEdit"
  | "offense"
  | "defense"
  | "gather"
  | "startGreeting"
  | "seatIntroduction";

interface Props {
  onNavigate: (step: ScreenType) => void;
  onBack: () => void;
}

/* ---- ミニSVGアイコン（依存なし） ---- */
const IconWarmup = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M13 5a2 2 0 11-4 0 2 2 0 014 0zM4 20l2-5 3-2 2 2 3-1 2 2v4H4z" />
  </svg>
);
const IconKnock = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 2l7 4v5c0 5-3.5 9.5-7 10-3.5-.5-7-5-7-10V6l7-4zM8 11h8v2H8v-2z" />
  </svg>
);
const IconMegaphone = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M2 10v4l10-3V7L2 10zm12-3v10l6 2V5l-6 2z" />
  </svg>
);
const IconUsers = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0zM5 20a7 7 0 0114 0v2H5v-2z" />
  </svg>
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm-7-3h2a5 5 0 0010 0h2a7 7 0 01-6 6.9V20h3v2H8v-2h3v-2.1A7 7 0 015 11z"/>
  </svg>
);

/* ---- ステップ行（番号＋縦ライン＋カード） ---- */
const StepRow: React.FC<{
  index: number;
  title: string;
  note?: string;
  enabled: boolean;
  icon: React.ReactNode;
  isLast?: boolean;
  onClick?: () => void;
}> = ({ index, title, note, enabled, icon, isLast, onClick }) => {
  return (
    <div className="grid grid-cols-[28px,1fr] gap-3 items-start">
      {/* 左：番号バッジ＋縦ライン */}
      <div className="flex flex-col items-center">
        <div
          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center 
          ${enabled ? "bg-blue-600 text-white" : "bg-gray-400 text-gray-800"}`}
        >
          {index}
        </div>
        {!isLast && (
          <div
            className={`w-px flex-1 mt-1 ${enabled ? "bg-blue-500/60" : "bg-gray-400/40"}`}
            style={{ minHeight: 20 }}
          />
        )}
      </div>

      {/* 右：カード本体（有効なら押せる） */}
<button
  aria-disabled={!enabled}
  onClick={onClick}
  className={`w-full text-left rounded-2xl p-4 shadow-lg transition
    border ${enabled
      ? "bg-white/10 border-white/10 hover:bg-white/15 text-white active:scale-95"
      : "bg-gray-300 border-gray-300 text-gray-600 hover:bg-gray-300"}`}
>
  <div className="flex items-center gap-3">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center
      ${enabled ? "bg-white/10 border border-white/10" : "bg-white/60"}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <div className={`font-semibold ${enabled ? "" : "text-gray-700"}`}>{title}</div>
      {note && (
        <div className={`text-xs mt-0.5 ${enabled ? "text-white/80" : "text-gray-700/80"}`}>
          {note}
        </div>
      )}
    </div>
  </div>
</button>
    </div>
  );
};

const PreGameAnnouncement: React.FC<Props> = ({ onNavigate, onBack }) => {
  // 先攻/後攻を文字で統一
  const [attackLabel, setAttackLabel] = useState<"先攻" | "後攻">("先攻");

  useEffect(() => {
    const load = async () => {
      const matchInfo = await localForage.getItem("matchInfo");
      if (matchInfo && typeof matchInfo === "object") {
        const v: any = (matchInfo as any).isHome; // 以前の保存形式に合わせて正規化
        let label: "先攻" | "後攻" = "先攻";
        if (typeof v === "boolean") label = v ? "後攻" : "先攻"; // trueを「後攻」として扱っていたケースに対応
        else if (v === "先攻" || v === "後攻") label = v;
        else if (typeof (matchInfo as any).isFirst === "boolean")
          label = (matchInfo as any).isFirst ? "先攻" : "後攻";
        setAttackLabel(label);
      }
    };
    load();
  }, []);

  const isFirst = attackLabel === "先攻";

  const steps = [
    {
      key: "warmup" as const,
      title: "ウォーミングアップ",
      note: "後攻チーム 🎤",
      icon: <IconWarmup />,
      enabled: !isFirst,
    },
    {
      key: "sheetKnock" as const,
      title: "シートノック",
      note: "両チーム",
      icon: <IconKnock />,
      enabled: true,
    },
    {
      key: "announceStartingLineup" as const,
      title: "スタメン発表",
      note: "両チーム 🎤",
      icon: <IconMegaphone />,
      enabled: true,
    },
    {
      key: "gather" as const,
      title: "集合",
      note: "先攻チーム 🎤",
      icon: <IconUsers />,
      enabled: isFirst,
    },
    {
      key: "startGreeting" as const,
      title: "試合開始挨拶",
      note: "先攻チーム 🎤",
      icon: <IconMic />,
      enabled: isFirst,
    },
    {
      key: "seatIntroduction" as const,
      title: "シート紹介",
      note: "後攻チーム 🎤",
      icon: <IconMic />,
      enabled: !isFirst,
    },
  ];

  // 担当外でも遷移OK（確認付き）
const handleStepClick = (s: typeof steps[number]) => {
  if (!s.enabled) {
    const ok = window.confirm(`${s.title} は現在の担当外です。開きますか？`);
    if (!ok) return;
  }
  onNavigate(s.key);
};

  return (
    <div
      className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      {/* ヘッダー */}
      <header className="w-full max-w-md text-center select-none mt-1">
        <h1 className="inline-flex items-center gap-2 text-3xl md:text-4xl font-extrabold tracking-wide leading-tight">
          <span className="text-2xl md:text-3xl">🎤</span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-blue-400 drop-shadow">
            試合前アナウンス
          </span>
        </h1>
        <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs">
          <span>上から順番に実施</span>
          <span className="opacity-70">／</span>
          <span>現在の担当: {isFirst ? "先攻" : "後攻"}</span>
        </div>
      </header>

      {/* 縦ステッパー本体 */}
      <main className="w-full max-w-md mt-6 space-y-4">
        {steps.map((s, i) => (
          <StepRow
            key={s.key}
            index={i + 1}
            title={s.title}
            note={s.note}
            icon={s.icon}
            enabled={s.enabled}
            isLast={i === steps.length - 1}
             onClick={() => handleStepClick(s)}
          />
        ))}

        {/* 戻る */}
        <button
          className="w-full mt-4 bg-white/10 hover:bg-white/15 text-white px-4 py-3 rounded-2xl text-base border border-white/10"
          onClick={onBack}
        >
          ← 試合開始画面に戻る
        </button>
      </main>
    </div>
  );
};

export default PreGameAnnouncement;
