// PitchLimit.tsx（UIのみ刷新・機能は完全据え置き）
import React, { useState, useEffect } from "react";
import localForage from "localforage";

type Choice = "85" | "75" | "45" | "custom";

// ---- 見た目用の小さなSVG（ロジック非依存） ----
const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);
const IconBall = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm-5.5 10A8.5 8.5 0 018.9 4.86 12 12 0 007 12a12 12 0 001.9 7.14A8.5 8.5 0 016.5 12zm11 0A8.5 8.5 0 0115.1 19.14 12 12 0 0017 12a12 12 0 00-1.9-7.14A8.5 8.5 0 0117.5 12z"/>
  </svg>
);
const IconCustom = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M3 17h18v2H3v-2zm0-6h18v2H3V11zm0-6h18v2H3V5z"/>
  </svg>
);

export default function PitchLimit({ onBack }: { onBack: () => void }) {
  // ── 既存のロジック：そのまま ─────────────────────
  const [choice, setChoice] = useState<Choice>("75");
  const [custom, setCustom] = useState<number>(85);     // カスタムの保存値
  const [selected, setSelected] = useState<number>(75); // 実際に使う値

  useEffect(() => {
    (async () => {
      const savedChoice = (await localForage.getItem<string>("rule.pitchLimit.choice")) as Choice | null;
      const savedCustom = await localForage.getItem<number>("rule.pitchLimit.custom");
      const savedSelected = await localForage.getItem<number>("rule.pitchLimit.selected");
      const legacy = await localForage.getItem<number>("rule.pitchLimit"); // 旧キー互換

  const nextChoice: Choice =
    savedChoice ??
    (legacy === 45 ? "45" : legacy === 75 ? "75" : legacy === 85 ? "85" : "custom");

  const nextCustom =
    typeof savedCustom === "number"
      ? savedCustom
      : legacy && legacy !== 45 && legacy !== 75 && legacy !== 85
      ? legacy
      : 85;

  const nextSelected =
    typeof savedSelected === "number"
      ? savedSelected
      : nextChoice === "custom"
      ? nextCustom
      : nextChoice === "45"
      ? 45
      : nextChoice === "85"
      ? 85
      : 75;

      setChoice(nextChoice);
      setCustom(nextCustom);
      setSelected(nextSelected);
    })();
  }, []);

  const persist = async (c: Choice, cust: number, sel: number) => {
    setChoice(c);
    setCustom(cust);
    setSelected(sel);
    await localForage.setItem("rule.pitchLimit.choice", c);
    await localForage.setItem("rule.pitchLimit.custom", cust);
    await localForage.setItem("rule.pitchLimit.selected", sel);
  };

  const choose85 = () => persist("85", custom, 85);
  const choose75 = () => persist("75", custom, 75);
  const choose45 = () => persist("45", custom, 45);
  const chooseCustom = () => persist("custom", custom, custom);

  const decCustom = () => {
    const v = Math.max(0, custom - 1);
    persist("custom", v, v);
  };
  const incCustom = () => {
    const v = custom + 1;
    persist("custom", v, v);
  };

  const isChecked = (c: Choice) => choice === c;

  // ── UI：スマホ風に（className だけ変更） ───────────
  return (
    <div
      className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      {/* ヘッダー */}
      <header className="w-[100svw] -mx-6 md:mx-0 md:w-full pt-2">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-1 text-white/90 active:scale-95 px-3 py-2 rounded-lg bg-white/10 border border-white/10"
            onClick={onBack}
          >
            <IconBack />
            <span className="text-sm">運用設定に戻る</span>
          </button>
          <div className="w-10" />
        </div>

        {/* 中央タイトル */}
        <div className="mt-3 text-center select-none">
          <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-wide leading-tight">
            <IconBall />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
              規定投球数
            </span>
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />

        </div>
      </header>

      {/* 本体カード */}
      <main className="w-[100svw] -mx-6 md:mx-0 md:w-full mt-6">
        <section className="rounded-none md:rounded-2xl p-4 bg-white/10 border border-white/10 ring-1 ring-inset ring-white/10 shadow">
          <div className="space-y-5 text-base">
          {/* 85球 */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="radio"
              className="hidden"
              checked={isChecked("85")}
              onChange={choose85}
            />
            <span
              className={`inline-block w-4 h-4 rounded-full border-2 ${
                isChecked("85") ? "bg-blue-600 border-blue-600" : "border-white/60"
              }`}
            />
            <span className="font-medium">85球（コルト大会）</span>
          </label>

            {/* 75球 */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="radio" className="hidden" checked={isChecked("75")} onChange={choose75} />
              <span
                className={`inline-block w-4 h-4 rounded-full border-2 ${
                  isChecked("75") ? "bg-blue-600 border-blue-600" : "border-white/60"
                }`}
              />
              <span className="font-medium">75球（ポニー大会）</span>
            </label>

            {/* 45球 */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="radio" className="hidden" checked={isChecked("45")} onChange={choose45} />
              <span
                className={`inline-block w-4 h-4 rounded-full border-2 ${
                  isChecked("45") ? "bg-blue-600 border-blue-600" : "border-white/60"
                }`}
              />
              <span className="font-medium">45球（ブロンコ大会）</span>
            </label>

            {/* カスタム */}
            <div className="flex items-center gap-4 select-none">
              {/* 丸（押すと custom を選択） */}
              <button
                type="button"
                onClick={chooseCustom}
                aria-label="カスタムを選択"
                className="inline-flex items-center justify-center w-5 h-5"
              >
                <span
                  className={`inline-block w-4 h-4 rounded-full border-2 ${
                    isChecked("custom") ? "bg-blue-600 border-blue-600" : "border-white/60"
                  }`}
                  role="radio"
                  aria-checked={isChecked("custom")}
                />
              </button>
              {/* アクセシビリティ用：現状維持 */}
              <input type="radio" className="hidden" checked={isChecked("custom")} onChange={chooseCustom} />

              <span className="mr-1 cursor-default whitespace-nowrap shrink-0 inline-flex items-center gap-1">
                 <span className="font-medium">カスタム：</span>
              </span>

              {/* − ［現在値］ ＋ */}
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 active:scale-95"
                onClick={decCustom}
              >
                −
              </button>
              <span className="w-24 text-center inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-white/90 text-gray-900 border border-white/70 shadow-sm tabular-nums">
                {custom}球
              </span>
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 active:scale-95"
                onClick={incCustom}
              >
                ＋
              </button>
            </div>
          </div>
        <p className="mt-4 md:mt-6 text-left leading-relaxed text-xs text-white/70 px-4">
          ※ この設定は「規定投球数の10球前と到達時のアナウンス」で使用されます。
        </p>
        </section>
      </main>
    </div>
  );
}
