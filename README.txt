Facebook投稿ビューア（オフライン）

使い方
1) index.html をブラウザで開きます（ダブルクリック）。
2) FacebookエクスポートのZIPを選択します（複数可）。
3) 「解析開始」を押します。

配布用ZIP
- 同じフォルダにある fb-posts-viewer.zip から一式をダウンロードできます。

対応形式（現状のルール）
- ZIP内の your_facebook_activity/posts/ または
  this_profile's_activity_across_facebook/posts/ 配下の .json を対象。
- JSONが配列で、投稿らしいキー（data/title/attachments）があるものだけを採用。
- 配列要素に timestamp（unix秒）があるものを投稿として扱います。
- 本文は data[].post を連結し、空なら title を使います。

挙動の注意
- 完全オフライン。外部送信はありません。
- 投稿以外のJSONは安全にスキップし、レポートに集計されます。
- 投稿が見つからない場合は、Facebook側で「投稿」を含めて再エクスポートしてください。
- ZIP内に画像/動画が含まれる場合、詳細画面で表示します。

同梱ファイル
- index.html
- app.js
- vendor/fflate.min.js
