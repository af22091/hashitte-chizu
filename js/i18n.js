/* 言語切り替え(日本語 / English)。
   画面の文字は日本語で書いてあり、English のときだけ表示直前に英語へ置き換える。
   ・完全一致の辞書 → 数字や名前を含む文のパターン → 部分一致 の順に変換する。
   ・MutationObserver で、あとから追加された文字・属性(placeholder など)も自動で変換する。 */
(function (root) {
  'use strict';
  const KEY = 'hashitte-lang';
  let lang = null;
  try { lang = localStorage.getItem(KEY); } catch (e) { /* なし */ }
  if (lang !== 'ja' && lang !== 'en') lang = /^ja/i.test(navigator.language || 'ja') ? 'ja' : 'en';
  const JP = /[぀-ヿ一-鿿]/;

  const PREF = { '北海道': 'Hokkaido', '青森': 'Aomori', '岩手': 'Iwate', '宮城': 'Miyagi', '秋田': 'Akita', '山形': 'Yamagata', '福島': 'Fukushima', '茨城': 'Ibaraki', '栃木': 'Tochigi', '群馬': 'Gunma', '埼玉': 'Saitama', '千葉': 'Chiba', '東京': 'Tokyo', '神奈川': 'Kanagawa', '新潟': 'Niigata', '富山': 'Toyama', '石川': 'Ishikawa', '福井': 'Fukui', '山梨': 'Yamanashi', '長野': 'Nagano', '岐阜': 'Gifu', '静岡': 'Shizuoka', '愛知': 'Aichi', '三重': 'Mie', '滋賀': 'Shiga', '京都': 'Kyoto', '大阪': 'Osaka', '兵庫': 'Hyogo', '奈良': 'Nara', '和歌山': 'Wakayama', '鳥取': 'Tottori', '島根': 'Shimane', '岡山': 'Okayama', '広島': 'Hiroshima', '山口': 'Yamaguchi', '徳島': 'Tokushima', '香川': 'Kagawa', '愛媛': 'Ehime', '高知': 'Kochi', '福岡': 'Fukuoka', '佐賀': 'Saga', '長崎': 'Nagasaki', '熊本': 'Kumamoto', '大分': 'Oita', '宮崎': 'Miyazaki', '鹿児島': 'Kagoshima', '沖縄': 'Okinawa' };
  const NAMES = {};
  for (const k of Object.keys(PREF)) { NAMES[k] = PREF[k]; if (k !== '北海道') NAMES[k + (k === '東京' ? '都' : k === '京都' ? '府' : k === '大阪' ? '府' : '県')] = PREF[k]; }
  NAMES['京都府'] = 'Kyoto'; NAMES['大阪府'] = 'Osaka'; NAMES['東京都'] = 'Tokyo'; NAMES['京都'] = 'Kyoto';

  const EXACT = {
    // ---- 画面の見出し・ボタン ----
    'はしって地図あつめ': 'Run & Collect Maps', 'はしって日本地図': 'Run Japan', 'はしって世界地図': 'Run the World',
    'どの地図を走る？': 'Which map will you run?', '走った道が線になって、地図のピースが埋まっていきます。': 'Your run becomes a line, and the map pieces fill in.',
    '日本': 'Japan', '世界': 'World', '日本地図': 'Japan map', '世界地図': 'World map', '県': 'prefecture', '国': 'country',
    '設定': 'Settings', '記録一覧': 'Records', 'きろく': 'Records', '合計距離': 'Total distance', '走った回数': 'Runs', '連続日数': 'Day streak', '⚙ 設定': '⚙ Settings', '記録一覧（走った場所）': 'Records (where you ran)',
    '走りたい県をタップ。ピンチで拡大もできます': 'Tap a prefecture to run. Pinch to zoom.', '走りたい県をタップしてください': 'Tap a prefecture to run',
    '走りたい国をタップ。ピンチで拡大・検索もできます': 'Tap a country to run. Pinch to zoom or search.',
    '県の名前で探す': 'Search prefectures', '国の名前で探す(日本語・英語)': 'Search countries (Japanese / English)', '名前で探す': 'Search by name',
    '拡大': 'Zoom in', '縮小': 'Zoom out', '全体': 'Fit', '完成した数': 'Completed', '地図パズル': 'Map puzzle', 'モード選択へ': 'Back to modes',
    '音楽': 'Music', '音楽のオン・オフ': 'Music on/off', '音楽: オン': 'Music: on', '音楽: オフ': 'Music: off', 'とじる': 'Close', 'ミニゲーム': 'Mini game',
    '一周を再生': 'Play one lap', '3D地図': '3D map', '航空写真': 'Satellite', '地図': 'Map',
    '← コース画面にもどる': '← Back to course', '← 地図にもどる': '← Back to map', '← 条件を変える（大きさ・場所・道路）': '← Change options (size, place, roads)',
    'このコースで走る': 'Run this course', 'すべて消す': 'Erase all', 'のこり': 'Left', 'はやい': 'Fast', 'ふつう': 'Normal', 'ゆっくり': 'Slow', 'まっすぐ進む': 'Go straight',
    'やめる': 'Quit', 'コースを作っています': 'Creating your course', 'コースを作る': 'Create course', 'コースを見る': 'View course', 'シミュレーション走行（開発用）': 'Simulated run (dev)',
    'スタート': 'Start', 'デモ（疑似道路・ネット不要）': 'Demo (fake roads, no internet)', 'ナビ表示をとじる': 'Close navigation', '中': 'M', '大': 'L', '小': 'S',
    '大きさ': 'Size', '実際の道路（OpenStreetMap）': 'Real roads (OpenStreetMap)', '時間': 'Time', '検索': 'Search', '準備中…': 'Getting ready…', '記録を書き出す': 'Export records',
    '記録を読み込む': 'Import records', '距離': 'Distance', '進み具合': 'Progress', '道路データ': 'Road data', '🎯 ぴたっと': '🎯 Stop it', '🏃 ジャンプ': '🏃 Jump', '🐹 もぐら': '🐹 Whack',
    '📍 現在地をスタートにする': '📍 Start from my location', '🛰 3D・航空写真で見る': '🛰 View in 3D / satellite', '🧭 ナビ表示': '🧭 Navigation',
    '場所を検索（駅・住所・公園など）': 'Search a place or station', '地図をタップして、好きな場所を指定することもできます': 'You can also tap the map to choose a start point.',
    // ---- 確認・メッセージ ----
    '保存できませんでした（容量や設定を確認してください）': 'Could not save (check storage or settings)', '見つかりませんでした': 'Not found',
    'ホーム（日本・世界の選択）にもどりますか？': 'Go back to Home?', 'ここまでの記録は保存されません。': 'Your run so far will not be saved.', 'ホームにもどる': 'Back to Home', 'このまま走る': 'Keep running',
    'いま表示しているコースは消えます。': 'The course on screen will be cleared.', '（あとで「前回作ったコース」から呼び戻せます）': '(You can bring it back later from “Use last course”.)', 'コースの画面にとどまる': 'Stay on course screen',
    '📍 地名を取得中…': '📍 Looking up place…', '📍 地名: 未取得': '📍 Place: not fetched', '取得する': 'Fetch', '形の難しさ': 'Shape difficulty', '（デモの記録）': '(demo record)', '記録を見る': 'View record', 'もう一度走る': 'Run again',
    'もどる': 'Back', '作ったコースが消えます': 'Your course will be cleared', 'このまま進むと、いま表示しているコースは消えます。': 'If you continue, the course on screen will be cleared.', '消して進む': 'Clear and continue', 'コースを残す': 'Keep course',
    '検索中…': 'Searching…', '見つかりませんでした。別の言葉でお試しください。': 'No results. Try different words.', 'スタートを設定しました': 'Start point set', '検索できませんでした。通信を確認してもう一度お試しください。': 'Search failed. Check your connection and try again.',
    'この端末では現在地を取得できません': 'Location is not available on this device',
    '赤い線が、これから走る道です。紫の点線が目標の形。': 'The red line is the road you will run. The purple dotted line is the target shape.', '案は3つ作ります。再現度が高いものを選びましょう。': 'Three options are made. Pick the one with the best match.',
    '大きさを「小」にすると、短い距離で走れます。': 'Choosing size “S” makes a shorter run.', '道が少ない場所だと、形が崩れやすくなります。': 'Shapes get distorted where there are few roads.', '走り終えると、走った場所の地名も記録されます。': 'When you finish, the place name is saved too.',
    'ゆっくり歩いても完成します。ただしコースは順番どおりに。': 'Walking slowly works too. Follow the course in order.', 'スタート地点に着くと、自動で記録が始まります。': 'Recording starts automatically when you reach the start point.',
    '遊び方：画面をタップでジャンプ。障害物をよけて、できるだけ遠くまで走ろう。': 'How to play: tap to jump. Dodge the obstacles and run as far as you can.',
    '遊び方：左右に動くランナーを、タップで止めます。緑の旗の枠の中で止まれば得点（真ん中ほど高得点）。3回はずすとおしまい。': 'How to play: tap to stop the runner. Stop inside the green flag zone to score (more in the middle). Three misses and it’s over.',
    '遊び方：出てきたもぐらをタップ！ 早くたたくほど高得点。': 'How to play: tap the moles as they pop up! The faster, the more points.',
    'コース作成をやめますか？': 'Stop creating the course?', 'ここまでの作成は中止されます。': 'Progress so far will be cancelled.', '続ける': 'Continue', '作成中…': 'Creating…',
    'デモの道路網を作成中…': 'Building demo road network…', '道路データを取得中…（数秒〜数十秒かかることがあります）': 'Fetching road data… (may take several seconds)', '前回取得した道路データを使います': 'Using road data fetched last time', '道路網を作成中…': 'Building road network…',
    '🎉 コースができました！': '🎉 Your course is ready!', '3D表示を読み込めませんでした': 'Could not load 3D view', '3D地図を読み込み中…': 'Loading 3D map…', '標準の地図で表示します…': 'Showing the standard map…',
    '3D表示を開始できませんでした（この端末では未対応かもしれません）': 'Could not start 3D view (may not be supported on this device)', 'ナビ表示を読み込めませんでした': 'Could not load navigation view', '標準の地図に切り替えました': 'Switched to the standard map',
    'この端末ではナビ表示を開始できませんでした': 'Navigation view could not start on this device', 'もうすぐゴールです': 'Almost at the goal', 'まもなく': 'Soon',
    '📍のスタート地点に立って「スタート」を押し、赤い線に沿って一周してください。GPSで通ったことを確認して、ぜんぶ通ると完成します。': 'Stand at the 📍 start point, press “Start”, and follow the red line all the way around. GPS checks your path; finish it all to complete the piece.',
    '位置情報の精度が低いため、記録できていません。屋外の空が開けた場所で試してください。': 'GPS accuracy is too low to record. Try an open outdoor area.', '移動が速すぎるため記録できません（走る・歩く速さで進んでください）。': 'Moving too fast to record (please run or walk).',
    '進む向きが違うか、道をショートカットしています。赤い線の順番どおりに進んでください。': 'Wrong direction or a shortcut. Follow the red line in order.', '一時停止': 'Pause', '再開': 'Resume', 'シミュレーションが終点に着きました。': 'The simulation reached the end.',
    'この端末では位置情報を使えません。': 'Location is not available on this device.', '位置情報が許可されていません。ブラウザの設定で許可してください。': 'Location permission is off. Please allow it in your browser settings.',
    '走るのをやめて、コース画面にもどりますか？': 'Stop running and go back to the course screen?', 'やめてもどる': 'Quit and go back', '地名なし': 'No place name', '地名を取得できませんでした（あとで「取得する」を押してください）': 'Could not get the place name (press “Fetch” later)',
    '📍 取得中…': '📍 Fetching…', '📍 未取得': '📍 Not fetched', '🎉 完成しました！': '🎉 Completed!', 'この記録を消す': 'Delete this record', '記録を消しますか？': 'Delete this record?', '消す': 'Delete', '記録を消しました': 'Record deleted', '削除': 'Delete',
    'まだ記録がありません。': 'No records yet.', '形式が違います': 'Wrong file format', '記録を読み込みました': 'Records imported', 'すべての記録を消しますか？': 'Erase all records?', '走った記録と、前回作ったコースが消えます。元には戻せません。': 'Your records and last course will be erased. This cannot be undone.',
    '（先に「記録を書き出す」でバックアップできます）': '(You can back up first with “Export records”.)', '音声案内をオンにしました': 'Voice guidance is on',
    '北': 'N', '北東': 'NE', '東': 'E', '南東': 'SE', '南': 'S', '南西': 'SW', '西': 'W', '北西': 'NW', 'Uターン': 'U-turn',
    // ---- 設定 ----
    'プロフィール': 'Profile', 'ニックネーム': 'Nickname', 'ホームの見出しに表示されます（この端末の中だけに保存）': 'Shown on the Home screen (saved only on this device)', '例: しゅう': 'e.g. Sam',
    '表示': 'Display', '画面の色': 'Color theme', '自動': 'Auto', '朝': 'Morning', '昼': 'Day', '夕方': 'Evening', '夜': 'Night', '自動は、いる場所の日の出・日没に合わせて変わります': 'Auto follows sunrise and sunset where you are.',
    '距離の単位': 'Distance unit', 'キロメートル': 'Kilometers', 'マイル': 'Miles', '音': 'Sound', 'BGMの音量': 'Music volume', '効果音': 'Sound effects', 'コース完成・ゴールの音': 'Sounds for finishing a course or reaching the goal', 'ボタンの音': 'Button sounds', '押したときの、やわらかい「ぽん」という音': 'A soft “pop” when you tap a button',
    '走るとき': 'While running', '開いたら現在地にピンを立てる': 'Place the pin at my location on open', '位置情報の許可が必要です': 'Needs location permission', 'スタートで自分視点のナビ表示にする': 'Use navigation view when starting',
    '音声案内': 'Voice guidance', '曲がり角の手前で読み上げます': 'Reads out before turns', 'バイブレーション': 'Vibration', 'ゴールとコースから外れたときに振動': 'Vibrate at the goal and when you leave the course', '走っている間、画面を消さない': 'Keep screen on while running',
    '見た目': 'Appearance', 'アニメーション': 'Animations', '波紋・紙吹雪・切り替えの動き': 'Ripples, confetti and transitions', '言語': 'Language', '入力キーボード': 'Search keyboard', '端末のもの': 'Device', 'フリック': 'Flick', 'アプリ内のキーボードで検索欄に入力します': 'Type in search boxes with an in-app keyboard.', '空白': 'space', '記録のデータ': 'Record data', '走った記録': 'Runs recorded', '書き出す': 'Export', '読み込む': 'Import',
    'このアプリについて': 'About', '走った道をつないで、地図のピースを集めるアプリです。': 'An app where your runs connect into lines and collect map pieces.',
    '位置情報は、コース作りと走行の記録のためだけに使い、この端末の外へは保存しません（地図と道路データの取得のために、場所の周辺の範囲を地図サービスへ送ります）。記録はこの端末のブラウザの中だけに保存されます。': 'Location is used only to build courses and record runs, and is never stored off this device (the area around a place is sent to map services to fetch maps and roads). Records are saved only in this browser.',
    '地図データ © OpenStreetMap contributors ／ 航空写真 © Esri, Maxar, Earthstar Geographics ／ 地名 Nominatim ／ 3D地図 OpenFreeMap・MapLibre': 'Map data © OpenStreetMap contributors / Imagery © Esri, Maxar, Earthstar Geographics / Place names: Nominatim / 3D map: OpenFreeMap, MapLibre',
    '時間前': 'h ago', '分前': 'min ago',
    // ---- ミニゲーム(キャンバス) ----
    'タップでもう一度': 'Tap to play again', 'ぴったり！ +2': 'Perfect! +2', 'ナイス！ +1': 'Nice! +1', 'ざんねん…': 'Miss…', '画面をタップして、旗の枠の中で止めよう': 'Tap to stop inside the flag zone',
    // ---- 道路データ(route.js) ----
    'うまく取れないため、軽いデータで再挑戦中…': 'Retrying with lighter data…', '（混雑中）': '(busy)', '接続できません': 'cannot connect', '完了': 'Done',
    'この周辺の道路が少なすぎます。別の場所を選んでください。': 'There are too few roads here. Please choose another place.', 'ルートを作れませんでした。別の場所か大きさを試してください。': 'Could not make a route. Try another place or size.',
  };

  const RX = [
    [/^(.+?)さん、どの地図を走る？$/, (m, n) => `${n}, which map will you run?`],
    [/^(.+?) を走る$/, (m, n) => `Run ${nm(n)}`],
    [/^この(県|国)を走る$/, (m, u) => `Run this ${u === '県' ? 'prefecture' : 'country'}`],
    [/^← (.+)にもどる$/, (m, b) => `← Back to ${tr(b)}`],
    [/^(.+?)の画面にもどりますか？$/, (m, b) => `Go back to the ${tr(b)} screen?`],
    [/^(.+?)にもどる$/, (m, b) => `Back to ${tr(b)}`],
    [/^(.*)のコースを作っています$/, (m, n) => `Creating the ${nm(n)} course`.replace('the  course', 'your course')],
    [/^🕘 前回作ったコースを使う（(\d+)(分前|時間前)）$/, (m, n, u) => `🕘 Use last course (${n}${u === '分前' ? ' min' : ' h'} ago)`],
    [/^(.+?) の記録を消します。元に戻せません。$/, (m, n) => `${nm(n)} will be deleted. This cannot be undone.`],
    [/^(\d{4}\/\d+\/\d+) の記録$/, (m, d) => `Record from ${dt(d)}`],
    [/^完成 (\d{4}\/\d+\/\d+)$/, (m, d) => `Completed ${dt(d)}`],
    [/^距離 ([^　]+)$/, (m, v) => `Distance ${v}`], [/^時間 ([^　]+)$/, (m, v) => `Time ${v}`],
    [/^距離 (.+?)　時間 (.+?)　なぞれた割合 (\d+)%$/, (m, a, b, c) => `Distance ${a}   Time ${b}   Traced ${c}%`],
    [/^目安の距離: 小 約(.+?) ／ 中 約(.+?) ／ 大 約(.+)$/, (m, a, b, c) => `Estimated distance: S ~${a} / M ~${b} / L ~${c}`],
    [/^(.+?)四方・走る距離の目安 約(.+)$/, (m, a, b) => `${a} square · estimated run ~${b}`],
    [/^案(\d+)$/, (m, n) => `Option ${n}`],
    [/^案(\d+)\s*(.*)$/, (m, n, r) => `Option ${n} ${r}`],
    [/^再現度 (\d+)%（紫の点線が目標の形）・走る距離 約(.+?)(・デモ道路)?$/, (m, a, b, d) => `Match ${a}% (purple dotted line = target) · distance ~${b}${d ? ' · demo roads' : ''}`],
    [/^(\d+)件の記録$/, (m, n) => `${n} records`],
    [/^(\d+)回$/, (m, n) => `${n} run${n === '1' ? '' : 's'}`],
    [/^(\d+)日$/, (m, n) => `${n} day${n === '1' ? '' : 's'}`],
    [/^日本縦断 (.+)$/, (m, k) => `Cross Japan ${k}`],
    [/^地球一周 (.+)$/, (m, k) => `Around the Earth ${k}`],
    [/^(.+?) ・ (\d+)回$/, (m, k, n) => `${k} · ${n} run${n === '1' ? '' : 's'}`],
    [/^(\d+)件$/, (m, n) => `${n} records`],
    [/^(.+?) ・ (\d{4}\/\d+\/\d+) ・ (.+)$/, (m, h, d, k) => `${tr(h)} · ${dt(d)} · ${k}`],
    [/^(\d+)m先 (.+)$/, (m, d, t) => `In ${d} m: ${turn(t)}`],
    [/^まもなく (.+)$/, (m, t) => `Soon: ${turn(t)}`],
    [/^📍スタート地点まで、あと約(\d+)mです。着いたら自動で記録が始まります。$/, (m, d) => `📍 About ${d} m to the start point. Recording starts automatically when you arrive.`],
    [/^コースから約(\d+)m離れています。赤い線に戻ってください。$/, (m, d) => `You are about ${d} m off the course. Please return to the red line.`],
    [/^いい調子です！ あと約(.+)$/, (m, k) => `Looking good! About ${k} to go`],
    [/^位置情報エラー: (.*)$/, (m, e) => `Location error: ${e}`],
    [/^現在地を取得できませんでした: (.*)$/, (m, e) => `Could not get your location: ${e}`],
    [/^読み込めませんでした: (.*)$/, (m, e) => `Could not import: ${e}`],
    [/^はしって地図あつめ　バージョン (.+)$/, (m, v) => `Run & Collect Maps  v${v}`],
    [/^(.*)。大きさを「小」にするか、道路の少ない場所で試すか、少し待ってからもう一度お試しください。「デモ」ならネットなしで動きます。$/, (m, e) => `${tr(e)}. Try size “S”, a place with more roads, or wait a bit and retry. “Demo” works without internet.`],
    [/^道路データを取得中…（(.+)）$/, (m, h) => `Fetching road data… (${h})`],
    [/^(\d+)秒で時間切れ$/, (m, s) => `timed out after ${s}s`],
    [/^道路データを取得できませんでした（(.*)）$/, (m, e) => `Could not fetch road data (${tr(e)})`],
    [/^(\d+)\/(\d+) 案を計算中…$/, (m, a, b) => `Calculating option ${a}/${b}…`],
    [/^(\d+)m  ベスト (\d+)m$/, (m, a, b) => `${a} m   Best ${b} m`],
    [/^(\d+)m 走りました$/, (m, a) => `Ran ${a} m`],
    [/^(\d+)てん  ベスト (\d+)てん$/, (m, a, b) => `${a} pts   Best ${b} pts`],
    [/^(\d+)てん でした$/, (m, a) => `${a} points`],
    [/^(\d+)ひき   のこり ([\d.]+)秒   ベスト (\d+)$/, (m, a, t, b) => `${a} whacked   ${t}s left   Best ${b}`],
    [/^(\d+)ひき たたきました$/, (m, a) => `Whacked ${a} moles`],
    [/^データを読み込めませんでした。フォルダで (.*)$/, (m, r) => `Could not load data. ${r}`],
  ].filter(r => r[1]);

  const SUB = [['（', ' ('], ['）', ')'], ['。', '. '], ['、', ', '], ['・', ' · '], ['　', ' '], ['約', '~'], ['秒', 's'], ['分', ' min'], ['時間', ' h'], ['〜', '–']];

  function nm(n) { n = (n || '').trim(); return NAMES[n] || n; }
  function dt(s) { const [y, m, d] = s.split('/').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  function turn(t) {
    const m = { 'Uターン': 'Make a U-turn', '右折': 'Turn right', '左折': 'Turn left', '右へ': 'Bear right', '左へ': 'Bear left', '大きく右へ': 'Turn sharp right', '大きく左へ': 'Turn sharp left' };
    return m[t] || tr(t);
  }
  function tr(s) {
    if (lang !== 'en' || s == null) return s;
    s = String(s); if (!JP.test(s)) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], c = s.trim();
    if (!c) return s;
    let out = EXACT[c] || NAMES[c];
    if (!out) for (const [re, fn] of RX) { const m = c.match(re); if (m) { out = fn(...m); break; } }
    if (!out) { out = c; for (const [a, b] of SUB) out = out.split(a).join(b); }
    return lead + out + trail;
  }

  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const origText = new WeakMap(), origAttr = new WeakMap();          // 日本語にもどせるよう、変換前の文字を覚えておく
  function fixNode(n) {
    if (n.nodeType === 3) { const v = n.nodeValue; if (JP.test(v)) { const o = tr(v); if (o !== v) { origText.set(n, v); n.nodeValue = o; } } return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName; if (tag === 'SCRIPT' || tag === 'STYLE' || (n.hasAttribute && n.hasAttribute('data-notr'))) return;
    for (const a of ATTRS) { const v = n.getAttribute && n.getAttribute(a); if (v && JP.test(v)) { const m = origAttr.get(n) || {}; m[a] = v; origAttr.set(n, m); n.setAttribute(a, tr(v)); } }
    for (let c = n.firstChild; c; c = c.nextSibling) fixNode(c);
  }
  function restoreNode(n) {                                            // English → 日本語(変換していない文字はそのまま)
    if (n.nodeType === 3) { const o = origText.get(n); if (o != null) { n.nodeValue = o; origText.delete(n); } return; }
    if (n.nodeType !== 1) return;
    const m = origAttr.get(n); if (m) { for (const a of Object.keys(m)) n.setAttribute(a, m[a]); origAttr.delete(n); }
    for (let c = n.firstChild; c; c = c.nextSibling) restoreNode(c);
  }
  let observing = false;
  function ensureObserver() {
    if (observing) return; observing = true;
    new MutationObserver(recs => {
      if (lang !== 'en') return;
      for (const r of recs) {
        if (r.type === 'childList') r.addedNodes.forEach(fixNode);
        else if (r.type === 'characterData') fixNode(r.target);
        else if (r.type === 'attributes') { const v = r.target.getAttribute(r.attributeName); if (v && JP.test(v)) { const m = origAttr.get(r.target) || {}; m[r.attributeName] = v; origAttr.set(r.target, m); r.target.setAttribute(r.attributeName, tr(v)); } }
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function apply() {
    document.documentElement.lang = lang;
    if (lang === 'en') { ensureObserver(); fixNode(document.documentElement); } else restoreNode(document.documentElement);
  }
  if (lang === 'en') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply(); }

  root.I18N = {
    get lang() { return lang; },
    tr, nm,
    setLang(l) {                                                        // ページを読み込み直さずに切り替える(BGMが途切れない)
      if (l === lang) return; try { localStorage.setItem(KEY, l); } catch (e) { /* なし */ } lang = l; apply(); window.dispatchEvent(new Event('i18nchange'));
    },
    names(list) { for (const p of list) if (p.en) { NAMES[p.name] = p.en; NAMES[p.short] = p.en; } },
    speechLang() { return lang === 'en' ? 'en-US' : 'ja-JP'; },
  };
})(window);
