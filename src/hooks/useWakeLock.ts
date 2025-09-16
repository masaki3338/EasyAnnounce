// src/hooks/useWakeLock.ts
import { useEffect, useRef } from "react";

/**
 * 前面表示中は Wake Lock を維持。裏に回ったら解放。
 * 取得失敗・予期せぬ解放時は window に CustomEvent を投げる：
 *  - "wakelock:acquired"
 *  - "wakelock:released"
 *  - "wakelock:error"
 */
export function useWakeLock() {
  const ref = useRef<any | null>(null);

  useEffect(() => {
    const supported = !!(navigator as any).wakeLock?.request;
    if (!supported) {
      // 非対応（古いブラウザ等）→ フォールバック表示のトリガ
      window.dispatchEvent(new CustomEvent("wakelock:error", { detail: "unsupported" }));
      return;
    }

    let releasing = false;

    const acquire = async () => {
      try {
        if (ref.current || document.visibilityState !== "visible") return;
        ref.current = await (navigator as any).wakeLock.request("screen");

        // 予期せぬ release を検出（端末回転/省電力 等）
        ref.current.addEventListener?.("release", () => {
          ref.current = null;
          window.dispatchEvent(new CustomEvent("wakelock:released"));
          // 可視なら再取得を試みる（省電力で拒否される場合がある）
          if (document.visibilityState === "visible" && !releasing) {
            acquire().catch(() => {
              window.dispatchEvent(new CustomEvent("wakelock:error", { detail: "reacquire-failed" }));
            });
          }
        });

        window.dispatchEvent(new CustomEvent("wakelock:acquired"));
      } catch (e) {
        ref.current = null;
        // 省電力モード等で拒否されるケース → フォールバック表示のトリガ
        window.dispatchEvent(new CustomEvent("wakelock:error", { detail: (e as any)?.name || "request-failed" }));
      }
    };

    const release = async () => {
      try {
        releasing = true;
        await ref.current?.release?.();
      } catch {}
      releasing = false;
      ref.current = null;
      window.dispatchEvent(new CustomEvent("wakelock:released"));
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
      else release();
    };

    const onFocus = () => acquire();
    const onBlur = () => release();
    const onPageShow = () => acquire();
    const onPageHide = () => release();
    const onOrientation = () => {
      // 回転で切れる端末がある → 可視なら再取得
      if (document.visibilityState === "visible") acquire();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("orientationchange", onOrientation);

    if (document.visibilityState === "visible") acquire();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("orientationchange", onOrientation);
      release();
    };
  }, []);
}
