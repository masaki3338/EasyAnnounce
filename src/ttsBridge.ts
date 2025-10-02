// ttsBridge.ts — VOICEVOX直叩き + キャッシュ + プログレッシブ再生 + WebSpeechフォールバック
import localForage from "localforage";

// =========== ユーティリティ ===========
function splitSentencesJa(text: string): string[] {
  return String(text).split(/(?<=[。、！？\n])\s*/g).map(s => s.trim()).filter(Boolean);
}
function hashKey(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}
async function getCachedBlob(key: string): Promise<Blob | null> {
  try { return (await localForage.getItem<Blob>(`tts:cache:${key}`)) || null; } catch { return null; }
}
async function setCachedBlob(key: string, blob: Blob) {
  const idxKey = "tts:cache:index";
  const prev = (await localForage.getItem<string[]>(idxKey)) || [];
  await localForage.setItem(`tts:cache:${key}`, blob);
  const next = [key, ...prev.filter(k => k !== key)].slice(0, 12);
  await localForage.setItem(idxKey, next);
  for (const drop of prev.slice(12)) await localForage.removeItem(`tts:cache:${drop}`).catch(()=>{});
}

type SynthOpts = { baseUrl: string; speaker: number; speedScale: number; cache: boolean };

// 1チャンク合成（既存の voicevoxFetchBlobCached を使う）
const synthChunk = (t: string, o: SynthOpts) =>
  voicevoxFetchBlobCached(t, { baseUrl: o.baseUrl, speaker: o.speaker, speedScale: o.speedScale }, o.cache);

// <audio> を作って再生（終わったらURL解放）
async function playBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const a = new Audio(url);
    currentAudio = a;
    await a.play();
    // 再生完了待ち
    await new Promise<void>(resolve => (a.onended = () => resolve()));
    if (currentAudio === a) currentAudio = null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// =========== 設定（localStorage） ===========
const getBaseUrl = () =>
  (localStorage.getItem("tts:voicevox:baseUrl") ||
   (window as any).__VOICEVOX_BASE__ ||
   "http://127.0.0.1:50021").replace(/\/+$/, "");

// 例: 3 (ずんだもん等)   
const getSpeaker = () => {
  const sp1 = Number(localStorage.getItem("tts:voicevox:speaker"));
  if (Number.isFinite(sp1)) return sp1;
  const sp2 = Number(localStorage.getItem("ttsDefaultSpeaker"));
  if (Number.isFinite(sp2)) return sp2;
  const gender = localStorage.getItem("ttsGender");
  if (gender === "male") return 13;
  if (gender === "female") return 30;
  return 3;
};

// 0.5〜2.0
const getSpeed = () => {
  const v = Number(localStorage.getItem("tts:speedScale"));
  return Number.isFinite(v) && v > 0 ? v : 1.0;
};

// =========== 再生制御 ===========
let currentAudio: HTMLAudioElement | null = null;

async function robustPlay(a: HTMLAudioElement) {
  const p = a.play();
  if (p && typeof p.then === "function") await p;
}
function stopAll() {
  try {
    if (currentAudio) {
      const src = currentAudio.src;
      currentAudio.pause();
      currentAudio.src = "";
      try { if (src?.startsWith("blob:")) URL.revokeObjectURL(src); } catch {}
    }
  } catch {}
  currentAudio = null;
  try { window.speechSynthesis?.cancel(); } catch {}
}

// =========== VOICEVOX 直叩き ===========
async function voicevoxFetchBlob(text: string, opts: { baseUrl: string; speaker: number; speedScale: number }): Promise<Blob> {
  const q = await fetch(`${opts.baseUrl}/audio_query?speaker=${opts.speaker}&text=${encodeURIComponent(text)}`, { method: "POST" });
  if (!q.ok) throw new Error(`audio_query failed: ${q.status} ${await q.text().catch(()=> "")}`);

  const query = await q.json();
  query.speedScale = opts.speedScale;

  const s = await fetch(`${opts.baseUrl}/synthesis?speaker=${opts.speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`synthesis failed: ${s.status} ${await s.text().catch(()=> "")}`);
  return await s.blob(); // WAV
}

async function voicevoxFetchBlobCached(
  text: string,
  opts: { baseUrl: string; speaker: number; speedScale: number },
  cache: boolean
): Promise<Blob> {
  if (!cache) return await voicevoxFetchBlob(text, opts);
  const key = hashKey(`${opts.baseUrl}|${opts.speaker}|${opts.speedScale}|${text}`);
  const hit = await getCachedBlob(key);
  if (hit) return hit;
  const blob = await voicevoxFetchBlob(text, opts);
  await setCachedBlob(key, blob);
  return blob;
}

// =========== 公開 API（lib/tts から呼ぶ） ===========
export async function bridgedSpeak(
  text: string,
  opts?: { progressive?: boolean; cache?: boolean }
) {
  stopAll(); // 既存: 再生競合を止める

  const baseUrl = getBaseUrl();
  const speaker = getSpeaker();
  const speedScale = getSpeed();
  const cache = opts?.cache ?? true;
  const progressive = opts?.progressive ?? true;

  // ========== 1) Progressive（ローリング先読み）: 失敗したら通常合成へ ==========
  if (progressive) {
    try {
      const parts = splitSentencesJa(text);
      if (parts.length > 0) {
        const optsSynth: SynthOpts = { baseUrl, speaker, speedScale, cache };

        // 粒度調整（既存ロジックを踏襲）
        const merged: string[] = [];
        for (const seg of parts) {
          const last = merged[merged.length - 1];
          if (last && (last.length < 40 || seg.length < 12)) {
            merged[merged.length - 1] = last + seg;
          } else {
            merged.push(seg);
          }
        }

        const PREFETCH = 2;
        const queue: Array<Promise<Blob>> = [];
        let idx = 0;

        // 初期先読み
        while (idx < merged.length && queue.length < PREFETCH) {
          queue.push(synthChunk(merged[idx++], optsSynth)); // ← VOICEVOX 合成(分割)
        }

        // 最初のチャンクを即再生
        const firstBlobPromise = queue.shift();
        if (!firstBlobPromise) throw new Error("progressive: empty queue");
        const firstBlob = await firstBlobPromise;          // ここで失敗したら catch
        await playBlob(firstBlob);                         // ここで失敗したら catch

        // 残りを再生しながら随時先読み
        while (queue.length || idx < merged.length) {
          while (idx < merged.length && queue.length < PREFETCH) {
            queue.push(synthChunk(merged[idx++], optsSynth)); // 先読み
          }
          const nextBlobPromise = queue.shift();
          if (!nextBlobPromise) break;
          const nextBlob = await nextBlobPromise;            // ここで失敗したら catch
          await playBlob(nextBlob);                          // ここで失敗したら catch
        }
        return; // progressive 成功で終了
      }
    } catch (e) {
      // Progressive 合成/再生が失敗 → 通常（一括合成）へフォールバック
      // console.warn("[TTS] progressive failed, fallback to single-shot:", e);
    }
  }

  // ========== 2) 通常（一括合成）: 失敗したら Web Speech へ ==========
  try {
    const wav = await voicevoxFetchBlobCached(text, { baseUrl, speaker, speedScale }, cache); // ← VOICEVOX
    const url = URL.createObjectURL(wav);
    const a = new Audio(url);
    a.onended = () => { try { URL.revokeObjectURL(url); } catch {} if (currentAudio === a) currentAudio = null; };
    currentAudio = a;
    await robustPlay(a); // ここで失敗したら下の catch
    return;
  } catch {
    // ここに来たら VOICEVOX ルートは失敗
  }

  // ========== 3) Web Speech フォールバック（VOICEVOX が失敗した時だけ実行） ==========
  // 既存の仕様に合わせて最小限：rate に speedScale をそのまま反映
  try {
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = "ja-JP";
    uttr.rate = Math.max(0.1, Math.min(10, Number(speedScale) || 1));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(uttr);
  } catch {
    // Web Speech が使えない環境では何もしない（既存仕様を維持）
  }
}


export function bridgedStop() {
  stopAll();
}

export async function voicevoxSynthesize(
  text: string,
  opts?: { baseUrl?: string; speaker?: number; speedScale?: number; cache?: boolean }
): Promise<Blob> {
  if (opts?.baseUrl) (window as any).__VOICEVOX_BASE__ = opts.baseUrl;
  if (typeof opts?.speaker === "number") localStorage.setItem("tts:voicevox:speaker", String(opts.speaker));
  if (typeof opts?.speedScale === "number") localStorage.setItem("tts:speedScale", String(opts.speedScale));

  const baseUrl = getBaseUrl();
  const speaker = typeof opts?.speaker === "number" ? opts.speaker : getSpeaker();
  const speedScale = typeof opts?.speedScale === "number" ? opts.speedScale : getSpeed();
  const cache = opts?.cache ?? false;

  return await voicevoxFetchBlobCached(text, { baseUrl, speaker, speedScale }, cache);
}

export async function prewarmTTS() {
  try {
    const baseUrl = getBaseUrl();
    const speaker = getSpeaker();
    await voicevoxFetchBlobCached("あ", { baseUrl, speaker, speedScale: 1.0 }, true);
  } catch {}
}
