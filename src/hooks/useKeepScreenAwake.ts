import { useEffect, useRef } from "react";

/**
 * Android → Wake Lock API
 * iOS → 無音1px動画フォールバック
 */
export function useKeepScreenAwake() {
  const wakeRef = useRef<any | null>(null);
  const vidRef = useRef<HTMLVideoElement | null>(null);

  const enableWakeLock = async () => {
    try {
      const wl = (navigator as any).wakeLock;
      if (wl?.request && document.visibilityState === "visible") {
        wakeRef.current = await wl.request("screen");
        return true;
      }
    } catch {}
    return false;
  };

  const disableWakeLock = async () => {
    try { await wakeRef.current?.release?.(); } catch {}
    wakeRef.current = null;
  };

  const enableFallback = () => {
    if (vidRef.current) return;
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "true");
    v.muted = true;
    v.loop = true;
    Object.assign(v.style, {
      position: "fixed", width: "1px", height: "1px", opacity: "0",
      pointerEvents: "none", zIndex: "-1",
    });
    v.src = "data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAAAAG1wNDFtcDQyaXNvbTY4AAACAG1vb3YAAABsbXZoZAAAAAB8AAAAAHwAAAPAAACAAABAAAAAAEAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAB9tYWR0YQAAAAAAAQAAAABwZHRhAAAAAAABAAAAAABkYXRhAAAAAA==";
    document.body.appendChild(v);
    v.play()?.catch(() => {});
    vidRef.current = v;
  };

  const disableFallback = () => {
    try { vidRef.current?.pause(); vidRef.current?.remove(); } catch {}
    vidRef.current = null;
  };

  (window as any).enableScreenAwakeFallback = enableFallback;

  useEffect(() => {
    enableWakeLock();

    const onVis = () => {
      if (document.visibilityState === "visible") {
        enableWakeLock();
      } else {
        disableWakeLock();
        disableFallback();
      }
    };
    const onBlur = () => { disableWakeLock(); disableFallback(); };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      disableWakeLock();
      disableFallback();
    };
  }, []);
}
