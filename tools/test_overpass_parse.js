// Overpass形式のJSONを読み込めるかの確認(通信なし): 擬似データで道路網を作って生成まで通す
const R = require('../js/route.js');
const lat0 = 35.66, lon0 = 139.80, els = [], mLat = 110540, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
let id = 1; const grid = {};
for (let i = -30; i <= 30; i++) for (let j = -30; j <= 30; j++) { grid[i + ',' + j] = id; els.push({ type: 'node', id: id++, lat: lat0 + j * 80 / mLat, lon: lon0 + i * 80 / mLon }); }
for (let j = -30; j <= 30; j++) els.push({ type: 'way', id: id++, nodes: Array.from({ length: 61 }, (_, k) => grid[(k - 30) + ',' + j]), });
for (let i = -30; i <= 30; i++) els.push({ type: 'way', id: id++, nodes: Array.from({ length: 61 }, (_, k) => grid[i + ',' + (k - 30)]), });
const g = R.buildGraphFromOverpass({ elements: els }, lat0, lon0);
console.log('graph', g.xs.length, 'nodes', g.edges.length, 'edges');
console.log('query head:', R.overpassQuery(lat0, lon0, 2000).slice(0, 120) + '…');
const d = require('../data/prefectures.json').prefs.find(p => p.short === '山梨');
R.generate({ graph: g, outline: d.outline, sizeM: 1500 }).then(rs => console.log('OK', rs.map(r => r.iou.toFixed(2) + '/' + (r.lengthM / 1000).toFixed(1) + 'km').join(' ')));
