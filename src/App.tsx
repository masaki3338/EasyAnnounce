import React, { useState, useEffect } from "react";
import localForage from "localforage";

// 各画面コンポーネントをインポート
import TeamRegister from "./TeamRegister";
import MatchCreate from "./MatchCreate";
import StartingLineup from "./StartingLineup";
import StartGame from "./StartGame";
import PreGameAnnouncement from "./pre-game-announcement";
import Warmup from "./Warmup";
import SheetKnock from "./SheetKnock";
import AnnounceStartingLineup from "./AnnounceStartingLineup";
import OffenseScreen from "./OffenseScreen";
import DefenseScreen from "./DefenseScreen";
import DefenseChange from './DefenseChange';

// 画面の種類を列挙した型
type ScreenType =
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
  | "defenseChange";  // ← 追加

const screenMap: { [key: string]: ScreenType } = {
  "チーム・選手登録": "teamRegister",
  "試合作成": "matchCreate",
  "試合開始": "startGame",
  "テンプレート編集": "templateEdit",
};

const Menu = ({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) => (
  <div className="min-h-screen bg-gradient-to-b from-indigo-600 via-purple-700 to-pink-600 flex flex-col items-center justify-center px-6 py-10">
    <h1 className="text-white text-4xl font-extrabold mb-12 tracking-widest text-center drop-shadow-lg">
      野球アナウンス支援アプリ
    </h1>
    <div className="w-full max-w-sm space-y-6">
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
            className={`${colors[i]} w-full py-5 rounded-2xl shadow-lg text-white text-xl font-semibold transition-transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-white/50`}
            onClick={() => onNavigate(screenMap[label])}
          >
            {label}
          </button>
        );
      })}
    </div>
  </div>
);

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

  useEffect(() => {
    const initializeDatabase = async () => {
      const exists = await localForage.getItem("initialized");
      if (!exists) {
        await localForage.setItem("team", {
          name: "東京タイガース",
          furigana: "とうきょうたいがーす",
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
                const isHome = (match as { isHome: boolean }).isHome;
                //setScreen(match.isHome ? "offense" : "defense");
                setScreen(match.isHome ? "defense" : "offense");
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
          <Warmup />
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
          <SheetKnock />
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
          <AnnounceStartingLineup />
        </>
      )}

      {screen === "templateEdit" && <NotImplemented onBack={() => setScreen("menu")} />}

      {screen === "offense" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("menu")}
          >
            ← メニューに戻る
          </button>
          <OffenseScreen />
        </>
      )}

      {screen === "defense" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("menu")}
          >
            ← メニューに戻る
          </button>
          <DefenseScreen onChangeDefense={() => setScreen("defenseChange")} />
        </>
      )}

     {screen === "defenseChange" && (
        <>
          <button
            className="m-4 px-4 py-2 bg-gray-200 rounded-full shadow-sm hover:bg-gray-300 transition"
            onClick={() => setScreen("defense")}
          >
            ← 守備画面に戻る
          </button>
          <DefenseChange />
        </>
      )}
    </>
  );
};

export default App;
