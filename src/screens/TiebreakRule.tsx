// screens/TiebreakRule.tsx
import React, { useEffect, useState } from "react";
import localForage from "localforage";

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
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-10 px-6">
      <div className="w-full max-w-2xl">
        <button className="mb-6 px-4 py-2 bg-gray-200 rounded" onClick={onBack}>
          ← 運用設定に戻る
        </button>

        <h2 className="text-2xl font-bold text-center mb-4">タイブレーク設定</h2>

        <div className="p-6 rounded-xl bg-white shadow space-y-6">
          {/* 見出しプレビュー */}
          <div className="text-center text-lg font-semibold">
            <span className="text-gray-500">{outs}</span>
            <span className="mx-1">／</span>
            <span className="text-gray-500">{bases}</span>
            からのタイブレーク
          </div>

          {/* 入力フォーム */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <div className="text-sm text-gray-600 mb-1">アウト数（◯死）</div>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-gray-50"
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
              <div className="text-sm text-gray-600 mb-1">ランナー（●塁）</div>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-gray-50"
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

          <div className="text-sm text-gray-500">
            ※ この設定は試合画面の「その他 → タイブレーク」で使用されます。
          </div>

          <div className="flex gap-3 justify-center">
            <button className="bg-gray-600 text-white px-4 py-2 rounded" onClick={save}>
              保存
            </button>
          </div>

          {saved && <div className="text-green-600 text-center">保存しました</div>}
        </div>
      </div>
    </div>
  );
}
