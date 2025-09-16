// src/hooks/useWakeLock.ts
import { useEffect, useRef } from "react";

/** 画面スリープを抑止（前面のみ）。裏に回ったら自動解除。 */
export function useWakeLock() {
  const wakeLockRef = useRef<any | null>(null);
  const supported = typeof (navigator as any).wakeLock?.request === "function";

  useEffect(() => {
    if (!supported) return;

    const request = async () => {
      try {
        // すでに取得済みなら何もしない
        if (wakeLockRef.current) return;
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        // 一部環境では勝手にreleaseされることがあるので監視
        wakeLockRef.current.addEventListener?.("release", () => {
          wakeLockRef.current = null;
        });
        // console.log("Wake Lock: ON");
      } catch (e) {
        // ユーザー操作なし直後・省電力モード等で失敗することあり
        // console.warn("Wake Lock request failed", e);
      }
    };

    const release = async () => {
      try {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release?.();
          wakeLockRef.current = null;
          // console.log("Wake Lock: OFF");
        }
      } catch {
        wakeLockRef.current = null;
      }
    };

    // タブが見えている間だけON
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        request();
      } else {
        release();
      }
    };

    // 端末回転や画面復帰で解除されることがある → 可視になった時に再取得
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", request);
    window.addEventListener("blur", release);
    window.addEventListener("orientationchange", () => {
      // 回転で切れる実装があるため、次に可視になったタイミングで再取得
      if (document.visibilityState === "visible") request();
    });

    // 初期：見えていれば取得
    if (document.visibilityState === "visible") request();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", request);
      window.removeEventListener("blur", release);
      window.removeEventListener("orientationchange", () => {});
      release();
    };
  }, [supported]);
}
