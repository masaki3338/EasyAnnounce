// src/lib/nosleep-lite.ts
// 極小の無音動画をloop再生して画面消灯を防ぐ簡易版（iOS/Android向けフォールバック）
export default class NoSleepLite {
  private video?: HTMLVideoElement;
  private enabled = false;

  enable() {
    if (this.enabled) return;
    this.enabled = true;

    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "true");
    v.muted = true;
    v.loop = true;
    v.style.position = "fixed";
    v.style.width = "1px";
    v.style.height = "1px";
    v.style.opacity = "0";
    v.style.pointerEvents = "none";
    v.style.zIndex = "-1";

    // 1px 無音ループ動画（超小容量の data URI）
    v.src =
      "data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAAAAG1wNDFtcDQyaXNvbTY4AAACAG1vb3YAAABsbXZoZAAAAAB8AAAAAHwAAAPAAACAAABAAAAAAEAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAB9tYWR0YQAAAAAAAQAAAABwZHRhAAAAAAABAAAAAABkYXRhAAAAAA==";

    document.body.appendChild(v);
    const p = v.play();
    if (p && typeof (p as any).catch === "function") {
      (p as any).catch(() => { /* ユーザー操作後に再実行すればOK */ });
    }
    this.video = v;
  }

  disable() {
    this.enabled = false;
    try {
      this.video?.pause();
      this.video?.remove();
    } catch {}
    this.video = undefined;
  }
}
