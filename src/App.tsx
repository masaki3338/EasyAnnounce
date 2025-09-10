import React, { useState, useEffect, useRef } from "react";
import localForage from "localforage";
import Gather from "./Gather";
import StartGreeting from "./StartGreeting";  // 追加
import SeatIntroduction from "./SeatIntroduction";

import { DndProvider } from 'react-dnd';
import { TouchBackend } from 'react-dnd-touch-backend';
import { HTML5Backend } from 'react-dnd-html5-backend';

import './pdfWorkerSetup';

import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';


import ManualViewer from "./ManualViewer"; // ← 追加
const manualPdfURL = "/manual.pdf#zoom=page-fit"; // ページ全体にフィット


// 各画面コンポーネントをインポート
import TeamRegister from "./TeamRegister";
import MatchCreate from "./MatchCreate";
import StartingLineup from "./StartingLineup";
import StartGame from "./StartGame";
import PreGameAnnouncement from "./pre-game-announcement";
import Warmup from "./Warmup";
//import SheetKnock from "./SheetKnock";
import SheetKnock from "./SheetKnock";
import AnnounceStartingLineup from "./AnnounceStartingLineup";
import OffenseScreen from "./OffenseScreen";
import DefenseScreen from "./DefenseScreen";
import DefenseChange from "./DefenseChange";
import OperationSettings from "./screens/OperationSettings";
import PitchLimit from "./screens/PitchLimit";
import TiebreakRule from "./screens/TiebreakRule";
import Contact from "./screens/Contact";
import TtsSettings from "./screens/TtsSettings";
import VersionInfo from "./screens/VersionInfo";


// バージョン番号を定数で管理
const APP_VERSION = "1.00"

// 画面の種類を列挙した型
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
  | "operationSettings"
  | "offense"
  | "defense"
  | "defenseChange"
  | "gather"
  | "startGreeting"
  | "seatIntroduction"
  |"operationSettings"
  | "pitchLimit"
  | "tiebreakRule"
  | "contact"
  | "tts-settings"
  | "versionInfo";

const screenMap: { [key: string]: ScreenType } = {
  "チーム・選手登録": "teamRegister",
  "試合作成": "matchCreate",
  "試合開始": "startGame",
  "運用設定": "operationSettings",
};

// === 追加: ミニマルSVGアイコン群（外部依存なし） ===
const IconHome = ({ active=false }) => (
  <svg viewBox="0 0 24 24" className={`w-6 h-6 ${active ? "opacity-100" : "opacity-70"}`} fill="currentColor">
    <path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z"/>
  </svg>
);
const IconGame = ({ active=false }) => (
  <svg viewBox="0 0 24 24" className={`w-6 h-6 ${active ? "opacity-100" : "opacity-70"}`} fill="currentColor">
    <path d="M7 6h10a3 3 0 013 3v6a3 3 0 01-3 3H7a3 3 0 01-3-3V9a3 3 0 013-3zm2 3a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z"/>
  </svg>
);
const IconDefense = ({ active=false }) => (
  <svg viewBox="0 0 24 24" className={`w-6 h-6 ${active ? "opacity-100" : "opacity-70"}`} fill="currentColor">
    <path d="M12 2l7 4v6c0 5-3.5 9.7-7 10-3.5-.3-7-5-7-10V6l7-4z"/>
  </svg>
);
const IconSettings = ({ active=false }) => (
  <svg viewBox="0 0 24 24" className={`w-6 h-6 ${active ? "opacity-100" : "opacity-70"}`} fill="currentColor">
    <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.4 4a7.5 7.5 0 00-.2-1.8l2-1.6-2-3.5-2.4 1a7.9 7.9 0 00-1.5-.9l-.4-2.6H9.2l-.4 2.6c-.5.2-1 .5-1.5.9l-2.4-1-2 3.5 2 1.6A7.5 7.5 0 003 12c0 .6.1 1.2.2 1.8l-2 1.6 2 3.5 2.4-1c.5.4 1 .7 1.5.9l.4 2.6h5.8l.4-2.6c.5-.2 1-.5 1.5-.9l2.4 1 2-3.5-2-1.6c.1-.6.2-1.2.2-1.8z"/>
  </svg>
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm-7-3h2a5 5 0 0010 0h2a7 7 0 01-6 6.9V20h3v2H8v-2h3v-2.1A7 7 0 015 11z"/>
  </svg>
);

// === 追加: タブボタン & ボトムタブバー ===
const TabButton: React.FC<{
  label: string;
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}> = ({ label, active, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center py-2 text-xs ${
      active ? "text-blue-600 font-semibold" : "text-gray-600"
    }`}
    aria-current={active ? "page" : undefined}
  >
    <div className="mb-1">{icon}</div>
    <span className="leading-none">{label}</span>
  </button>
);

const BottomTab: React.FC<{
  current: ScreenType;
  onNavigate: (s: ScreenType) => void;
}> = ({ current, onNavigate }) => {
  const is = (s: ScreenType) => current === s;
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur border-t border-gray-200"
      style={{ paddingBottom: "max( env(safe-area-inset-bottom), 4px )" }}
    >
      <div className="grid grid-cols-4 max-w-md mx-auto">
        <TabButton
          label="ホーム"
          active={is("menu")}
          onClick={() => onNavigate("menu")}
          icon={<IconHome active={is("menu")} />}
        />
        <TabButton
          label="試合"
          active={is("startGame")}
          onClick={() => onNavigate("startGame")}
          icon={<IconGame active={is("startGame")} />}
        />
        <TabButton
          label="守備"
          active={is("defense")}
          onClick={() => onNavigate("defense")}
          icon={<IconDefense active={is("defense")} />}
        />
        <TabButton
          label="設定"
          active={is("operationSettings")}
          onClick={() => onNavigate("operationSettings")}
          icon={<IconSettings active={is("operationSettings")} />}
        />
      </div>
    </nav>
  );
};


const Menu = ({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) => {
  const [canContinue, setCanContinue] = useState(false);
  const [lastScreen, setLastScreen] = useState<ScreenType | null>(null);
  const [showEndGamePopup, setShowEndGamePopup] = useState(false);
  const [endTime, setEndTime] = useState("");



  useEffect(() => {
    console.log("📺 screen =", screen);
    (async () => {
      const saved = await localForage.getItem("lastGameScreen");
      if (saved && typeof saved === "string") {
 // “開始系”は除外（初期化の副作用を避ける）
 const ok: ScreenType[] = ["offense", "defense", "defenseChange"];
 const preferred = ok.includes(saved as ScreenType) ? (saved as ScreenType) : "defense";
 setCanContinue(true);
 setLastScreen(preferred);
      }
    })();
  }, []);
  
  // Menu コンポーネント内の return を差し替え
return (
  <div
    className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
    style={{
      paddingTop: "max(16px, env(safe-area-inset-top))",
      paddingBottom: "max(16px, env(safe-area-inset-bottom))",
    }}
  >
    {/* ← ここを“中央寄せ”の本体ラッパで包む */}
    <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center">
      {/* ヘッダー */}
      <div className="w-full mb-8 md:mb-10">
        <h1 className="text-white text-3xl font-black tracking-widest text-center drop-shadow-lg leading-tight mb-2">
          ⚾️ Easyアナウンス 🎤
        </h1>
        <p className="text-white/80 text-center mt-2 mb-4 text-sm">～ Pony League Version ～</p>
      </div>

      {/* アイコンカードのグリッド */}
      <div className="w-full grid grid-cols-2 gap-4">
        <button
          onClick={() => onNavigate("teamRegister")}
          className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 p-4 text-left shadow-lg active:scale-95 transition"
        >
          <div className="text-2xl">🧑‍🤝‍🧑</div>
          <div className="mt-2 font-bold">チーム・選手登録</div>
          <div className="text-xs opacity-80 mt-1">ふりがな,背番号登録</div>
        </button>

        <button
          onClick={() => onNavigate("matchCreate")}
          className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 p-4 text-left shadow-lg active:scale-95 transition"
        >
          <div className="text-2xl">🗓️</div>
          <div className="mt-2 font-bold">試合作成</div>
          <div className="text-xs opacity-80 mt-1">対戦相手,先攻後攻等</div>
        </button>

        <button
          onClick={() => onNavigate("startGame")}
          className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 p-4 text-left shadow-lg active:scale-95 transition"
        >
          <div className="text-2xl">🏁</div>
          <div className="mt-2 font-bold">試合開始</div>
          <div className="text-xs opacity-80 mt-1">攻守遷移,読み上げ</div>
        </button>

        <button
          onClick={() => onNavigate("operationSettings")}
          className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 p-4 text-left shadow-lg active:scale-95 transition"
        >
          <div className="text-2xl">⚙️</div>
          <div className="mt-2 font-bold">運用設定</div>
          <div className="text-xs opacity-80 mt-1">投球数,タイブレーク等</div>
        </button>
      </div>

      {/* 試合継続ボタン（存在する時のみ表示） */}
      {canContinue && lastScreen && (
        <button
          onClick={() => onNavigate(lastScreen)}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl shadow-xl font-semibold transition active:scale-95"
        >
          ▶ 試合を継続する
        </button>
      )}
    </div>

    {/* バージョン（本体ラッパの外に出す） */}
    <div className="mt-8 text-white/60 text-sm select-none">
      Version: {APP_VERSION}
    </div>
  </div>
);

};


const NotImplemented = ({ onBack }: { onBack: () => void }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4">
    <p className="text-gray-700 text-xl mb-6">未実装の画面です</p>
    <button
      className="px-5 py-3 bg-gray-300 rounded-full shadow hover:bg-gray-400 transition"
      onClick={onBack}
    >
      ← メニューに戻る
    </button>
  </div>
);
 
const App = () => {
  const [screen, setScreen] = useState<ScreenType>("menu");
  const fromGameRef = useRef(false);
  const lastOffenseRef = useRef(false);
  const [showEndGamePopup, setShowEndGamePopup] = useState(false);
  const [endTime, setEndTime] = useState(""); 
  const [endGameAnnouncement, setEndGameAnnouncement] = useState("");
  const [showHeatPopup, setShowHeatPopup] = useState(false);
  const [heatMessage] = useState("本日は気温が高く、熱中症が心配されますので、水分をこまめにとり、体調に気を付けてください。");
  const [otherOption, setOtherOption] = useState(""); // その他選択状態
  const [showManualPopup, setShowManualPopup] = useState(false);
  const [showContinuationModal, setShowContinuationModal] = useState(false);
  const [showTiebreakPopup, setShowTiebreakPopup] = useState(false);
  const [tiebreakMessage, setTiebreakMessage] = useState<string>("");
    // ▼ 投球数ポップアップ用
  const [showPitchListPopup, setShowPitchListPopup] = useState(false);
  const [pitchList, setPitchList] = useState<
    { name: string; number?: string; total: number }[]
  >([]);
// --- 試合終了アナウンスを分割して注意ボックスを差し込む ---
const BREAKPOINT_LINE = "球審、EasyScore担当、公式記録員、球場役員もお集まりください。";
const ann = endGameAnnouncement ?? "";
const bpIndex = ann.indexOf(BREAKPOINT_LINE);
const beforeText = bpIndex >= 0 ? ann.slice(0, bpIndex + BREAKPOINT_LINE.length) : ann;
const afterText  = bpIndex >= 0 ? ann.slice(bpIndex + BREAKPOINT_LINE.length) : "";


  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      const msg = new SpeechSynthesisUtterance("この試合は、ただ今で打ち切り、継続試合となります。明日以降に中断した時点から再開いたします。あしからずご了承くださいませ。");
      window.speechSynthesis.speak(msg);
    }
  };
  const handleStop = () => {
    window.speechSynthesis.cancel();
  };

  useEffect(() => {
    const initializeDatabase = async () => {
      const exists = await localForage.getItem("initialized");
      if (!exists) {
        await localForage.setItem("team", {
          name: "東京武蔵ポニー",
          furigana: "とうきょうむさしぽにー",
          players: [
            {
              id: 1,
              lastName: "田中",
              firstName: "太郎",
              lastNameKana: "たなか",
              firstNameKana: "たろう",
              number: "1",
              isFemale: false,
            },
            {
              id: 2,
              lastName: "鈴木",
              firstName: "次郎",
              lastNameKana: "すずき",
              firstNameKana: "じろう",
              number: "2",
              isFemale: false,
            },
          ],
        });
        await localForage.setItem("initialized", true);
        console.log("✅ 初期チームデータを登録しました。");
      }
    };
    initializeDatabase();
  }, []);

  return (
    <>
      {screen === "menu" && <Menu onNavigate={setScreen} />}

      {screen === "teamRegister" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("menu")}
          >
            ← メニューに戻る
          </button>
          <TeamRegister />
        </>
      )}

      {screen === "matchCreate" && (
        <MatchCreate
          onBack={() => setScreen("menu")}
          onGoToLineup={() => setScreen("startingLineup")}
        />
      )}

      {screen === "startingLineup" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("matchCreate")}
          >
            ← 試合情報に戻る
          </button>
          <StartingLineup />
        </>
      )}

      {screen === "startGame" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("menu")}
          >
            ← メニューに戻る
          </button>
            <StartGame
                onStart={async () => {
                  const match = await localForage.getItem("matchInfo");
                  if (match && typeof match === "object" && "isHome" in match) {
                    const { isHome } = match as { isHome: boolean };

                    const isTop = true; // 試合開始は必ず「1回表」
                    // 自チームが先攻なら攻撃からスタート、後攻なら守備から
                    const isOffense = isHome === false;

                    setScreen(isOffense ? "offense" : "defense");
                  } else {
                    alert("試合情報が見つかりません。試合作成画面で設定してください。");
                  }
                }}
                onShowAnnouncement={() => setScreen("announcement")}
              />
        </>
      )}
      {screen === "announcement" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("startGame")}
          >
            ← 試合開始画面に戻る
          </button>
          <PreGameAnnouncement
            onNavigate={async (next) => {
              // ★ 試合前アナウンス→シート紹介のときは“試合中からではない”扱いにする
              if (next === "seatIntroduction") {
                fromGameRef.current = false;
                lastOffenseRef.current = false;
              }
              setScreen(next);
            }}
            onBack={() => setScreen("startGame")}
          />
        </>
      )}

      {screen === "warmup" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("announcement")}
          >
            ← 試合前アナウンスメニューに戻る
          </button>
          {screen === "warmup" && (
          <Warmup onBack={() => setScreen("announcement")} />
        )}
        </>
      )}

      {screen === "sheetKnock" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("announcement")}
          >
            ← 試合前アナウンスメニューに戻る
          </button>
          <SheetKnock onBack={() => setScreen("announcement")} />
        </>
      )}

      {screen === "announceStartingLineup" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("announcement")}
          >
            ← 試合前アナウンスメニューに戻る
          </button>
          <AnnounceStartingLineup onNavigate={setScreen} />
        </>
      )}

      {screen === "gather" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("announcement")} // 適宜戻る先の画面を調整してください
          >
            ← 試合前アナウンスメニューに戻る
          </button>
         <Gather onNavigate={setScreen} />  
        </>
      )}

      {screen === "startGreeting" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("announcement")} // 適宜戻る先の画面を調整してください
          >
            ← 試合前アナウンスメニューに戻る
          </button>
          <StartGreeting onBack={() => setScreen("announcement")} />
        </>
      )}

      {screen === "seatIntroduction" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen(fromGameRef.current ? "defense" : "announcement")}
          >
            ← {fromGameRef.current ? "試合に戻る" : "試合前アナウンスメニューに戻る"}
          </button>
          <SeatIntroduction
            onNavigate={setScreen}
            onBack={() =>
              setScreen(fromGameRef.current ? (lastOffenseRef.current ? "offense" : "defense") : "announcement")
            }
            fromGame={fromGameRef.current} // ✅ 追加
          />
        </>
      )}


      {screen === "offense" && (
        <>
          <div className="m-4 flex justify-between items-center">
      {/* 左端のメニューボタン */}
      <button
        className="px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
        onClick={() => setScreen("menu")}
      >
        ← メニューに戻る
      </button>

      {/* 右端のドロップダウン */}
      <select
        className="px-4 py-2 rounded-full bg-gray-100 text-gray-800 shadow-sm border border-gray-300"
        value={otherOption} // ← 追加
        onChange={async (e) => {
          const value = e.target.value;
          if (value === "end") {
            console.group("[END] その他→試合終了");
            const now = new Date();
            const formatted = `${now.getHours()}時${now.getMinutes()}分`;
            setEndTime(formatted);

            const team = (await localForage.getItem("team")) as { name?: string } | null;
            // RAW で取得（別所で上書きされている可能性があるため）
            const match = (await localForage.getItem("matchInfo")) as any;
            const noNextGame = Boolean(match?.noNextGame); 
            console.log("matchInfo (RAW) =", match);
            const stash = await localForage.getItem("matchNumberStash");
    if (match && (match.matchNumber == null) && Number(stash) >= 1) {
      await localForage.setItem("matchInfo", { ...match, matchNumber: Number(stash) });
      console.log("🩹 repaired matchInfo at mount with matchNumber =", stash);
    }

            type Scores = { [inning: string]: { top?: number; bottom?: number } };
            const scores = ((await localForage.getItem("scores")) as Scores) || {};
            console.log("scores (RAW) =", scores);

            const isHome: boolean = !!(match?.isHome ?? true);
            console.log("isHome =", isHome);

            const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

            const totalMyScore = Object.values(scores).reduce((sum, s) => {
              const val = isHome ? (s?.bottom ?? 0) : (s?.top ?? 0);
              return sum + toNum(val);
            }, 0);

            const totalOpponentScore = Object.values(scores).reduce((sum, s) => {
              const val = isHome ? (s?.top ?? 0) : (s?.bottom ?? 0);
              return sum + toNum(val);
            }, 0);

            console.log("totals -> my:", totalMyScore, "opp:", totalOpponentScore);

            const myTeam = team?.name ?? "自チーム";

            // --- ここがポイント：試合番号の“自己修復”＋フォールバック ---
            let rawMatchNumber = match?.matchNumber;

            // A) matchInfo に無ければ、スタッシュから復元（後述の保存変更と対）
            if (rawMatchNumber == null) {
              const stash = await localForage.getItem("matchNumberStash");
              if (Number(stash) >= 1) {
                rawMatchNumber = Number(stash);
                // ついでに matchInfo を自己修復（後続画面でも正しく使えるように）
                const repaired = { ...(match || {}), matchNumber: rawMatchNumber };
                await localForage.setItem("matchInfo", repaired);
                console.log("💾 repaired matchInfo with matchNumber =", rawMatchNumber);
              } else {
                console.warn("⚠️ matchNumber not found (neither matchInfo nor stash)");
              }
            }

            const parsed = Number(rawMatchNumber);
            const currentGame = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
            const nextGame = currentGame + 1;
            console.log({ rawMatchNumber, currentGame, nextGame });

if (totalMyScore > totalOpponentScore) {
  let announcement =
    `ただいまの試合は、ご覧のように${totalMyScore}対${totalOpponentScore}で${myTeam}が勝ちました。\n` +
    `審判員の皆様、ありがとうございました。\n` +
    `健闘しました両チームの選手に、盛大な拍手をお願いいたします。\n` +
    `尚、この試合の終了時刻は ${formatted} です。\n` +
    `これより、ピッチングレコードの確認を行います。\n` +
    `両チームの監督、キャプテンはピッチングレコードを記載の上、バックネット前にお集まりください。\n` +
    `球審、EasyScore担当、公式記録員、球場役員もお集まりください。\n`;

  // ✅ 「次の試合なし」チェックが外れている場合のみ、グランド整備文を追加
  if (!noNextGame) {
    announcement +=
      `第${nextGame}試合のグランド整備は、第${nextGame}試合のシートノック終了後に行います。\n` +
      `第${currentGame}試合の選手は、グランド整備ご協力をよろしくお願いいたします。`;
  }

  setEndGameAnnouncement(announcement);
  setShowEndGamePopup(true);
} else {
  alert("試合終了しました");
}

            console.groupEnd();
            } else if (value === "tiebreak") {
              const cfg = (await localForage.getItem("tiebreakConfig")) as
                | { outs?: string; bases?: string }
                | null;
              const outs = cfg?.outs ?? "ワンナウト";
              const bases = cfg?.bases ?? "2,3塁";

              // 現在のイニング取得（matchInfo優先、なければscoresの最大回）
              type Scores = { [inning: string]: { top?: number; bottom?: number } };
              const match = (await localForage.getItem("matchInfo")) as any;
              const scores = ((await localForage.getItem("scores")) as Scores) || {};

              let inning = Number(match?.inning);
              if (!Number.isFinite(inning) || inning < 1) {
                const keys = Object.keys(scores)
                  .map((k) => Number(k))
                  .filter((n) => Number.isFinite(n) && n >= 1);
                inning = keys.length > 0 ? Math.max(...keys) : 1;
              }

              // ★ 直前の回（最低でも1回に丸め）
              const prevInning = Math.max(1, inning - 1);

              const msg =
                `この試合は、${prevInning}回終了して同点のため、大会規定により${outs}${bases}からのタイブレークに入ります。`;

              setTiebreakMessage(msg);
              setShowTiebreakPopup(true);


            } else if (value === "continue") {
              setShowContinuationModal(true);

          } else if (value === "heat") {
            setShowHeatPopup(true);
          } else if (value === "manual") {
            //window.location.href = "/manual.pdf"; // ← PDFを別タブで開く
            setShowManualPopup(true);
          } else if (value === "pitchlist") {
            // チームと投手別累計を読み込んで一覧を構築
            const team = (await localForage.getItem("team")) as
              | { players?: any[] }
              | null;
            const totals =
              ((await localForage.getItem("pitcherTotals")) as Record<number, number>) ||
              {};
            const players = Array.isArray(team?.players) ? team!.players : [];

            // 登板順（最初に投げた順）を読み込む
            const order =
              ((await localForage.getItem<number[]>("pitcherOrder")) || []).slice();

            // まず totals から行データを作って map に置く（>0 の人だけ）
            const rowsMap = new Map<number, { name: string; number?: string; total: number }>();
            for (const [idStr, total] of Object.entries(totals)) {
              const tot = Number(total) || 0;
              if (tot <= 0) continue;
              const id = Number(idStr);
              const p = players.find((x) => x?.id === id);
              const name = (p?.lastName ?? "") + (p?.firstName ?? "") || `ID:${id}`;
              const number = p?.number ? `#${p.number}` : undefined;
              rowsMap.set(id, { name, number, total: tot });
            }

            // 1) 登板順に並べて詰める
            const rows: { name: string; number?: string; total: number }[] = [];
            for (const id of order) {
              const r = rowsMap.get(id);
              if (r) {
                rows.push(r);
                rowsMap.delete(id); // 取り出したものは削除
              }
            }

            // 2) まだ順番情報が無い投手（過去データ等）は最後に付け足す
            for (const r of rowsMap.values()) {
              rows.push(r);
            }

            setPitchList(rows);
            setShowPitchListPopup(true);

          }

        }}
        defaultValue=""
      >
        <option value="" disabled hidden>
          その他
        </option>
        <option value="end">試合終了</option>
        <option value="tiebreak">タイブレーク</option>
        <option value="continue">継続試合</option>
        <option value="heat">熱中症</option> 
        <option value="manual">連盟🎤マニュアル</option> 
        <option value="pitchlist">投球数⚾</option>
      </select>
    </div>
          <OffenseScreen
            onSwitchToDefense={() => setScreen("defense")}
            onGoToSeatIntroduction={() => {
              fromGameRef.current = true;       // ✅ 試合中からの遷移であることを記録
              lastOffenseRef.current = true;    // ✅ 攻撃画面から来たことを記録
              setScreen("seatIntroduction");
            }}
          />
        </>
      )}

      {screen === "defense" && (        
        <>
          <div className="m-4 flex justify-between items-center">
      {/* 左端のメニューボタン */}
      <button
        className="px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
        onClick={() => setScreen("menu")}
      >
        ← メニューに戻る
      </button>

      {/* 右端のドロップダウン */}
      
      <select      
        className="px-4 py-2 rounded-full bg-gray-100 text-gray-800 shadow-sm border border-gray-300"
        value={otherOption} // ← 追加
        onChange={async (e) => {
          const value = e.target.value;
          if (value === "end") {
            console.group("[END] その他→試合終了");
            const now = new Date();
            const formatted = `${now.getHours()}時${now.getMinutes()}分`;
            setEndTime(formatted);

            const team = (await localForage.getItem("team")) as { name?: string } | null;
            // RAW で取得（別所で上書きされている可能性があるため）
            const match = (await localForage.getItem("matchInfo")) as any;
            const noNextGame = Boolean(match?.noNextGame); 
            const stash = await localForage.getItem("matchNumberStash");
              if (match && (match.matchNumber == null) && Number(stash) >= 1) {
                await localForage.setItem("matchInfo", { ...match, matchNumber: Number(stash) });
                console.log("🩹 repaired matchInfo at mount with matchNumber =", stash);
              }
            console.log("matchInfo (RAW) =", match);

            type Scores = { [inning: string]: { top?: number; bottom?: number } };
            const scores = ((await localForage.getItem("scores")) as Scores) || {};
            console.log("scores (RAW) =", scores);

            const isHome: boolean = !!(match?.isHome ?? true);
            console.log("isHome =", isHome);

            const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

            const totalMyScore = Object.values(scores).reduce((sum, s) => {
              const val = isHome ? (s?.bottom ?? 0) : (s?.top ?? 0);
              return sum + toNum(val);
            }, 0);

            const totalOpponentScore = Object.values(scores).reduce((sum, s) => {
              const val = isHome ? (s?.top ?? 0) : (s?.bottom ?? 0);
              return sum + toNum(val);
            }, 0);

            console.log("totals -> my:", totalMyScore, "opp:", totalOpponentScore);

            const myTeam = team?.name ?? "自チーム";

            // --- ここがポイント：試合番号の“自己修復”＋フォールバック ---
            let rawMatchNumber = match?.matchNumber;

            // A) matchInfo に無ければ、スタッシュから復元（後述の保存変更と対）
            if (rawMatchNumber == null) {
              const stash = await localForage.getItem("matchNumberStash");
              if (Number(stash) >= 1) {
                rawMatchNumber = Number(stash);
                // ついでに matchInfo を自己修復（後続画面でも正しく使えるように）
                const repaired = { ...(match || {}), matchNumber: rawMatchNumber };
                await localForage.setItem("matchInfo", repaired);
                console.log("💾 repaired matchInfo with matchNumber =", rawMatchNumber);
              } else {
                console.warn("⚠️ matchNumber not found (neither matchInfo nor stash)");
              }
            }

            const parsed = Number(rawMatchNumber);
            const currentGame = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
            const nextGame = currentGame + 1;
            console.log({ rawMatchNumber, currentGame, nextGame });

if (totalMyScore > totalOpponentScore) {
  let announcement =
    `ただいまの試合は、ご覧のように${totalMyScore}対${totalOpponentScore}で${myTeam}が勝ちました。\n` +
    `審判員の皆様、ありがとうございました。\n` +
    `健闘しました両チームの選手に、盛大な拍手をお願いいたします。\n` +
    `尚、この試合の終了時刻は ${formatted} です。\n` +
    `これより、ピッチングレコードの確認を行います。\n` +
    `両チームの監督、キャプテンはピッチングレコードを記載の上、バックネット前にお集まりください。\n` +
    `球審、EasyScore担当、公式記録員、球場役員もお集まりください。\n`;

  // ✅ 「次の試合なし」チェックが外れている場合のみ、グランド整備文を追加
  if (!noNextGame) {
    announcement +=
      `第${nextGame}試合のグランド整備は、第${nextGame}試合のシートノック終了後に行います。\n` +
      `第${currentGame}試合の選手は、グランド整備ご協力をよろしくお願いいたします。`;
  }

  setEndGameAnnouncement(announcement);
  setShowEndGamePopup(true);
} else {
  alert("試合終了しました");
}
            console.groupEnd();
          } else if (value === "continue") {
            setShowContinuationModal(true);
          } else if (value === "heat") {
            setShowHeatPopup(true);
          } else if (value === "manual") {
            //window.location.href = "/manual.pdf"; // ← PDFを別タブで開く
            setShowManualPopup(true);
          } else if (value === "pitchlist") {
            // チームと投手別累計を読み込んで一覧を構築
            const team = (await localForage.getItem("team")) as
              | { players?: any[] }
              | null;
            const totals =
              ((await localForage.getItem("pitcherTotals")) as Record<number, number>) ||
              {};
            const players = Array.isArray(team?.players) ? team!.players : [];

            // 登板順（最初に投げた順）を読み込む
            const order =
              ((await localForage.getItem<number[]>("pitcherOrder")) || []).slice();

            // まず totals から行データを作って map に置く（>0 の人だけ）
            const rowsMap = new Map<number, { name: string; number?: string; total: number }>();
            for (const [idStr, total] of Object.entries(totals)) {
              const tot = Number(total) || 0;
              if (tot <= 0) continue;
              const id = Number(idStr);
              const p = players.find((x) => x?.id === id);
              const name = (p?.lastName ?? "") + (p?.firstName ?? "") || `ID:${id}`;
              const number = p?.number ? `#${p.number}` : undefined;
              rowsMap.set(id, { name, number, total: tot });
}

            // 1) 登板順に並べて詰める
            const rows: { name: string; number?: string; total: number }[] = [];
            for (const id of order) {
              const r = rowsMap.get(id);
              if (r) {
                rows.push(r);
                rowsMap.delete(id); // 取り出したものは削除
              }
            }

            // 2) まだ順番情報が無い投手（過去データ等）は最後に付け足す
            for (const r of rowsMap.values()) {
              rows.push(r);
            }

            setPitchList(rows);
            setShowPitchListPopup(true);

          }

        }}
        defaultValue=""
      >
        <option value="" disabled hidden>
          その他
        </option>
        <option value="end">試合終了</option>
        <option value="continue">継続試合</option>
        <option value="heat">熱中症</option> 
        <option value="manual">連盟🎤マニュアル</option> 
        <option value="pitchlist">投球数⚾</option>
      </select>
    </div>
           <DefenseScreen key="defense" 
            onChangeDefense={() => setScreen("defenseChange")}
            onSwitchToOffense={() => setScreen("offense")}
          />
        </>
      )}

{screen === "defenseChange" && (
  <>
    <button
      className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
      onClick={() => setScreen("defense")}>
        ← 守備画面に戻る
     </button>
    <DefenseChange onConfirmed={() => {
      console.log("✅ setScreen to defense");
      setScreen("defense");
    }} />
  </>
)}
{screen === "operationSettings" && (
  <OperationSettings
    onNavigate={setScreen}
    onOpenManual={() => setShowManualPopup(true)} // ← 追加：ManualViewerを開く
  />
)}


{screen === "pitchLimit" && (
  <PitchLimit onBack={() => setScreen("operationSettings")} />
)}

{screen === "tiebreakRule" && (
  <TiebreakRule onBack={() => setScreen("operationSettings")} />
)}

{screen === "tts-settings" && (
  <TtsSettings onBack={() => setScreen("operationSettings")} />
)}

{screen === "contact" && (
  <Contact onBack={() => setScreen("operationSettings")} version={APP_VERSION} />
)}

{screen === "versionInfo" && (
  <VersionInfo version={APP_VERSION} onBack={() => setScreen("operationSettings")} />
)}

{/* 試合終了画面（スマホ風） */}
{showEndGamePopup && (
  <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="試合終了">
    {/* 背景オーバーレイ */}
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

    {/* 中央カード */}
    <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
      <div
        className="bg-white shadow-2xl rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-rose-600 to-pink-600 text-white">
          <div className="h-5 flex items-center justify-center">
            <span className="mt-2 block h-1.5 w-12 rounded-full bg-white/60" />
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-wide flex items-center gap-2">
              <img src="/mic-red.png" alt="" className="w-6 h-6" aria-hidden="true" />
              <span>試合終了</span>
            </h2>
            <div className="w-9 h-9" />
          </div>
        </div>

        {/* 本文（スクロール領域） */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto">
          {/* 注意表示 */}
          <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 text-sm font-semibold flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            勝利チーム🎤
          </div>

          {/* 🔴 アナウンス文言エリア（ここに読み上げ／停止ボタンを内包） */}
          <div className="rounded-2xl border border-red-500 bg-red-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <img src="/mic-red.png" alt="" className="w-6 h-6" aria-hidden="true" />
              <span className="text-sm font-semibold text-red-700">アナウンス</span>
            </div>

            {/* 文言（改行保持） */}
            <div className="text-left text-red-700 font-bold whitespace-pre-wrap leading-relaxed max-h-[40vh] overflow-y-auto pr-2">
              {endGameAnnouncement}
            </div>

            {/* 読み上げ／停止（横いっぱい・等幅、アイコン右に文言で改行なし） */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const uttr = new SpeechSynthesisUtterance(endGameAnnouncement);
                  speechSynthesis.cancel(); // 直前を停止してから開始
                  speechSynthesis.speak(uttr);
                }}
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white
                           inline-flex items-center justify-center gap-2"
              >
                <IconMic className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>読み上げ</span>
              </button>
              <button
                onClick={() => speechSynthesis.cancel()}
                className="w-full h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white
                           inline-flex items-center justify-center"
              >
                <span className="whitespace-nowrap leading-none">停止</span>
              </button>
            </div>
          </div>
        </div>

        {/* フッター（OK） */}
        <div className="sticky bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t px-4 py-3">
          <button
            onClick={() => setShowEndGamePopup(false)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl shadow-md font-semibold"
          >
            OK
          </button>
          <div className="h-[max(env(safe-area-inset-bottom),8px)]" />
        </div>
      </div>
    </div>
  </div>
)}

 {/* 熱中症画面*/}
{showHeatPopup && (
  <div className="fixed inset-0 z-50">
    {/* 背景オーバーレイ（タップで閉じる） */}
    <div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onClick={() => setShowHeatPopup(false)}
    />

    {/* 画面中央カード（スマホ風） */}
    <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
      <div
        className="
          bg-white shadow-2xl rounded-2xl
          w-full max-w-md max-h-[80vh]
          overflow-hidden flex flex-col
        "
        role="dialog"
        aria-modal="true"
        aria-label="熱中症"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* ヘッダー（グラデ＋ハンドル） */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-rose-600 to-pink-600 text-white">
          <div className="h-5 flex items-center justify-center">
            <span className="mt-2 block h-1.5 w-12 rounded-full bg-white/60" />
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-wide flex items-center gap-2">
              <span className="text-xl">🥵</span>
              <span>熱中症</span>
            </h2>
            <button
              onClick={() => setShowHeatPopup(false)}
              aria-label="閉じる"
              className="rounded-full w-9 h-9 flex items-center justify-center
                         bg-white/15 hover:bg-white/25 active:bg-white/30
                         text-white text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              ×
            </button>
          </div>
        </div>

        {/* 本文（スクロール領域） */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto">
          {/* 🔴 アナウンス文言エリア（ここに読み上げ/停止ボタンを内包） */}
          <div className="rounded-2xl border border-red-500 bg-red-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <img src="/mic-red.png" alt="mic" className="w-6 h-6" />
              <span className="text-sm font-semibold text-red-700">アナウンス</span>
            </div>

            {/* 文言 */}
            <p className="text-red-700 font-bold whitespace-pre-wrap">
              {heatMessage}
            </p>

            {/* 読み上げ／停止（横いっぱい・等幅、改行なし） */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const uttr = new SpeechSynthesisUtterance(heatMessage);
                  speechSynthesis.cancel(); // 直前を停止してから開始
                  speechSynthesis.speak(uttr);
                }}
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white
                           inline-flex items-center justify-center gap-2"
              >
                
                <span className="inline-flex items-center gap-2 whitespace-nowrap leading-none align-middle">
                <IconMic className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>読み上げ</span>
              </span>
              </button>
              <button
                onClick={() => speechSynthesis.cancel()}
                className="w-full h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white
                           inline-flex items-center justify-center"
              >
                <span className="whitespace-nowrap leading-none">停止</span>
              </button>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="sticky bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t px-4 py-3">
          <button
            onClick={() => setShowHeatPopup(false)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl shadow-md font-semibold"
          >
            OK
          </button>
          <div className="h-[max(env(safe-area-inset-bottom),8px)]" />
        </div>
      </div>
    </div>
  </div>
)}


{/* タイブレーク画面 */}
{showTiebreakPopup && (
  <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="タイブレーク開始">
    {/* 背景オーバーレイ */}
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

    {/* 中央カード */}
    <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
      <div
        className="bg-white shadow-2xl rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-rose-600 to-pink-600 text-white">
          <div className="h-5 flex items-center justify-center">
            <span className="mt-2 block h-1.5 w-12 rounded-full bg-white/60" />
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-wide flex items-center gap-2">
              <img src="/mic-red.png" alt="" className="w-6 h-6" aria-hidden="true" />
              <span>タイブレーク開始</span>
            </h2>
            <div className="w-9 h-9" />
          </div>
        </div>

        {/* 本文（スクロール領域） */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto">
          {/* 🔴 アナウンス文言エリア（ここに読み上げ/停止ボタンを内包） */}
          <div className="rounded-2xl border border-red-500 bg-red-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <img src="/mic-red.png" alt="" className="w-6 h-6" aria-hidden="true" />
              <span className="text-sm font-semibold text-red-700">アナウンス</span>
            </div>

            {/* 文言（改行保持） */}
            <p className="text-red-700 font-bold whitespace-pre-wrap leading-relaxed">
              {tiebreakMessage}
            </p>

            {/* 読み上げ／停止（横いっぱい・等幅、改行なしテキスト） */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const uttr = new SpeechSynthesisUtterance(tiebreakMessage);
                  speechSynthesis.cancel(); // 直前を停止してから開始
                  speechSynthesis.speak(uttr);
                }}
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white
                           inline-flex items-center justify-center gap-2"
              >
                {/* アイコン右に文言／改行しない */}
                <IconMic className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap leading-none">読み上げ</span>
              </button>

              <button
                onClick={() => speechSynthesis.cancel()}
                className="w-full h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white
                           inline-flex items-center justify-center"
              >
                <span className="whitespace-nowrap leading-none">停止</span>
              </button>
            </div>
          </div>
        </div>

        {/* フッター（OK） */}
        <div className="sticky bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t px-4 py-3">
          <button
            onClick={() => setShowTiebreakPopup(false)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl shadow-md font-semibold"
          >
            OK
          </button>
          <div className="h-[max(env(safe-area-inset-bottom),8px)]" />
        </div>
      </div>
    </div>
  </div>
)}


{/* 継続試合画面 */}
{showContinuationModal && (
  <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="継続試合">
    {/* 背景オーバーレイ */}
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

    {/* 中央カード */}
    <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
      <div
        className="bg-white shadow-2xl rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-rose-600 to-pink-600 text-white">
          <div className="h-5 flex items-center justify-center">
            <span className="mt-2 block h-1.5 w-12 rounded-full bg-white/60" />
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-wide flex items-center gap-2">
              <img src="/mic-red.png" alt="" className="w-6 h-6" aria-hidden="true" />
              <span>継続試合</span>
            </h2>
            <div className="w-9 h-9" />
          </div>
        </div>

        {/* 本文（スクロール領域） */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto">
          {/* 🔴 アナウンス文言エリア（読み上げ/停止ボタンを内包） */}
          <div className="rounded-2xl border border-red-500 bg-red-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <img src="/mic-red.png" alt="" className="w-6 h-6" aria-hidden="true" />
              <span className="text-sm font-semibold text-red-700">アナウンス</span>
            </div>

            {/* 文言 */}
            <p className="text-red-700 font-bold whitespace-pre-wrap leading-relaxed">
              この試合は、ただ今で打ち切り、継続試合となります。{'\n'}
              明日以降に中断した時点から再開いたします。{'\n'}
              あしからずご了承くださいませ。
            </p>

            {/* 読み上げ／停止（横いっぱい・等幅、改行なしテキスト） */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const txt =
                    "この試合は、ただ今で打ち切り、継続試合となります。\n" +
                    "明日以降に中断した時点から再開いたします。\n" +
                    "あしからずご了承くださいませ。";
                  const uttr = new SpeechSynthesisUtterance(txt);
                  speechSynthesis.cancel();
                  speechSynthesis.speak(uttr);
                }}
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white
                           inline-flex items-center justify-center gap-2"
              >
                <span className="inline-flex items-center gap-2 whitespace-nowrap leading-none align-middle">
                  <IconMic className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span>読み上げ</span>
                </span>
              </button>

              <button
                onClick={() => speechSynthesis.cancel()}
                className="w-full h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white
                           inline-flex items-center justify-center"
              >
                <span className="whitespace-nowrap leading-none">停止</span>
              </button>
            </div>
          </div>
        </div>

        {/* フッター（OK） */}
        <div className="sticky bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t px-4 py-3">
          <button
            onClick={() => setShowContinuationModal(false)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl shadow-md font-semibold"
          >
            OK
          </button>
          <div className="h-[max(env(safe-area-inset-bottom),8px)]" />
        </div>
      </div>
    </div>
  </div>
)}



{showManualPopup && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-white w-full max-w-4xl h-[90vh] rounded-xl shadow-lg overflow-hidden flex flex-col">
      <div className="bg-gray-800 text-white px-4 py-2 text-center font-bold">
        連盟🎤マニュアル
      </div>
      <div className="flex-1 overflow-hidden">
        <ManualViewer />
      </div>
      <button
        className="bg-green-600 text-white py-2 text-lg"
        onClick={() => setShowManualPopup(false)}
      >
        OK
      </button>
    </div>
  </div>
)}

{/* ✅ 投球数ポップアップ（中央表示・スマホっぽいUI・機能変更なし） */}
{showPitchListPopup && (
  <div className="fixed inset-0 z-50">
    {/* 背景オーバーレイ（タップで閉じる） */}
    <div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onClick={() => setShowPitchListPopup(false)}
    />

    {/* 画面中央にカード配置（SP/PC共通） */}
    <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
      <div
        className="
          bg-white shadow-2xl
          rounded-2xl
          w-full max-w-md
          max-h-[80vh]
          overflow-hidden
          flex flex-col
        "
        role="dialog"
        aria-modal="true"
        aria-label="投球数"
      >
        {/* ヘッダー（グラデ＋白文字＋ハンドル） */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="h-5 flex items-center justify-center">
            <span className="mt-2 block h-1.5 w-12 rounded-full bg-white/60" />
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-wide flex items-center gap-2">
              <span className="text-xl">⚾</span>
              <span>投球数</span>
            </h2>
            <button
              onClick={() => setShowPitchListPopup(false)}
              aria-label="閉じる"
              className="rounded-full w-9 h-9 flex items-center justify-center
                         bg-white/15 hover:bg-white/25 active:bg-white/30
                         text-white text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              ×
            </button>
          </div>
        </div>

        {/* 本文（スクロール領域） */}
        <div className="px-4 py-3 overflow-y-auto">
          {pitchList.length === 0 ? (
            <div className="text-center text-slate-500 py-8">記録がありません</div>
          ) : (
            <div className="space-y-2">
              {pitchList.map((r, i) => (
                <div
                  key={i}
                  className="
                    flex items-center justify-between gap-3
                    px-3 py-2 rounded-xl border
                    bg-white hover:bg-emerald-50 active:scale-[0.99] transition
                    border-slate-200
                  "
                >
                  {/* 左：名前＋背番号（番号は改行しない） */}
                  <div className="min-w-0 flex items-baseline gap-2">
                    <span className="font-medium text-slate-900 truncate">{r.name}</span>
                    {r.number && (
                      <span className="text-xs text-slate-600 shrink-0 whitespace-nowrap">
                        {r.number}
                      </span>
                    )}
                  </div>
                  {/* 右：投球数（改行なし） */}
                  <span className="shrink-0 whitespace-nowrap font-bold text-emerald-700">
                    {r.total}球
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター（OKだけ・親のまま） */}
        <div className="px-4 pb-4">
          <button
            className="w-full px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white
                       shadow-md shadow-amber-300/40 active:scale-[0.99] transition"
            onClick={() => setShowPitchListPopup(false)}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  </div>
)}



    </>    
  );
  
{/* === 共通ボトムタブ（該当画面のみ表示） === */}
{(["menu","startGame","offense","defense","operationSettings"] as ScreenType[]).includes(screen) && (
  <>
    {/* タブ分の下マージン（iOS Safe-Areaにも対応） */}
    <div className="md:hidden" style={{ height: "calc(56px + env(safe-area-inset-bottom))" }} />

    <BottomTab
      current={screen}
      onNavigate={(next) => {
        // ゲーム文脈フラグはタブ遷移ではオフに
        fromGameRef.current = false;
        setScreen(next);
      }}
    />
  </>
)}


};

const isTouchDevice = () => typeof window !== "undefined" && "ontouchstart" in window;

const AppWrapped = () => (
  <DndProvider
    backend={isTouchDevice() ? TouchBackend : HTML5Backend}
    options={
      isTouchDevice()
        ? {
            enableMouseEvents: true, // これを必ず追加！
          }
        : undefined
    }
  >
    <App />
  </DndProvider>
);
export default AppWrapped;