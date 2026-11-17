// Nodeでのルート生成テスト: node tools/test_route.js [県名...]
const fs = require('fs'), path = require('path');
const R = require('../js/route.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/prefectures.json'), 'utf8'));
const ALL = process.argv[2] === '--all';
const names = ALL ? data.prefs.map(p => p.short) : process.argv.slice(2).length ? process.argv.slice(2) : ['山梨', '栃木', '香川', '愛知', '長崎', '北海道'];
const sizeM = 1500;
(async () => {
  const g = R.syntheticGraph(sizeM * 1.2 + 1500, 1);
  console.log('graph nodes', g.xs.length, 'edges', g.edges.length);
  for (const nm of names) {
    const p = data.prefs.find(q => q.short === nm);
    const t0 = Date.now();
    const rs = await R.generate({ graph: g, outline: p.outline, sizeM });
    if (ALL) { (global.__acc = global.__acc || []).push([rs[0].iou, rs[0].startDist, Date.now() - t0]); continue; }
    console.log(nm.padEnd(4), rs.map(r => `IoU ${r.iou.toFixed(2)} ${(r.lengthM / 1000).toFixed(1)}km dev95 ${r.dev95.toFixed(0)}m 現在地から${r.startDist.toFixed(0)}m`).join(' | '), `(${Date.now() - t0}ms)`);
  }
  if (ALL) { const a = global.__acc, m = i => a.reduce((x, r) => x + r[i], 0) / a.length; console.log('47県 平均IoU', m(0).toFixed(3), '現在地からの距離 平均', m(1).toFixed(0), 'm 最大', Math.max(...a.map(r => r[1])).toFixed(0), 'm 平均時間', m(2).toFixed(0), 'ms'); }
})();
