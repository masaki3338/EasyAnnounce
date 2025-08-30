import React, { useState, useEffect, useRef } from "react";
import localForage from "localforage";
import Gather from "./Gather";
import StartGreeting from "./StartGreeting";  // 追加
import SeatIntroduction from "./SeatIntroduction";

import { DndProvider } from 'react-dnd';
import { TouchBackend } from 'react-dnd-touch-backend';
import { HTML5Backend } from 'react-dnd-html5-backend';

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
const APP_VERSION = "0.02"

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
        const validScreens: ScreenType[] = [
          "offense",
          "defense",
          "defenseChange",
          "startGame",
          "announcement"
        ];
        if (validScreens.includes(saved as ScreenType)) {
          setCanContinue(true);
          setLastScreen(saved as ScreenType);
        }
      }
    })();
  }, []);
  
  return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center px-6 py-10">
          <h1 className="text-white text-4xl font-black tracking-widest text-center drop-shadow-lg leading-tight">
            ⚾️Easyアナウンス🎤
          </h1>
          <h2 className="text-white text-lg font-semibold tracking-wide text-center drop-shadow mt-1 mb-10">
            ～ Pony League Version ～ 
          </h2>
        <div className="w-full max-w-sm space-y-4">

        {/* 通常メニュー */}
        {Object.keys(screenMap).map((label, i) => {
          const colors = [
            "bg-pink-600 hover:bg-pink-700",
            "bg-purple-600 hover:bg-purple-700",
            "bg-blue-600 hover:bg-blue-700",
            "bg-green-600 hover:bg-green-700",
          ];
          return (
          <button
            key={label}
            className={`bg-gray-700 hover:bg-gray-600 w-full py-5 rounded-2xl shadow text-white text-lg font-semibold transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-gray-300`}
            onClick={() => onNavigate(screenMap[label])}
          >
            {label}
          </button>

          );
        })}

        {/* 試合継続ボタン */}
        {canContinue && lastScreen && (
          <button
            onClick={() => onNavigate(lastScreen)}
            className="bg-red-400 hover:bg-red-500 w-full py-5 rounded-2xl shadow text-white text-lg font-semibold transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-200"

          >
            ▶ 試合を継続する
          </button>
        )}
      </div>

      <div className="mt-12 text-white text-sm opacity-70 select-none">
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
            onNavigate={setScreen}
            onBack={() => setScreen("startGame")} // ← ここで必須のonBackを渡す
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
              setEndGameAnnouncement(
                `ただいまの試合は、ご覧のように${totalMyScore}対${totalOpponentScore}で${myTeam}が勝ちました。\n` +
                `審判員の皆様、ありがとうございました。\n` +
                `健闘しました両チームの選手に、盛大な拍手をお願いいたします。\n` +
                `尚、この試合の終了時刻は ${formatted} です。\n` +
                `これより、ピッチングレコードの確認を行います。\n` +
                `両チームの監督、キャプテンはピッチングレコードを記載の上、バックネット前にお集まりください。\n` +
                `球審、EasyScore担当、公式記録員、球場役員もお集まりください。\n` +
                `第${nextGame}試合のグランド整備は、第${nextGame}試合のシートノック終了後に行います。\n` +
                `第${currentGame}試合の選手は、グランド整備ご協力をよろしくお願いいたします。`
              );
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
              setEndGameAnnouncement(
                `ただいまの試合は、ご覧のように${totalMyScore}対${totalOpponentScore}で${myTeam}が勝ちました。\n` +
                `審判員の皆様、ありがとうございました。\n` +
                `健闘しました両チームの選手に、盛大な拍手をお願いいたします。\n` +
                `尚、この試合の終了時刻は ${formatted} です。\n` +
                `これより、ピッチングレコードの確認を行います。\n` +
                `両チームの監督、キャプテンはピッチングレコードを記載の上、バックネット前にお集まりください。\n` +
                `球審、EasyScore担当、公式記録員、球場役員もお集まりください。\n` +
                `第${nextGame}試合のグランド整備は、第${nextGame}試合のシートノック終了後に行います。\n` +
                `第${currentGame}試合の選手は、グランド整備ご協力をよろしくお願いいたします。`
              );
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


{showEndGamePopup && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="bg-pink-100 p-6 rounded-xl shadow-xl text-center space-y-4 max-w-2xl w-full">
      {/* 🔶 注意表示（ポップアップ内） */}
      <div className="bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 px-4 py-2 text-sm font-semibold flex items-center gap-2 text-left">
        <span className="text-2xl">⚠️</span>
        勝利チーム🎤
      </div>
      <div className="text-xl font-bold text-red-600 flex items-center justify-center gap-2 leading-relaxed">
        <img src="/icons/mic-red.png" alt="Mic" className="w-10 h-10 mr-4" />
        <div className="text-left whitespace-pre-line max-h-[60vh] overflow-y-auto pr-2">{endGameAnnouncement}</div>
      </div>
      <div className="flex justify-center gap-4 flex-wrap">
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={() => {
            const msg = new SpeechSynthesisUtterance(endGameAnnouncement);
            speechSynthesis.speak(msg);
          }}
        >
          読み上げ
        </button>
        <button
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          onClick={() => speechSynthesis.cancel()}
        >
          停止
        </button>
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={() => setShowEndGamePopup(false)}
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}
{showHeatPopup && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="border border-red-500 bg-red-200 p-6 rounded-lg shadow text-center text-xl text-red-600 font-bold space-y-4">
      <div className="text-xl font-bold text-red-600 flex items-center justify-center gap-2 leading-relaxed">
        <img src="/icons/mic-red.png" alt="Mic" className="w-10 h-10 mr-4" />
        <div className="text-left whitespace-pre-line">{heatMessage}</div>
      </div>
      <div className="flex justify-center gap-4 flex-wrap">
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={() => {
            const msg = new SpeechSynthesisUtterance(heatMessage);
            speechSynthesis.speak(msg);
          }}
        >
          読み上げ
        </button>
        <button
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          onClick={() => speechSynthesis.cancel()}
        >
          停止
        </button>
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={() => setShowHeatPopup(false)}
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}


{showTiebreakPopup && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="border border-red-500 bg-red-200 p-6 rounded-lg shadow text-center text-xl text-red-600 font-bold space-y-4 max-w-2xl w-full">
      {/* 見出し */}
      <div className="text-xl font-bold text-red-600 flex items-center justify-center gap-2 leading-relaxed">
        <img src="/icons/mic-red.png" alt="Mic" className="w-10 h-10 mr-2" />
        <div>タイブレーク開始</div>
      </div>

      {/* 本文（改行維持） */}
      <p className="text-left text-red-600 font-semibold whitespace-pre-line leading-relaxed">
        {tiebreakMessage}
      </p>

      {/* ボタン群（継続試合と同じ並び） */}
      <div className="flex justify-center gap-8">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          onClick={() => {
            const msg = new SpeechSynthesisUtterance(tiebreakMessage);
            speechSynthesis.speak(msg);
          }}
        >
          読み上げ
        </button>
        <button
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          onClick={() => speechSynthesis.cancel()}
        >
          停止
        </button>
        <button
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          onClick={() => setShowTiebreakPopup(false)}
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}



{showContinuationModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
    <div className="border border-red-500 bg-red-200 p-6 rounded-lg shadow text-center text-xl text-red-600 font-bold space-y-4">
      <div className="text-xl font-bold text-red-600 flex items-center justify-center gap-2 leading-relaxed">
        <img src="/icons/mic-red.png" alt="Mic" className="w-10 h-10 mr-4" />
      </div>

      {/* メッセージ本文 */}
      <p className="text-left text-red-600 font-semibold mb-6 leading-relaxed">
        この試合は、ただ今で打ち切り、継続試合となります。<br />
        明日以降に中断した時点から再開いたします。<br />
        あしからずご了承くださいませ。
      </p>

      {/* ボタン群 */}
      <div className="flex justify-center gap-8">
        <button
          onClick={handleSpeak}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          読み上げ
        </button>
        <button
          onClick={handleStop}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          停止
        </button>
        <button
          onClick={() => setShowContinuationModal(false)}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          OK
        </button>
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

{showPitchListPopup && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-xl shadow-xl text-center space-y-4 w-[340px]">
      <h2 className="text-xl font-bold">投球数</h2>

      <div className="text-left font-medium leading-8">
        {pitchList.length === 0 ? (
          <div className="text-gray-500">記録がありません</div>
        ) : (
          pitchList.map((r, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="flex-1">
                {r.name} {r.number ?? ""}
              </span>
              <span className="w-16 text-right">{r.total}球</span>
            </div>
          ))
        )}
      </div>

      <button
        className="mt-2 bg-gray-600 text-white px-6 py-2 rounded"
        onClick={() => setShowPitchListPopup(false)}
      >
        OK
      </button>
    </div>
  </div>
)}


    </>    
  );
  
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