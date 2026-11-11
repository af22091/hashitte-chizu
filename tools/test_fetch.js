// fetchRoads の動作確認(ローカルの疑似サーバー): 遅いサーバー→HTTPエラー→正常 の順にフォールバックするか
const http = require('http'), R = require('../js/route.js');
const mk = (port, h) => new Promise(r => { const s = http.createServer(h).listen(port, () => r(s)); });
(async () => {
  const s1 = await mk(9101, (q, r) => { /* 応答しない */ });
  const s2 = await mk(9102, (q, r) => { r.statusCode = 429; r.end('busy'); });
  const s3 = await mk(9103, (q, r) => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ elements: [{ type: 'node', id: 1, lat: 1, lon: 1 }] })); });
  const ep = [9101, 9102, 9103].map(p => `http://127.0.0.1:${p}/api`);
  const msgs = [];
  const j = await R.fetchRoads(35, 139, 1000, { endpoints: ep, timeoutMs: 600, onStatus: t => msgs.push(t) });
  console.log('fallback OK, elements:', j.elements.length, '| status:', msgs.length, '回');
  try { await R.fetchRoads(35, 139, 1000, { endpoints: ep.slice(0, 2), timeoutMs: 600 }); } catch (e) { console.log('全滅時のメッセージ:', e.message); }
  [s1, s2, s3].forEach(s => s.close()); process.exit(0);
})();
