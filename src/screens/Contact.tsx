// Contact.tsx（置き換え）
import React, { useState } from "react";

type Props = {
  onBack: () => void;
  version?: string; // App.tsx から渡す
};

const ENDPOINT = "https://formspree.io/f/xjkongyv"; // ← あなたのFormspree URL
const SUBJECT  = "Easyアナウンスお問い合わせ";

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
      // Formspree は JSON で受け取れます（Accept: application/json が重要）
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          _subject: SUBJECT,     // 件名固定
          subject: SUBJECT,      // 念のため両方
          message: body,         // お問い合わせ本文
          version,               // アプリのバージョンも同送
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

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-10 px-6">
      <div className="w-full max-w-2xl">
        <button className="mb-6 px-4 py-2 bg-gray-200 rounded" onClick={onBack}>
          ← 運用設定に戻る
        </button>

        <h2 className="text-2xl font-bold text-center mb-2">お問い合わせ</h2>
        <p className="text-center text-gray-600 mb-6">お問い合わせ、ご要望、不具合報告など</p>

        <label className="block mb-2 font-semibold">
          お問い合わせ内容 <span className="text-red-500">※</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full border-2 border-green-500 rounded-2xl p-4 mb-6 outline-none"
          placeholder="ご自由にご記入ください"
          required
        />

        <div className="text-center">
          <button
            className={`px-6 py-2 rounded-lg ${sending ? "bg-gray-400" : "bg-gray-300"}`}
            onClick={submit}
            disabled={sending}
          >
            {sending ? "送信中..." : "送信する"}
          </button>
          <div className="mt-3 text-sm text-gray-500">
            Version: {version}
          </div>
        </div>
      </div>
    </div>
  );
}
