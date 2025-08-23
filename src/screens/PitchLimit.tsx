import React, { useState, useEffect } from "react";
import localForage from "localforage";

type Choice = "75" | "45" | "custom";

export default function PitchLimit({ onBack }: { onBack: () => void }) {
  const [choice, setChoice] = useState<Choice>("75");
  const [custom, setCustom] = useState<number>(85);     // カスタムの保存値
  const [selected, setSelected] = useState<number>(75); // 実際に使う値

  // ── 初期ロード ─────────────────────────────────
  useEffect(() => {
    (async () => {
      const savedChoice = (await localForage.getItem<string>("rule.pitchLimit.choice")) as Choice | null;
      const savedCustom = await localForage.getItem<number>("rule.pitchLimit.custom");
      const savedSelected = await localForage.getItem<number>("rule.pitchLimit.selected");
      const legacy = await localForage.getItem<number>("rule.pitchLimit"); // 旧キー互換

      const nextChoice: Choice =
        savedChoice ?? (legacy === 45 ? "45" : legacy === 75 ? "75" : "custom");
      const nextCustom =
        typeof savedCustom === "number"
          ? savedCustom
          : legacy && legacy !== 45 && legacy !== 75
          ? legacy
          : 85;
      const nextSelected =
        typeof savedSelected === "number"
          ? savedSelected
          : nextChoice === "custom"
          ? nextCustom
          : nextChoice === "45"
          ? 45
          : 75;

      setChoice(nextChoice);
      setCustom(nextCustom);
      setSelected(nextSelected);
    })();
  }, []);

  // ── 保存ユーティリティ ─────────────────────────
  const persist = async (c: Choice, cust: number, sel: number) => {
    setChoice(c);
    setCustom(cust);
    setSelected(sel);
    await localForage.setItem("rule.pitchLimit.choice", c);
    await localForage.setItem("rule.pitchLimit.custom", cust);
    await localForage.setItem("rule.pitchLimit.selected", sel);
  };

  // ── ラジオ選択 ─────────────────────────────────
  const choose75 = () => persist("75", custom, 75);
  const choose45 = () => persist("45", custom, 45);
  const chooseCustom = () => persist("custom", custom, custom);

  // ── カスタムの +/- ボタン（押した瞬間に custom を選択状態にする） ──
  const decCustom = () => {
    const v = Math.max(0, custom - 1); // ← 1球単位
    persist("custom", v, v);
  };
  const incCustom = () => {
    const v = custom + 1; // ← 1球単位
    persist("custom", v, v);
  };

  const isChecked = (c: Choice) => choice === c;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-10">
      <div className="w-full max-w-md">
        <button className="mb-6 px-4 py-2 bg-gray-200 rounded" onClick={onBack}>
          ← 運用設定に戻る
        </button>

        <h2 className="text-2xl font-bold text-center mb-10">規定投球数</h2>

        <div className="space-y-6 text-lg px-7 sm:px-6">
          {/* 75 */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="radio" className="hidden" checked={isChecked("75")} onChange={choose75} />
            <span
              className={`inline-block w-4 h-4 rounded-full border-2 ${
                isChecked("75") ? "bg-blue-700 border-blue-700" : "border-green-600"
              }`}
            />
            <span>75球（ポニー大会）</span>
          </label>

          {/* 45 */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="radio" className="hidden" checked={isChecked("45")} onChange={choose45} />
            <span
              className={`inline-block w-4 h-4 rounded-full border-2 ${
                isChecked("45") ? "bg-blue-700 border-blue-700" : "border-green-600"
              }`}
            />
            <span>45球（ブロンコ大会）</span>
          </label>
            {/* カスタム（○をクリックで選択、±は独立して動く） */}
            <div className="flex items-center gap-4 select-none">
            {/* ラジオ状態の見た目の丸。これを押すと custom を選択 */}
            <button
                type="button"
                onClick={chooseCustom}
                aria-label="カスタムを選択"
                className="inline-flex items-center justify-center w-5 h-5"
            >
                <span
                className={`inline-block w-4 h-4 rounded-full border-2 ${
                    isChecked("custom") ? "bg-blue-700 border-blue-700" : "border-green-600"
                }`}
                role="radio"
                aria-checked={isChecked("custom")}
                />
            </button>

            {/* アクセシビリティ用の隠し input（任意） */}
            <input
                type="radio"
                className="hidden"
                checked={isChecked("custom")}
                onChange={chooseCustom}
            />

            <span className="mr-1 cursor-default">カスタム：</span>

            {/* 1球単位で増減。押した瞬間 custom を選択＆保存 */}
            <button type="button" className="px-4 py-2 bg-gray-300 rounded-lg" onClick={decCustom}>
                −
            </button>
            <span className="w-20 text-center">{custom}球</span>
            <button type="button" className="px-4 py-2 bg-gray-300 rounded-lg" onClick={incCustom}>
                ＋
            </button>
            </div>
        </div>
      </div>
    </div>
  );
}
