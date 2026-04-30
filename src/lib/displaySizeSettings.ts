// src/lib/displaySizeSettings.ts
// 端末の画面サイズに合わせて、アプリ全体の表示倍率を自動調整します。

const getWindowSize = () => {
  if (typeof window === "undefined") {
    return { width: 390, height: 844, shortSide: 390, longSide: 844 };
  }

  const width = window.innerWidth || 390;
  const height = window.innerHeight || 844;

  return {
    width,
    height,
    shortSide: Math.min(width, height),
    longSide: Math.max(width, height),
  };
};

export const getAutoDisplayScale = () => {
  const { shortSide, longSide } = getWindowSize();

  // CSS px 基準で判定します。
  // iPad mini: 768px 前後 / iPad Air: 820px 前後 / 大型Android: 800〜960px前後を想定。
  if (shortSide >= 1000) return 1.28;
  if (shortSide >= 900) return 1.24;
  if (shortSide >= 820) return 1.20;
  if (shortSide >= 768) return 1.16;
  if (shortSide >= 600) return 1.10;

  // スマホ横向きで横幅だけ大きい場合は、少しだけ拡大。
  if (longSide >= 900 && shortSide >= 430) return 1.06;

  return 1;
};

export const getAutoDeviceSizeName = () => {
  const { shortSide } = getWindowSize();

  if (shortSide >= 900) return "large-tablet";
  if (shortSide >= 600) return "tablet";
  return "phone";
};

export const applyAutoDisplaySizeMode = () => {
  if (typeof document === "undefined") return;

  const scale = getAutoDisplayScale();
  const deviceSize = getAutoDeviceSizeName();

  document.documentElement.style.setProperty("--app-scale", String(scale));
  document.documentElement.dataset.displaySizeMode = "auto";
  document.documentElement.dataset.deviceSize = deviceSize;
};

export const setupAutoDisplaySizeMode = () => {
  if (typeof window === "undefined") return () => {};

  applyAutoDisplaySizeMode();

  let timer: number | undefined;

  const handleResize = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      applyAutoDisplaySizeMode();
    }, 120);
  };

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
  };
};

// 以前の「手動設定版」を一部の画面が import していても落ちないように残します。
export type AppDisplaySizeMode = "normal" | "large" | "xlarge";

export const getDisplaySizeMode = (): AppDisplaySizeMode => "normal";
export const setDisplaySizeMode = () => {
  applyAutoDisplaySizeMode();
};
export const getDisplaySizeLabel = () => "自動";
export const applyDisplaySizeMode = () => {
  applyAutoDisplaySizeMode();
};
