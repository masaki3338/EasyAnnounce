// Contact.tsx（UIのみ刷新・機能は完全据え置き）
import React, { useState } from "react";

type Props = {
  onBack: () => void;
  version?: string; // App.tsx から渡す
};

const ENDPOINT = "https://formspree.io/f/xjkongyv"; // ← あなたのFormspree URL（既存のまま）
const SUBJECT  = "Easyアナウンスお問い合わせ";

// ── 見た目用ミニアイコン（ロジック非依存） ──
const IconBack = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);
const IconMail = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
    <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
  </svg>
);
const IconSend = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
    <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
  </svg>
);

export default function Contact({ onBack, version = "0.0.1" }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const body = text.trim();
    if (!body) {
      alert("お問い合わせ内容をご入力ください。");
      return;
    }
    try {
      setSending(true);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          _subject: SUBJECT,
          subject: SUBJECT,
          message: body,
          version,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        alert("送信しました。ありがとうございました。");
        setText("");
      } else {
        alert(`送信に失敗しました：${json?.error ?? res.statusText}`);
      }
    } catch (e) {
      alert("送信時にエラーが発生しました。ネットワークをご確認ください。");
    } finally {
      setSending(false);
    }
  };

  const count = text.length;

  return (
    <div
      className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center px-6"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full">
        {/* ヘッダー：横幅めいっぱい（フルブリード） */}
        <div className="w-[100svw] -mx-6 md:mx-0 md:w-full flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-white/90 active:scale-95 px-3 py-2 rounded-lg bg-white/10 border border-white/10"
          >
            <IconBack />
            <span className="text-sm">運用設定に戻る</span>
          </button>
          <div className="w-10" />
        </div>

        {/* タイトル */}
        <div className="mt-1 text-center select-none mb-2 w-full">
          <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-wide leading-tight">
            <IconMail />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-400 drop-shadow">
              お問い合わせ
            </span>
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-24 rounded-full bg-gradient-to-r from-white/60 via-white/30 to-transparent" />
          <p className="text-white/70 text-sm mt-2">ご要望・不具合報告など、お気軽にお寄せください。</p>
        </div>

        {/* 本体カード：横幅めいっぱい（フルブリード） */}
        <section
          className="w-[100svw] -mx-6 md:mx-0 md:w-full rounded-none md:rounded-2xl p-4 md:p-6
                     bg-white/10 border border-white/10 ring-1 ring-inset ring-white/10 shadow space-y-4"
        >
          <label className="block">
            <div className="text-sm text-white/90 mb-2 font-semibold">
              お問い合わせ内容 <span className="text-rose-300">※必須</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="w-full rounded-2xl bg-white/90 text-gray-900 border border-white/70 shadow-sm
                         p-4 outline-none focus:ring-2 focus:ring-sky-400 placeholder-gray-600"
              placeholder="ご自由にご記入ください"
              required
            />
            <div className="mt-1 text-right text-xs text-white/60">{count} 文字</div>
          </label>

          <div className="text-center">
            <button
              className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-semibold shadow active:scale-95
                         ${sending ? "bg-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
              onClick={submit}
              disabled={sending}
            >
              <IconSend />
              {sending ? "送信中..." : "送信する"}
            </button>
            <div className="mt-3 text-sm text-white/70">
              Version: <span className="font-semibold">{version}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
