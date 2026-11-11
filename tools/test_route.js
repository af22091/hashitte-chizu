// Nodeでのルート生成テスト: node tools/test_route.js [県名...]
const fs = require('fs'), path = require('path');
const R = require('../js/route.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/prefectures.json'), 'utf8'));
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['山梨', '栃木', '香川', '愛知', '長崎', '北海道'];
const sizeM = 1500;
(async () => {
  const g = R.syntheticGraph(sizeM * 1.2 + 1500, 1);
  console.log('graph nodes', g.xs.length, 'edges', g.edges.length);
  for (const nm of names) {
    const p = data.prefs.find(q => q.short === nm);
    const t0 = Date.now();
    const rs = await R.generate({ graph: g, outline: p.outline, sizeM });
    console.log(nm.padEnd(4), rs.map(r => `IoU ${r.iou.toFixed(2)} ${(r.lengthM / 1000).toFixed(1)}km dev95 ${r.dev95.toFixed(0)}m`).join(' | '), `(${Date.now() - t0}ms)`);
  }
})();
