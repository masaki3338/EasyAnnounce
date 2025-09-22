import React, { useState, useEffect } from "react";
import localForage from "localforage";

// --- ミニSVGアイコン（外部依存なし） ---
const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);
const IconTrophy = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M6 3v2H4v3a5 5 0 004 4.9V15H7v2h10v-2h-1v-2.1A5 5 0 0020 8V5h-2V3H6zm2 2h8v2h2v1a3 3 0 01-3 3H9A3 3 0 016 8V7h2V5zm3 9h2v1h-2v-1z"/>
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm13 6H4v12h16V8z"/>
  </svg>
);
const IconVs = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M7 7h4l-4 10H3L7 7zm14 0l-5 10h-4l5-10h4z"/>
  </svg>
);
const IconHomeAway = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z"/>
  </svg>
);
const IconBench = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M4 10h16v2H4v-2zm0 5h16v2H4v-2z"/>
  </svg>
);
const IconUmpire = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 2a4 4 0 110 8 4 4 0 010-8zm-7 18a7 7 0 0114 0v2H5v-2z"/>
  </svg>
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm-7-3h2a5 5 0 0010 0h2a7 7 0 01-6 6.9V20h3v2H8v-2h3v-2.1A7 7 0 015 11z"/>
  </svg>
);
const IconClock = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm1 5h-2v6h6v-2h-4z" />
  </svg>
);
const IconAlert: React.FC = () => (
  <img
    src="/warning-icon.png"        // ← public/warning-icon.png
    alt="注意"
    className="w-6 h-6 object-contain select-none pointer-events-none"
    aria-hidden
    draggable={false}
    width={24}
    height={24}
  />
);

type MatchCreateProps = {
  onBack: () => void;
  onGoToLineup: () => void;
};

const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onGoToLineup }) => {
  const [tournamentName, setTournamentName] = useState("");
  const [recentTournaments, setRecentTournaments] = useState<string[]>([""]);
  const [lastPickedName, setLastPickedName] = useState<string>("");
  const [matchNumber, setMatchNumber] = useState(1);
  const [opponentTeam, setOpponentTeam] = useState("");
  // 相手チーム名のふりがな
  const [opponentTeamFurigana, setOpponentTeamFurigana] = useState("");
  const [isHome, setIsHome] = useState("先攻");
  const [benchSide, setBenchSide] = useState("1塁側");
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [speakingExchange, setSpeakingExchange] = useState(false);

  const [umpires, setUmpires] = useState([
    { role: "球審", name: "", furigana: "" },
    { role: "1塁審", name: "", furigana: "" },
    { role: "2塁審", name: "", furigana: "" },
    { role: "3塁審", name: "", furigana: "" },
  ]);
  // ✅ 2審制フラグ（true: 球審＋1塁審のみ表示）
  const [isTwoUmp, setIsTwoUmp] = useState<boolean>(false);
  // 追加：次の試合なし
  const [noNextGame, setNoNextGame] = useState<boolean>(false);
  // 追加：未保存チェック用
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const snapshotRef = React.useRef<string | null>(null);

  // 現在の値をスナップショット化
  const buildSnapshot = () =>
    JSON.stringify({
      tournamentName,
      matchNumber,
      opponentTeam,
      opponentTeamFurigana,
      isHome,
      benchSide,
      umpires,
      isTwoUmp,
      noNextGame,
    });


useEffect(() => {
  const loadMatchInfo = async () => {
    // 大会名リスト（5件＋先頭空白）をロード
    const savedList = await localForage.getItem<string[]>("recentTournaments");
    if (savedList && Array.isArray(savedList) && savedList.length > 0) {
      // 先頭は必ず空白に補正
      const normalized = ["", ...savedList.filter((x) => x && x.trim() !== "")].slice(0, 6);
      setRecentTournaments(normalized);
    } else {
      setRecentTournaments([""]);
    }

    // 既存の試合情報をロード
    const saved = await localForage.getItem<{
      tournamentName: string;
      matchNumber: number;
      opponentTeam: string;
      isHome: string | boolean; // 過去互換
      benchSide: string;
      umpires: { role: string; name: string; furigana: string }[];
    }>("matchInfo");

    if (saved) {
      setTournamentName(saved.tournamentName ?? "");
      setMatchNumber(Number(saved.matchNumber ?? 1));
      setOpponentTeam(saved.opponentTeam ?? "");
      setOpponentTeamFurigana((saved as any).opponentTeamFurigana ?? "");
      // 既存コードは "後攻" を boolean にマッピングしているので過去互換で吸収
      // ★ 修正：boolean または string の両対応で正規化
      const homeSrc = (saved as any).isHome;
      const normalizedIsHome =
        typeof homeSrc === "boolean"
          ? (homeSrc ? "後攻" : "先攻")
          : (homeSrc === "後攻" ? "後攻" : "先攻");
      setIsHome(normalizedIsHome);

      setBenchSide(saved.benchSide ?? "1塁側");

      if (saved.umpires?.length === 4) {
        setUmpires(saved.umpires);
      }
      // ✅ 保存済みの 2審制 を復元（無ければ false）
      setIsTwoUmp(Boolean((saved as any).twoUmpires));
      setNoNextGame(Boolean((saved as any).noNextGame)); 
    }
  };
  loadMatchInfo();

}, []);


useEffect(() => {
  if (snapshotRef.current == null) return; // 初期化前はスキップ
  setIsDirty(buildSnapshot() !== snapshotRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [
  tournamentName,
  matchNumber,
  opponentTeam,
  opponentTeamFurigana,
  isHome,
  benchSide,
  umpires,
  isTwoUmp,
  noNextGame,
]);


// 大会名を「5件まで（先頭は空白）」で更新して保存するヘルパー
const upsertRecentTournaments = async (name: string) => {
  const trimmed = (name ?? "").trim();

  // 先頭空白以外は何も入力していない場合は保存スキップ
  if (trimmed === "") {
    setTournamentName("");
    return;
  }

  // 現在のリストから空白と重複を取り除き、先頭に今回を追加
  const saved = await localForage.getItem<string[]>("recentTournaments");
  let base = (saved && Array.isArray(saved) ? saved : recentTournaments).filter((t) => t !== "");

  let list: string[];
  // リストから選んで編集した（＝元の選択肢が残っている）なら“置換”
  if (lastPickedName && lastPickedName !== "" && lastPickedName !== trimmed && base.includes(lastPickedName)) {
    list = base.map((t) => (t === lastPickedName ? trimmed : t));
  } else {
    // それ以外は従来どおり：重複を除いて先頭に追加
    list = [trimmed, ...base.filter((t) => t !== trimmed)];
  }

  list = list.slice(0, 5);
  const finalList = ["", ...list];

  setRecentTournaments(finalList);
  await localForage.setItem("recentTournaments", finalList);
  setLastPickedName(""); // 次回に持ち越さない
};

// 置き換え：読み上げ開始
const speakExchangeMessage = () => {
  speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(
    `${tournamentName} 本日の第一試合、両チームのメンバー交換を行います。両チームのキャプテンと全てのベンチ入り指導者は、ボール3個とメンバー表とピッチングレコードを持って本部席付近にお集まりください。ベンチ入りのスコアラー、審判員、球場責任者、EasyScore担当、公式記録員、アナウンスもお集まりください。メンバーチェックと道具チェックはシートノックの間に行います。`
  );
  msg.lang = "ja-JP";
  msg.onstart = () => setSpeakingExchange(true);
  const clear = () => setSpeakingExchange(false);
  msg.onend = clear; msg.onerror = clear;
  speechSynthesis.speak(msg);
};

// 置き換え：読み上げ停止
const stopExchangeMessage = () => {
  speechSynthesis.cancel();
  setSpeakingExchange(false);
};

  const handleUmpireChange = (
    index: number,
    field: "name" | "furigana",
    value: string
  ) => {
    const updated = [...umpires];
    updated[index][field] = value;
    setUmpires(updated);
  };

const handleSave = async () => {
  // まず大会名リストを更新（5件上限、先頭空白維持）
  await upsertRecentTournaments(tournamentName);

  // 既存の試合情報保存は維持
 const team = await localForage.getItem<any>("team");
 const existing = await localForage.getItem<any>("matchInfo");
 const scores   = await localForage.getItem<any>("scores");

 // 進行中かどうか（スコアがある or 1回裏以降へ進んでいる）
 const hasProgress =
   (scores && Object.keys(scores).length > 0) ||
   (existing && (
     Number(existing?.inning) > 1 ||
     (Number(existing?.inning) === 1 && existing?.isTop === false)
   ));

 // 進行中なら inning/isTop は絶対に触らない
 const base = hasProgress ? (existing || {}) : { inning: 1, isTop: true };

 const matchInfo = {
   ...base,
   tournamentName,
   matchNumber,
   opponentTeam,
   opponentTeamFurigana,
   isHome: isHome === "後攻",
   benchSide,
   umpires,
   twoUmpires: isTwoUmp, 
   teamName: (base as any)?.teamName ?? team?.name ?? "",
   noNextGame, 
 };

 await localForage.setItem("matchInfo", matchInfo);

  await localForage.setItem("matchNumberStash", matchNumber);

  snapshotRef.current = buildSnapshot();
  setIsDirty(false);

  alert("✅ 試合情報を保存しました");
};

return (
  <div
    className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-5"
    style={{
          paddingTop: "max(16px, env(safe-area-inset-top))",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          WebkitTouchCallout: "none", // ← 長押しメニュー禁止（iOS Safari）
          WebkitUserSelect: "none",   // ← テキスト選択禁止（iOS/Android）
          userSelect: "none",         // ← 全体選択禁止
        }}
  >
    {/* ヘッダー */}
    <header className="w-full max-w-md">


      {/* 中央大タイトル */}
      <div className="mt-3 text-center select-none">
        <h1
          className="
            inline-flex items-center gap-2
            text-3xl md:text-4xl font-extrabold tracking-wide leading-tight
          "
        >
          <span className="text-2xl md:text-3xl">🗓️</span>
          <span
            className="
              bg-clip-text text-transparent
              bg-gradient-to-r from-white via-blue-100 to-blue-400
              drop-shadow
            "
          >
            試合情報入力
          </span>
        </h1>
        <div className="mx-auto mt-2 h-0.5 w-20 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
      </div>
    </header>

    {/* 本体：カード群 */}
    <main className="w-full max-w-md mt-5 space-y-5">

      {/* 大会名 ＋ 本日の 第n試合 */}
      <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
            <IconTrophy />
          </div>
          <div className="font-semibold">大会名</div>
        </div>

        <div className="flex items-start gap-4">
          {/* 左：大会名セレクト＋上書き入力 */}
          <div className="flex-1 space-y-2">
            <select
            value={tournamentName}
            onChange={(e) => {
              const v = e.target.value;
              setTournamentName(v);
              setLastPickedName(v); // ← これを“編集元”として記録
            }}
              className="w-full p-3 rounded-xl bg-white text-gray-900 border border-white/20"
            >
              {recentTournaments.map((name, i) => (
                <option key={i} value={name}>
                  {name === "" ? "　" : name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              className="w-full p-3 rounded-xl bg-white text-gray-900 placeholder-gray-400 border border-white/20"
              placeholder="大会名を入力（上書き可）"
            />
          </div>

          {/* 右：本日の 第n試合 */}
          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <IconCalendar />
              <span className="text-sm">本日の</span>
            </div>
            <select
              value={matchNumber}
              onChange={async (e) => {
                const num = Number(e.target.value);
                setMatchNumber(num);                
              }}
              className="p-3 rounded-xl bg-white text-gray-900 border border-white/20"
            >
              {[1, 2, 3, 4, 5].map((num) => (
                <option key={num} value={num}>第{num}試合</option>
              ))}
            </select>
            {/* ▼ 追加：次の試合なし */}
            <label className="mt-2 flex items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-rose-600"
                checked={noNextGame}
                onChange={(e) => setNoNextGame(e.target.checked)}
              />
              次の試合なし
            </label>

          </div>
        </div>
      </section>


      {/* 相手チーム名＋ふりがな */}
      <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
            <IconVs />
          </div>
          <div className="font-semibold">相手チーム</div>
        </div>

        <input
          type="text"
          value={opponentTeam}
          onChange={(e) => setOpponentTeam(e.target.value)}
          className="w-full p-3 rounded-xl bg-white text-gray-900 placeholder-gray-400 border border-white/20"
          placeholder="相手チーム名を入力"
        />
        <input
          type="text"
          value={opponentTeamFurigana}
          onChange={(e) => setOpponentTeamFurigana(e.target.value)}
          className="w-full p-3 rounded-xl bg-white text-gray-900 placeholder-gray-400 border border-white/20 mt-2"
          placeholder="相手チーム名のふりがな"
        />
      </section>

      {/* 自チーム情報（先攻/後攻・ベンチ側） */}
      <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
            <IconHomeAway />
          </div>
          <div className="font-semibold">自チーム情報</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <select
            value={isHome}
            onChange={(e) => setIsHome(e.target.value)}
            className="w-full p-3 rounded-xl bg-white text-gray-900 border border-white/20"
          >
            <option>先攻</option>
            <option>後攻</option>
          </select>

          <div className="flex items-center gap-2">
            <IconBench />
            <select
              value={benchSide}
              onChange={(e) => setBenchSide(e.target.value)}
              className="w-full p-3 rounded-xl bg-white text-gray-900 border border-white/20"
            >
              <option>1塁側</option>
              <option>3塁側</option>
            </select>
          </div>
        </div>

        {/* メンバー交換ボタン（条件一致時のみ） */}
        {matchNumber === 1 && benchSide === "1塁側" && (
          <div className="mt-4">
            <button
              onClick={() => setShowExchangeModal(true)}
              className="px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl text-base active:scale-95"
            >
              メンバー交換（読み上げ案内）
            </button>
          </div>
        )}
      </section>

{/* 審判 */}
 <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
  <div className="flex items-center gap-3 mb-3">
    <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
      <IconUmpire />
    </div>
    <div className="font-semibold">審判</div>
    {/* 2審制 チェック（審判の右隣に少し間を空けて配置） */}
    <label className="ml-3 inline-flex items-center gap-2 text-sm select-none">
      <input
        type="checkbox"
        className="w-4 h-4 accent-emerald-600"
        checked={isTwoUmp}
        onChange={(e) => setIsTwoUmp(e.target.checked)}
        aria-label="2審制"
      />
      2審制
    </label>
    <span className="ml-2 text-xs text-white/70 whitespace-nowrap">
      後攻チームのみ使用
    </span>
  </div>

  <div className="space-y-3">
    {umpires.slice(0, isTwoUmp ? 2 : 4).map((umpire, index) => (
      // ✅ レイアウトを刷新：役割は左（md以上）／上（モバイル）
      <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
        {/* 役割ラベル */}
        <span className="font-medium text-sm md:text-base md:col-span-3">
          {umpire.role}
        </span>

        {/* 氏名＋ふりがな：常に横並びで1/2ずつ */}
        <div className="md:col-span-9 grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="氏名"
            value={umpire.name}
            onChange={(e) => handleUmpireChange(index, "name", e.target.value)}
            className="w-full p-3 rounded-xl bg-white text-gray-900 placeholder-gray-400 border border-white/20"
          />
          <input
            type="text"
            placeholder="ふりがな"
            value={umpire.furigana}
            onChange={(e) => handleUmpireChange(index, "furigana", e.target.value)}
            className="w-full p-3 rounded-xl bg-white text-gray-900 placeholder-gray-400 border border-white/20"
          />
        </div>
      </div>
    ))}
  </div>
</section>


      {/* アクションボタン */}
      <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={handleSave}
          className="w-full px-6 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl text-lg font-semibold active:scale-95"
        >
          💾 保存する
        </button>

        <button
          onClick={async () => {
            await upsertRecentTournaments(tournamentName);
            const team = await localForage.getItem<any>("team");
            const existing = await localForage.getItem<any>("matchInfo");
            const scores   = await localForage.getItem<any>("scores");

            const hasProgress =
              (scores && Object.keys(scores).length > 0) ||
              (existing && (
                Number(existing?.inning) > 1 ||
                (Number(existing?.inning) === 1 && existing?.isTop === false)
              ));
            const base = hasProgress ? (existing || {}) : { inning: 1, isTop: true };

            const matchInfo = {
              ...base,
              tournamentName,
              matchNumber,
              opponentTeam,
              opponentTeamFurigana,
              isHome: isHome === "後攻",
              benchSide,
              umpires,
              twoUmpires: isTwoUmp,          // ✅ 2審制を記憶
              teamName: (base as any)?.teamName ?? team?.name ?? "",    
              noNextGame,// ✅ 追加：次の試合なし
            };
            await localForage.setItem("matchInfo", matchInfo);
 
            await localForage.setItem("matchNumberStash", matchNumber);
            onGoToLineup();
          }}
          className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-lg font-semibold active:scale-95"
        >
          ▶ スタメン設定
        </button>
      </div>
      {/* ← スタメン設定の直下：横いっぱいの戻るボタン */}
      <div className="mt-2">
        <button
          onClick={() => {
            if (isDirty) setShowLeaveConfirm(true);
            else onBack();
          }}

          className="w-full px-6 py-4 rounded-2xl text-white text-lg font-semibold
                    bg-white/10 hover:bg-white/15 border border-white/15
                    shadow active:scale-95 inline-flex items-center justify-center gap-2"
          aria-label="戻る"
        >
          <span>← 戻る</span>
        </button>
      </div>
    </main>

    {/* 既存のモーダルはそのまま下に（読み上げ/停止/OK） */}
    {showExchangeModal && (
      <div className="fixed inset-0 z-50">
        {/* 背景（タップで閉じる） */}
        <div
          className="absolute inset-0 bg-black/90 backdrop-blur-sm"
          onClick={() => { stopExchangeMessage(); setShowExchangeModal(false); }}
        />

        {/* 本体パネル */}
        <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-auto
                        bg-gradient-to-b from-gray-900 to-gray-850 text-white
                        rounded-t-3xl sm:rounded-2xl shadow-2xl
                        max-w-md w-full mx-auto p-5 sm:p-6">
    {/* ヘッダー行（両チップを横並びに） */}
    <div className="flex items-center justify-between mb-3 gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-full
                        bg-amber-500/20 border border-amber-400/40">
          <IconAlert />
          <span className="text-amber-50/90">試合開始45分前に🎤</span>
        </div>
        <div className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-full
                        bg-white/10 border border-white/10">
          <span className="font-semibold">1塁側チーム 🎤</span>
        </div>
      </div>

    </div>


          {/* 🔴 アナウンス文言（赤 強め）＋ ボタン内蔵 */}
          <div className="
              rounded-2xl p-4 shadow-lg font-semibold
              border border-rose-600/90
              bg-gradient-to-br from-rose-600/50 via-rose-500/40 to-rose-400/30
              ring-1 ring-inset ring-rose-600/60
            ">
            <p className="text-white whitespace-pre-line leading-relaxed drop-shadow">
              <strong>{tournamentName}</strong>
              {"\n"}本日の第一試合、両チームのメンバー交換を行います。
              {"\n"}両チームのキャプテンと全てのベンチ入り指導者は、
              ボール3個とメンバー表とピッチングレコードを持って本部席付近にお集まりください。
              {"\n"}ベンチ入りのスコアラー、審判員、球場責任者、EasyScore担当、公式記録員、アナウンスもお集まりください。
              {"\n"}メンバーチェックと道具チェックはシートノックの間に行います。
            </p>

            {/* 赤枠内の操作ボタン */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={speakExchangeMessage}
                disabled={speakingExchange}
                className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow active:scale-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                <IconMic /> 読み上げ
              </button>
              <button
                onClick={stopExchangeMessage}
                disabled={!speakingExchange}
                className="w-full px-4 py-3 rounded-xl bg-gray-600 hover:bg-gray-700 text-white font-semibold shadow active:scale-95 inline-flex items-center justify-center"
              >
                停止
              </button>
            </div>
          </div>

          {/* フッター（OKのみ） */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => { stopExchangeMessage(); setShowExchangeModal(false); }}
              className="w-full px-5 py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-semibold shadow active:scale-95"
            >
              OK
            </button>
          </div>

        </div>
      </div>
    )}

    {showLeaveConfirm && (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-6"
      role="dialog"
      aria-modal="true"
      onClick={() => setShowLeaveConfirm(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white text-gray-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* ヘッダー */}
        <div className="bg-green-600 text-white text-center font-bold py-3">
          確認
        </div>

        {/* 本文 */}
        <div className="px-6 py-5 text-center">
          <p className="whitespace-pre-line text-[15px] font-bold text-gray-800 leading-relaxed">
            変更した内容を保存していませんが{"\n"}
            よろしいですか？
          </p>
        </div>

        {/* フッター */}
        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              className="w-full py-3 rounded-full bg-red-600 text-white font-semibold"
              onClick={() => setShowLeaveConfirm(false)}
            >
              NO
            </button>
            <button
              className="w-full py-3 rounded-full bg-green-600 text-white font-semibold"
              onClick={() => {
                setShowLeaveConfirm(false);
                onBack();
              }}
            >
              YES
            </button>
          </div>
        </div>
      </div>
    </div>
  )}


  </div>
);

};

export default MatchCreate;
