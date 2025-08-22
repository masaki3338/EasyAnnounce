import React from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom"; 
// 
export default function VersionInfo({
  version,
  onBack,
  onOpenContact,              // ★ 追加
}: {
  version: string;
  onBack: () => void;
  onOpenContact: () => void;  // ★ 追加
}) {
  const start = 2025;
  const y = new Date().getFullYear();
  const year = start === y ? `${y}` : `${start}–${y}`;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-10 px-6">
      <div className="w-full max-w-2xl">
        <button className="mb-6 px-4 py-2 bg-gray-200 rounded" onClick={onBack}>
          ← 運用設定に戻る
        </button>

        <h2 className="text-2xl font-bold text-center mb-10">バージョン情報</h2>

        <div className="text-center text-lg">
          <p className="mb-4">Version {version}</p>
          <p className="underline">更新履歴</p>
          {/* ▼ ここを追加 */}
          <ul className="mt-4 text-left text-base leading-7 inline-block">
            <li>2025.08.01　Vesion 1.00 新規作成</li>
          </ul>
          {/* ▲ ここまで追加 */}
        </div>

        {/* ここから：バージョン情報の下に法的情報を記載 */}
        <hr className="my-8" />

        <section className="text-sm leading-7 text-gray-800">
          <h3 className="text-lg font-semibold mb-3">法的情報 / Legal</h3>

          {/* アプリ情報 */}
          <div className="mb-4">
            <p><span className="font-medium">アプリ名：</span>Easyアナウンス</p>
          </div>

          {/* 著作権 */}
          <div className="mb-6">
            <h4 className="font-semibold mb-1">著作権</h4>
            <p>© {year} MASAKI OKUMURA. All rights reserved.</p>
            <p className="mt-2">
              本アプリおよび付随するコンテンツは著作権法等により保護されています。無断複製・転載・再配布を禁じます。
            </p>
          </div>

          {/* 第三者サービス（Google TTS） */}
          <div className="mb-6 border rounded-lg p-4 bg-gray-50">
            <h4 className="font-semibold mb-1">第三者サービス</h4>
            <p className="font-medium">Google Cloud Text-to-Speech API</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>本アプリは音声合成に Google Cloud Text-to-Speech API を使用しています。</li>
              <li>当該APIの利用は、Google の提供する規約・ポリシー・ブランドガイドラインに従います。</li>
              <li>生成音声の取扱いはプライバシーポリシー／利用規約をご参照ください。</li>
            </ul>
          </div>

          {/* 商標 */}
          <div className="mb-6">
            <h4 className="font-semibold mb-1">商標</h4>
            <p>
              Google、Google Cloud は Google LLC の商標です。その他記載の会社名・製品名は各社の商標または登録商標です。
              本アプリは Google により後援・承認・提携されたものではありません。
            </p>
          </div>

         
        </section>
        {/* ここまで：法的情報 */}
      </div>
    </div>
  );
}
