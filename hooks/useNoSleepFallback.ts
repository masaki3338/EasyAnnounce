// src/hooks/useNoSleepFallback.ts
import { useEffect, useRef, useCallback } from "react";
import NoSleep from "../lib/nosleep-lite";

/**
 * Wake Lock が不安定・非対応な環境向けのフォールバック。
 * - enable(): ユーザー操作直後に呼ぶ（自動再生制限対策）
 * - disable(): タブ非表示/blur/回転時に自動停止用
 * - bindAutoRelease(): 上記の自動停止ハンドラを登録
 */
export function useNoSleepFallback() {
  const noSleepRef = useRef<NoSleep | null>(null);

  useEffect(() => {
    noSleepRef.current = new NoSleep();
    return () => {
      try { noSleepRef.current?.disable(); } catch {}
      noSleepRef.current = null;
    };
  }, []);

  const enable = useCallback(() => {
    try { noSleepRef.current?.enable(); } catch {}
  }, []);

  const disable = useCallback(() => {
    try { noSleepRef.current?.disable(); } catch {}
  }, []);

  const bindAutoRelease = useCallback(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") disable();
    };
    const onBlur = () => disable();
    const onOrient = () => disable();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("orientationchange", onOrient);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, [disable]);

  return { enable, disable, bindAutoRelease };
}
