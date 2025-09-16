// src/hooks/useNoSleepFallback.ts
import { useEffect, useRef } from "react";
import NoSleep from "nosleep.js";

/** iOS等でWake Lockが効かない時の代替。手動enable()をユーザー操作後に呼ぶ想定。 */
export function useNoSleepFallback() {
  const noSleepRef = useRef<NoSleep | null>(null);

  useEffect(() => {
    noSleepRef.current = new NoSleep();
    return () => {
      try {
        noSleepRef.current?.disable();
      } catch {}
      noSleepRef.current = null;
    };
  }, []);

  const enable = () => {
    try {
      noSleepRef.current?.enable(); // ユーザーのタップ直後などで呼ぶ
    } catch {}
  };

  const disable = () => {
    try {
      noSleepRef.current?.disable();
    } catch {}
  };

  return { enable, disable };
}
