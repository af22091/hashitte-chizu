// 「本当に通らないと完成しない」判定のテスト: node tools/test_tracker.js
const R = require('../js/route.js');
const data = require('../data/prefectures.json');
function gauss() { return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random()); }
(async () => {
  const g = R.syntheticGraph(3300, 1);
  const p = data.prefs.find(q => q.short === '山梨');
  const route = (await R.generate({ graph: g, outline: p.outline, sizeM: 1500 }))[0];
  const line = R.samplePoly(route.pts, 1, true);                // 1m間隔の正しい走路
  console.log('route', (route.lengthM / 1000).toFixed(1) + 'km', 'points', line.length);

  // fixes: [x,y]の配列と1回あたりの時間(秒)を指定して流し込む
  function run(path, { stepM = 3, dt = 1, noise = 6, acc = 8, startAt = 0 } = {}) {
    const T = new R.CourseTracker(route.pts); let t = 1e6, done = null, rej = {};
    for (let i = startAt; i < path.length; i += stepM) {
      const [x, y] = path[i], r = T.add(x + gauss() * noise, y + gauss() * noise, t += dt * 1000, acc);
      if (!r.ok) rej[r.reason] = (rej[r.reason] || 0) + 1;
      if (r.done && done === null) done = i;
    }
    return { T, done, rej };
  }
  const show = (name, r, expectDone) => {
    const ok = (r.done !== null) === expectDone;
    console.log((ok ? 'OK  ' : 'FAIL'), name.padEnd(34), `完成=${r.done !== null}`, `進み=${Math.round(r.T.progress * 100)}%`, `最大途切れ=${r.T.maxGapNow()}点`, JSON.stringify(r.rej));
    if (!ok) process.exitCode = 1;
  };

  show('ふつうに一周(誤差±6m,1Hz)', run(line), true);
  show('GPS誤差が大きい(±12m)', run(line, { noise: 12 }), true);
  // 近道: 経路の20%〜40%区間を飛ばして直線で結ぶ
  const n = line.length, cut = line.slice(0, Math.floor(n * .2)).concat(line.slice(Math.floor(n * .4)));
  show('近道(全体の20%を飛ばす)', run(cut), false);
  show('逆回り', run(line.slice().reverse()), false);
  show('途中からスタート(40%地点から)', run(line, { startAt: Math.floor(n * .4) }), false);
  show('スタート地点に行かない(半周のみ)', run(line.slice(Math.floor(n * .5))), false);
  show('車で一周(時速60km=17m/s)', run(line, { stepM: 17, dt: 1 }), false);
  show('自転車並み(時速40km=11m/s)', run(line, { stepM: 11, dt: 1 }), false);
  show('自転車(時速30km=8.3m/sに近い9m/s)', run(line, { stepM: 9, dt: 1 }), false);
  show('速めのランニング(6m/s=時速21km)', run(line, { stepM: 6, dt: 1 }), true);
  show('走る速さ(5m/s=時速18km)', run(line, { stepM: 5, dt: 1 }), true);
  show('精度が悪い(60m)', run(line, { acc: 60 }), false);
  // 途中でGPSが数秒途切れる(30m飛ぶが歩く速さの範囲)
  const gap = line.slice(0, 3000).concat(line.slice(3030));
  show('GPSが約10秒途切れた(30m)', run(gap), true);
  // 最初の測位だけ3km離れた場所にずれていた(その後は正しい位置)
  {
    const T = new R.CourseTracker(route.pts); let t = 1e6, done = null;
    T.add(line[0][0] + 3000, line[0][1], t, 10);
    for (let i = 0; i < line.length; i += 3) { const r = T.add(line[i][0] + gauss() * 6, line[i][1] + gauss() * 6, t += 1000, 8); if (r.done && done === null) done = i; }
    const ok = done !== null; console.log(ok ? 'OK  ' : 'FAIL', '最初の測位が大きくずれていた'.padEnd(30), `完成=${ok}`, `進み=${Math.round(T.progress * 100)}%`); if (!ok) process.exitCode = 1;
  }
  // 半分だけ走って止める
  show('半周で終了', run(line.slice(0, Math.floor(n * .5))), false);
})();
