# Dotforge — ドット絵制作室

見下ろし型2Dゲーム向けの64×64ドット絵制作アプリ。共通の3D形状を正投影し、正面または8方向を同じ縮尺・材質・光源で描画します。64×64の画素バッファへ直接描きます。

## 機能

- プロジェクト単位のパレット、世界固定の光源、俯角、輪郭、落ち影設定
- 4種類の共通3Dサンプル、GLB取込み、Tripo v2を使う生成API
- 8方向の比較、方向別の再描画、鉛筆・消しゴム・塗りつぶし・スポイト・矩形の画素編集
- 候補と採用版の管理、採用版の上書き防止、保存時の競合検出
- 64×64 PNG、512×64の8方向シート、メタデータをZIP出力
- ChatGPTサインインと利用者別のD1/R2保存

サンプルはAI生成物ではありません。初期表示はデモです。デモの「変更を確定」は画面内だけの保持で、再読込すると初期状態へ戻ります。永続保存にはサインインしてプロジェクトへ素材を追加します。

## 起動と検証

Node.js 22.13以降を使用します。

```sh
npm ci
npm run dev
npm run check
npm test
```

起動時に表示されたローカルURLを開きます。ローカルでは `/signin-with-chatgpt?return_to=/` が開発用サインインです。公開先の認証はSites側が提供します。

初回のみ、ビルドで作成した設定を使ってローカルDBを初期化します。既に適用したSQLを再実行しないでください。

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_nice_rogue.sql
```

HTTP統合検証はローカルサーバー起動中・Tripoキー未設定の環境を対象にします。`TEST_ORIGIN` でURLを指定できます。検証専用のプロジェクトとアセットを作り、識別子を一時ファイルへ記録します。

```sh
TEST_ORIGIN=http://localhost:5174 npx tsx tests/integration.ts
```

Sites経由のビルド・配信はSitesスキルの手順に従います。実行プロファイルはportableです。`.sites-runtime/`、`.wrangler/`、秘密情報は追跡しません。

## AI生成の接続

サーバーの環境変数 `TRIPO_API_KEY` にキーを設定します。ブラウザへキーを渡しません。ローカルは `.dev.vars.example` を `.dev.vars` へコピーして設定し、サーバーを再起動します。Sitesでは実行環境のシークレットとして設定します。

Tripo v2の `P1-20260311` を使用します。画像ありの場合は画像を形状生成へ送り、文章と重要特徴は確認基準として保存します。最大3枚の参照をfront/left/back/rightへ対応づけ、複数画像では正面を必須にします。

送信前に外部送信・背面補完・見積creditsへの同意を求めます。有料タスクの自動再送は行いません。送信結果が不明な場合は再送を止め、提供元の履歴を確認する必要があります。監視の停止は提供元タスクの取消ではありません。

## 実装・検証の状況

- 見下ろし投影の回帰検証: 箱の上面が見え、底面が見えないことを確認。
- 全4サンプルの8方向で4096画素、固定パレット、透明余白を検証。
- PNGを展開し、CRC、寸法、個別PNGとシートの画素一致を検証。
- 認証、保存・復元、競合拒否、採用版保護、所属不変、生成前の入力検証をHTTPで検証。有料API送信は0件。
- 描画方式が古い版では部分再描画を停止し、全方向を新候補として更新。旧採用版は維持します。
- WebMCPは対応環境向けに検査・方向選択を登録。利用中の操作環境に呼出手段がなく、実行検証は未実施。

キー未設定のため、実際のTripo生成・課金・生成GLBの取得と表示は未検証です。20アセットの品質比較、原価・待ち時間の実測、画像参照の忠実度、データ保持・削除・復旧運用は提供前の検証事項です。共有3D形状は方向間の形状を揃えますが、入力に対する正しさや手修正後の一貫性を自動保証しません。

## 参照

- [Tripo P1テキスト生成](https://docs.tripo3d.ai/model-generation/text-to-model-p1-20260311.html)
- [Tripo P1画像生成](https://docs.tripo3d.ai/model-generation/image-to-model-p1-20260311.html)
- [Tripo P1複数画像生成](https://docs.tripo3d.ai/model-generation/multiview-to-model-p1-20260311.html)
- [Tripo料金](https://docs.tripo3d.ai/get-started/pricing.html)
- [PNG仕様](https://www.w3.org/TR/png-3/)

詳細な要件と受入基準は、プロジェクト直下の `specification.md` を参照してください。
