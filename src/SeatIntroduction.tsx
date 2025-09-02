// SeatIntroduction.tsx（全文置き換え）
import React, { useEffect, useState, useRef } from "react";
import localForage from "localforage";
import { ScreenType } from "./pre-game-announcement";

interface Props {
  onNavigate: (screen: ScreenType) => void;
  onBack?: () => void;
}

type PositionInfo = {
  lastName: string;
  lastNameKana: string;
  honorific: string;
};

/* ==== ミニSVGアイコン（依存なし） ==== */
const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);

const IconInfo: React.FC = () => (
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

const SeatIntroduction: React.FC<Props> = ({ onNavigate, onBack }) => {
  const [teamName, setTeamName] = useState("");
  const [positions, setPositions] = useState<{ [key: string]: PositionInfo }>({});
  const [isHome, setIsHome] = useState(true); // true → 後攻
  const [speaking, setSpeaking] = useState(false);

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const positionLabels: [string, string][] = [
    ["投", "ピッチャー"],
    ["捕", "キャッチャー"],
    ["一", "ファースト"],
    ["二", "セカンド"],
    ["三", "サード"],
    ["遊", "ショート"],
    ["左", "レフト"],
    ["中", "センター"],
    ["右", "ライト"],
  ];

  const inning = isHome ? "1回の表" : "1回の裏";

  useEffect(() => {
    const loadData = async () => {
      const team = await localForage.getItem<any>("team");
      const assignments = await localForage.getItem<{ [pos: string]: number }>("lineupAssignments");
      const matchInfo = await localForage.getItem<any>("matchInfo");

      if (team) setTeamName(team.name || "");
      if (matchInfo) setIsHome(matchInfo.isHome ?? true);

      if (assignments && team?.players) {
        const posMap: { [key: string]: PositionInfo } = {};
        Object.entries(assignments).forEach(([pos, playerId]) => {
          const player = team.players.find((p: any) => p.id === playerId);
          if (player) {
            posMap[pos] = {
              lastName: player.lastName,
              lastNameKana: player.lastNameKana,
              honorific: player.isFemale ? "さん" : "くん",
            };
          }
        });
        setPositions(posMap);
      }
    };
    loadData();
    return () => {
      try { speechSynthesis.cancel(); } catch {}
      utterRef.current = null;
      setSpeaking(false);
    };
  }, []);

  const speakText = () => {
    stopSpeaking();
    const text =
      [
        `${inning} 守ります、${teamName} のシートをお知らせします。`,
        ...positionLabels.map(([pos, label]) => {
          const player = positions[pos];
          return `${label} ${player?.lastNameKana || "（みょうじ）"} ${player?.honorific || "くん"}`;
        }),
      ].join("、") + "です。";

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.onstart = () => setSpeaking(true);
    const clear = () => { setSpeaking(false); utterRef.current = null; };
    utter.onend = clear; utter.onerror = clear;
    speechSynthesis.speak(utter);
    utterRef.current = utter;
  };

  const stopSpeaking = () => {
    try { speechSynthesis.cancel(); } catch {}
    utterRef.current = null;
    setSpeaking(false);
  };

  const formattedAnnouncement =
    `${inning}　守ります　${teamName} のシートをお知らせします。\n\n` +
    positionLabels
      .map(([pos, label]) => {
        const player = positions[pos];
        const nameHTML = player?.lastName
          ? `<ruby>${player.lastName}<rt>${player.lastNameKana || ""}</rt></ruby>`
          : "（苗字）";
        return `${label}　${nameHTML}　${player?.honorific || "くん"}`;
      })
      .join("<br />") + "です。";

  if (!teamName) {
    return (
      <div className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex items-center justify-center px-6">
        読み込み中…
      </div>
    );
  }

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
          <button
            onClick={() => (onBack ? onBack() : onNavigate("startGame"))}
            className="flex items-center gap-1 text-white/90 active:scale-95 px-3 py-2 rounded-lg bg-white/10 border border-white/10"
          >
            <IconBack />
            <span className="text-sm">戻る</span>
          </button>
          <div className="w-10" />
        </div>

        {/* 中央大タイトル */}
        <div className="mt-3 text-center select-none">
          <h1 className="inline-flex items-center gap-2 text-3xl md:text-4xl font-extrabold tracking-wide leading-tight">
            <span className="text-2xl md:text-3xl">🪑</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
              シート紹介
            </span>
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs">
            <span>{isHome ? "後攻チーム 🎤" : "先攻チーム 🎤"}</span>
          </div>
        </div>
      </header>

      {/* 本体 */}
      <main className="w-full max-w-md mt-6 space-y-5">
        {/* 注意カード（黄系） */}
        <section className="rounded-2xl p-4 shadow-lg text-left bg-gradient-to-br from-amber-400/20 via-amber-300/15 to-amber-200/10 border border-amber-300/60 ring-1 ring-inset ring-amber-300/30">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
              <IconInfo />
            </div>
            <h2 className="font-semibold">読み上げタイミング</h2>
          </div>
          <p className="text-amber-50/90 text-sm leading-relaxed">
            ピッチャーが練習球を1球投げてから
          </p>
        </section>

        {/* 🔴 アナウンス文言（赤 強め）＋ 枠内ボタン */}
        <section
          className="
            rounded-2xl p-4 shadow-lg text-left font-semibold
            border border-rose-600/90
            bg-gradient-to-br from-rose-600/45 via-rose-500/35 to-rose-400/25
            ring-1 ring-inset ring-rose-600/50
          "
        >
          <div className="flex items-start gap-2 mb-2">
            <img src="/icons/mic-red.png" alt="mic" className="w-6 h-6" />
            <div className="text-rose-50/90 text-[11px]">アナウンス文言（表示どおり読み上げ）</div>
          </div>

          <div
            className="text-white whitespace-pre-line leading-relaxed drop-shadow"
            dangerouslySetInnerHTML={{ __html: formattedAnnouncement }}
          />

          {/* 枠内の操作ボタン */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={speakText}
              disabled={speaking}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow active:scale-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <IconMic /> 読み上げ
            </button>
            <button
              onClick={stopSpeaking}
              disabled={!speaking}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-600 hover:bg-gray-700 text-white font-semibold shadow active:scale-95 inline-flex items-center justify-center"
            >
              停止
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SeatIntroduction;
