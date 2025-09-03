// screens/TiebreakRule.tsx
import React, { useEffect, useState } from "react";
import localForage from "localforage";

// ── 見た目用ミニアイコン（ロジック非依存） ──
const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);
const IconTB = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm1 7h5v2h-5zm-6 0h5v2H7zm0 4h10v2H7z"/>
  </svg>
);
const IconOuts = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
    <path d="M7 7h10v2H7zM7 11h6v2H7zM7 15h8v2H7z"/>
  </svg>
);
const IconBases = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
    <path d="M12 2L2 10l10 12L22 10 12 2zm0 4l6 4-6 8-6-8 6-4z"/>
  </svg>
);


type OutsLabel = "ノーアウト" | "ワンナウト" | "ツーアウト";
type BasesLabel = "1塁" | "2塁" | "3塁" | "1,2塁" | "2,3塁" | "満塁";

const OUTS: OutsLabel[] = ["ノーアウト", "ワンナウト", "ツーアウト"];
const BASES: BasesLabel[] = ["1塁", "2塁", "3塁", "1,2塁", "2,3塁", "満塁"];

export default function TiebreakRule({ onBack }: { onBack: () => void }) {
  const [outs, setOuts] = useState<OutsLabel>("ワンナウト");
  const [bases, setBases] = useState<BasesLabel>("2,3塁");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const cfg = (await localForage.getItem("tiebreakConfig")) as
        | { outs?: OutsLabel; bases?: BasesLabel }
        | null;
      if (cfg?.outs) setOuts(cfg.outs);
      if (cfg?.bases) setBases(cfg.bases);
    })();
  }, []);

  const save = async () => {
    await localForage.setItem("tiebreakConfig", { outs, bases });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

return (
  <div
    className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
    style={{
      paddingTop: "max(16px, env(safe-area-inset-top))",
      paddingBottom: "max(16px, env(safe-area-inset-bottom))",
    }}
  >
    <div className="w-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3 w-full">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-white/90 active:scale-95 px-3 py-2 rounded-lg bg-white/10 border border-white/10"
        >
          <IconBack />
          <span className="text-sm">運用設定に戻る</span>
        </button>
        <div className="w-10" />
      </div>

      {/* タイトル */}
      <div className="mt-1 text-center select-none mb-2 w-full">
        <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-wide leading-tight">
          <IconTB />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
            タイブレーク設定
          </span>
        </h1>
        <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
      </div>

      {/* 本体カード（ここで開いて最後に閉じる） */}
      <section
        className="
          w-[100svw] -mx-6 md:mx-0 md:w-full
          rounded-none md:rounded-2xl
          p-4 md:p-6
          bg-white/10 border border-white/10 ring-1 ring-inset ring-white/10 shadow
        "
      >
        {/* 見出しプレビュー */}
        <div className="text-center text-base sm:text-lg font-semibold">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 border border-white/10">
            <IconOuts />
            <span>{outs}</span>
          </span>
          <span className="mx-1 opacity-70">／</span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 border border-white/10">
            <IconBases />
            <span>{bases}</span>
          </span>
          <span className="ml-2 opacity-90">からのタイブレーク</span>
        </div>

        {/* 入力フォーム */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <label className="block">
            <div className="text-sm text-white/90 mb-1">アウト数（◯死）</div>
            <select
              className="w-full rounded-xl bg-white/90 text-gray-900 border border-white/70 shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={outs}
              onChange={(e) => setOuts(e.target.value as OutsLabel)}
            >
              {OUTS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-sm text-white/90 mb-1">ランナー（●塁）</div>
            <select
              className="w-full rounded-xl bg-white/90 text-gray-900 border border-white/70 shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={bases}
              onChange={(e) => setBases(e.target.value as BasesLabel)}
            >
              {BASES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="text-sm text-white/70 mt-4">
          ※ この設定は試合画面の「その他 → タイブレーク」で使用されます。
        </div>

        <div className="flex gap-3 justify-center mt-3">
          <button
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow active:scale-95"
            onClick={save}
          >
            保存する
          </button>
        </div>

        {saved && (
          <div className="text-center">
            <span className="inline-block mt-2 px-3 py-1.5 rounded-xl bg-emerald-500/90 text-white text-sm">
              保存しました
            </span>
          </div>
        )}
      </section>
    </div>
  </div>
);

}
