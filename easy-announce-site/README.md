# Easyアナウンス 紹介サイト（たたき台）

静的HTMLで作成しているため、ビルド作業なしでVercelに公開できます。

## Vercelへの公開方法

1. このフォルダをGitHubリポジトリへアップロード
2. Vercelで「Add New Project」
3. 対象リポジトリを選択
4. Framework Presetは「Other」
5. Build Commandは空欄
6. Output Directoryは空欄または `.`
7. Deploy

Vercel CLIを使う場合は、このフォルダで `vercel` を実行します。

## 公開前に変更する場所

- `index.html` の `YOUR_EMAIL@example.com` を実際の問い合わせ先へ変更
- プライバシーポリシー、利用規約のリンクを追加
- 実際のロゴやアプリ画面画像が用意できたら、CSSモックを画像へ差し替え
- 「会員登録なし」「端末内保存」「無料」などの説明が現在の仕様と一致するか確認

## 使用中のリンク

- Webアプリ: https://easy-announce-p.vercel.app/
- Google Play: https://play.google.com/store/apps/details?id=com.easyannounce.pony

- Instagram: https://www.instagram.com/easyannounce


## 今回の変更

- `Qa.tsx` のQ&A内容を紹介サイトのFAQへ反映
- スマートフォンで読みやすい折りたたみ表示に調整
- Android/iPhoneのインストール案内をQ&A内にも追加
