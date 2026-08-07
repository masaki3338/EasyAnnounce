// src/screens/OperationSettings.tsx
import type { ScreenType } from "../App";
import React, { useEffect, useState } from "react";
import localForage from "localforage";
import { getLeagueMode } from "../lib/leagueSettings";


type AnnouncementTimingSettings = {
  coolingEnabled: boolean;
  coolingMinutes: number;
  coolingAnnouncementMinutes: number;
  coolingFirstInning: number;
  coolingSecondInning: number | null;
  groundMaintenanceInning: number | null;
};

const DEFAULT_ANNOUNCEMENT_TIMING_SETTINGS: AnnouncementTimingSettings = {
  coolingEnabled: false,
  coolingMinutes: 3,
  coolingAnnouncementMinutes: 1,
  coolingFirstInning: 3,
  coolingSecondInning: 5,
  groundMaintenanceInning: 5,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const NumberStepper: React.FC<{
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}> = ({ value, min, max, suffix, onChange }) => (
  <div className="grid grid-cols-[48px_1fr_48px] items-center gap-2">
    <button
      type="button"
      onClick={() => onChange(clamp(value - 1, min, max))}
      disabled={value <= min}
      className="h-11 rounded-xl bg-slate-700 text-xl font-bold disabled:opacity-35 active:scale-95"
    >
      −
    </button>
    <div className="h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center font-bold">
      {value}{suffix}
    </div>
    <button
      type="button"
      onClick={() => onChange(clamp(value + 1, min, max))}
      disabled={value >= max}
      className="h-11 rounded-xl bg-slate-700 text-xl font-bold disabled:opacity-35 active:scale-95"
    >
      ＋
    </button>
  </div>
);

type Props = {
  onNavigate: (s: ScreenType) => void;
};

const TileButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc?: string;
  onClick: () => void;
}> = ({ icon, title, desc, onClick }) => (
  <button
    onClick={onClick}
    className="w-full rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 p-4 text-left shadow-lg active:scale-95 transition flex items-center gap-4"
  >
    <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 border border-white/10 shrink-0">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="font-semibold leading-tight">{title}</div>
      {desc && <div className="text-xs opacity-80 mt-0.5 truncate">{desc}</div>}
    </div>
  </button>
);

export default function OperationSettings({ onNavigate }: Props) {
  const [showManual, setShowManual] = useState(false);
  const [timingSettings, setTimingSettings] =
    useState<AnnouncementTimingSettings>(DEFAULT_ANNOUNCEMENT_TIMING_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved =
        (await localForage.getItem<Partial<AnnouncementTimingSettings>>(
          "announcementTimingSettings"
        )) || {};
      setTimingSettings({
        ...DEFAULT_ANNOUNCEMENT_TIMING_SETTINGS,
        ...saved,
      });
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    void localForage.setItem("announcementTimingSettings", timingSettings);
    window.dispatchEvent(
      new CustomEvent("easyannounce:timing-settings-changed", {
        detail: timingSettings,
      })
    );
  }, [timingSettings, settingsLoaded]);

  const updateTimingSettings = (
    patch: Partial<AnnouncementTimingSettings>
  ) => {
    setTimingSettings((prev) => ({ ...prev, ...patch }));
  };

  const leagueMode = getLeagueMode();
  const manualFile = leagueMode === "boys" ? "Boysmanual.pdf" : "manual.pdf";
  const manualTitle =
    leagueMode === "boys"
      ? "ボーイズリーグ 連盟アナウンスマニュアル"
      : "ポニーリーグ 連盟アナウンスマニュアル";

  return (
    <div
      className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-4 sm:px-6"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <header className="w-full max-w-2xl">
        <div className="mt-3 text-center select-none">
          <h1
            className="
              inline-flex items-center gap-2
              text-3xl md:text-4xl font-extrabold tracking-wide leading-tight
            "
          >
            <span className="text-2xl md:text-3xl">⚙️</span>
            <span
              className="
                bg-clip-text text-transparent
                bg-gradient-to-r from-white via-blue-100 to-blue-400
                drop-shadow
              "
            >
              運用設定
            </span>
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-20 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
        </div>
      </header>

      <div className="flex-1 w-full max-w-2xl flex flex-col gap-4 py-5">
        <TileButton
          icon={<span className="text-2xl">⚾️</span>}
          title="規定投球数"
          desc="学年別・大会別の上限"
          onClick={() => onNavigate("pitchLimit")}
        />

        <TileButton
          icon={<span className="text-2xl">🔀</span>}
          title="タイブレークルール"
          desc="開始回・無死満塁など"
          onClick={() => onNavigate("tiebreakRule")}
        />

        <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💧</span>
            <div>
              <h2 className="font-bold">クーリングタイム</h2>
              <p className="text-xs opacity-75">指定した回の裏終了時に表示</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[{ label: "なし", value: false }, { label: "あり", value: true }].map((item) => (
              <label
                key={item.label}
                className={`h-11 rounded-xl border flex items-center justify-center gap-2 font-bold ${
                  timingSettings.coolingEnabled === item.value
                    ? "bg-sky-600 border-sky-400"
                    : "bg-white/5 border-white/15"
                }`}
              >
                <input
                  type="radio"
                  name="coolingEnabled"
                  checked={timingSettings.coolingEnabled === item.value}
                  onChange={() => updateTimingSettings({ coolingEnabled: item.value })}
                  className="accent-sky-500"
                />
                {item.label}
              </label>
            ))}
          </div>

          {timingSettings.coolingEnabled && (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm font-semibold mb-2">クーリング時間</div>
                <NumberStepper
                  value={timingSettings.coolingMinutes}
                  min={1}
                  max={30}
                  suffix="分"
                  onChange={(coolingMinutes) => updateTimingSettings({ coolingMinutes })}
                />
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">残りアナウンス</div>
                <select
                  value={timingSettings.coolingAnnouncementMinutes}
                  onChange={(e) =>
                    updateTimingSettings({
                      coolingAnnouncementMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full h-11 rounded-xl bg-slate-800 border border-white/15 px-3 text-white font-bold"
                >
                  <option value={0}>なし</option>
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((minutes) => (
                    <option key={minutes} value={minutes}>{minutes}分</option>
                  ))}
                </select>
                {timingSettings.coolingAnnouncementMinutes > 0 &&
                  timingSettings.coolingAnnouncementMinutes >= timingSettings.coolingMinutes && (
                    <p className="mt-2 text-xs text-amber-300">
                      残りアナウンスはクーリング時間より短く設定してください。
                    </p>
                  )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-sm font-semibold mb-2">1回目</span>
                  <select
                    value={timingSettings.coolingFirstInning}
                    onChange={(e) =>
                      updateTimingSettings({ coolingFirstInning: Number(e.target.value) })
                    }
                    className="w-full h-11 rounded-xl bg-slate-800 border border-white/15 px-3 text-white"
                  >
                    {Array.from({ length: 9 }, (_, i) => i + 1).map((inningNo) => (
                      <option key={inningNo} value={inningNo}>{inningNo}回裏</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-sm font-semibold mb-2">2回目</span>
                  <select
                    value={timingSettings.coolingSecondInning ?? "none"}
                    onChange={(e) =>
                      updateTimingSettings({
                        coolingSecondInning:
                          e.target.value === "none" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full h-11 rounded-xl bg-slate-800 border border-white/15 px-3 text-white"
                  >
                    <option value="none">なし</option>
                    {Array.from({ length: 9 }, (_, i) => i + 1).map((inningNo) => (
                      <option key={inningNo} value={inningNo}>{inningNo}回裏</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧹</span>
            <div>
              <h2 className="font-bold">グラウンド整備</h2>
              <p className="text-xs opacity-75">指定した回の裏終了時に表示  ※ ポニーリーグは4回裏</p>
            </div>
          </div>
          <select
            value={timingSettings.groundMaintenanceInning ?? "none"}
            onChange={(e) =>
              updateTimingSettings({
                groundMaintenanceInning:
                  e.target.value === "none" ? null : Number(e.target.value),
              })
            }
            className="mt-4 w-full h-12 rounded-xl bg-slate-800 border border-white/15 px-3 text-white font-bold"
          >
            <option value="none">なし</option>
            {Array.from({ length: 9 }, (_, i) => i + 1).map((inningNo) => (
              <option key={inningNo} value={inningNo}>{inningNo}回裏</option>
            ))}
          </select>
        </section>

        <TileButton
          icon={<span className="text-2xl">📘</span>}
          title="連盟アナウンスマニュアル"
          desc="PDFをアプリ内で表示"
          onClick={() => setShowManual(true)}
        />

        <TileButton
          icon={<span className="text-2xl">🔊</span>}
          title="読み上げ設定"
          desc="声 / 話速"
          onClick={() => onNavigate("tts-settings")}
        />

        <TileButton
          icon={<span className="text-2xl">🏆</span>}
          title="リーグ設定"
          desc="ポニーリーグ / ボーイズリーグ"
          onClick={() => onNavigate("league-settings")}
        />
        <TileButton
          icon={<span className="text-2xl">🎤</span>}
          title="アナウンスモード"
          desc="自チームのみ / 両チームを1人でアナウンス"
          onClick={() => onNavigate("announcement-mode")}
        />
        <TileButton
          icon={<span className="text-2xl">📔</span>}
          title="チュートリアル"
          desc="使い方"
          onClick={() => onNavigate("tutorial")}
        />

        <TileButton
          icon={<span className="text-2xl">❓</span>}
          title="Q＆A"
          desc="よくある質問"
          onClick={() => onNavigate("qa")}
        />

        <TileButton
          icon={<span className="text-2xl">✉️</span>}
          title="お問い合わせ"
          desc="不具合・要望はこちら"
          onClick={() => onNavigate("contact")}
        />

        <TileButton
          icon={<span className="text-2xl">ℹ️</span>}
          title="バージョン情報"
          desc="ビルド番号・更新履歴"
          onClick={() => onNavigate("versionInfo")}
        />
      </div>

      {showManual && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm">
          <div
            className="
              h-[100svh] w-full
              flex flex-col
              bg-slate-950
              sm:px-3 sm:py-3
            "
            style={{
              paddingTop: "max(8px, env(safe-area-inset-top))",
              paddingBottom: "max(8px, env(safe-area-inset-bottom))",
              paddingLeft: "max(8px, env(safe-area-inset-left))",
              paddingRight: "max(8px, env(safe-area-inset-right))",
            }}
          >
            <div
              className="
                flex-1 min-h-0 w-full
                bg-slate-900
                sm:rounded-3xl
                sm:border sm:border-white/10
                sm:shadow-2xl
                overflow-hidden
                flex flex-col
              "
            >
              {/* ヘッダー */}
              <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-white/10 bg-slate-900/95">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-bold leading-tight">
                      {manualTitle}
                    </div>
                    <div className="text-xs sm:text-sm text-white/65 mt-1 break-all">
                      {manualFile}
                    </div>
                  </div>

                  <button
                    onClick={() => setShowManual(false)}
                    className="shrink-0 rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-3 py-2 text-sm font-semibold"
                    aria-label="閉じる"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* PDF表示エリア */}
              <div className="flex-1 min-h-0 bg-white">
                <iframe
                  title={manualTitle}
                  src={`/${manualFile}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                  className="w-full h-full"
                />
              </div>

              {/* フッター */}
              <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-white/10 bg-slate-900">
                <button
                  onClick={() => setShowManual(false)}
                  className="
                    w-full rounded-2xl
                    bg-blue-600 hover:bg-blue-500 active:scale-[0.98]
                    transition font-bold
                    py-3.5 text-base sm:text-lg
                    shadow-lg
                  "
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}