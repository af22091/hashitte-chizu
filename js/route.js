/* ルート生成エンジン
 * 県の形(正規化した輪郭)を、道路網に当てはめて「その形に見える周回ルート」を作る。
 * ブラウザでもNodeでも動く(依存なし)。座標はスタート地点を原点としたローカルメートル(x=東, y=北)。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RouteEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const M_PER_DEG_LAT = 110540;
  const M_PER_DEG_LON = 111320;

  /* ---------- 座標変換 ---------- */
  function toLocal(lat, lon, lat0, lon0) {
    return [(lon - lon0) * M_PER_DEG_LON * Math.cos(lat0 * Math.PI / 180), (lat - lat0) * M_PER_DEG_LAT];
  }
  function toLatLng(x, y, lat0, lon0) {
    return [lat0 + y / M_PER_DEG_LAT, lon0 + x / (M_PER_DEG_LON * Math.cos(lat0 * Math.PI / 180))];
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- 空間インデックス(近傍検索) ---------- */
  class PointGrid {
    constructor(xs, ys, cell) {
      this.xs = xs; this.ys = ys; this.cell = cell; this.map = new Map();
      for (let i = 0; i < xs.length; i++) {
        const k = this._key(Math.floor(xs[i] / cell), Math.floor(ys[i] / cell));
        const a = this.map.get(k);
        if (a) a.push(i); else this.map.set(k, [i]);
      }
    }
    _key(cx, cy) { return (cx + 100000) * 200003 + (cy + 100000); }
    nearest(x, y, maxRing = 80) {
      const c = this.cell, cx = Math.floor(x / c), cy = Math.floor(y / c);
      let best = -1, bd = Infinity;
      for (let r = 0; r <= maxRing; r++) {
        if (best >= 0 && (r - 1) * c > bd) break;
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const arr = this.map.get(this._key(cx + dx, cy + dy));
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) {
              const i = arr[k], d = Math.hypot(this.xs[i] - x, this.ys[i] - y);
              if (d < bd) { bd = d; best = i; }
            }
          }
        }
      }
      return { i: best, d: bd };
    }
  }

  /* ---------- 道路グラフ ---------- */
  class Graph {
    constructor() { this.xs = []; this.ys = []; this.adj = []; this.edges = []; }
    addNode(x, y) { this.xs.push(x); this.ys.push(y); this.adj.push([]); return this.xs.length - 1; }
    addEdge(a, b) {
      if (a === b) return;
      const len = Math.hypot(this.xs[a] - this.xs[b], this.ys[a] - this.ys[b]);
      if (len < 0.5) return;
      const e = this.edges.length;
      this.edges.push([a, b, len]);
      this.adj[a].push(e); this.adj[b].push(e);
    }
    other(e, u) { const ed = this.edges[e]; return ed[0] === u ? ed[1] : ed[0]; }
    /* 最大の連結成分だけ残し、検索用の索引を作る */
    finalize() {
      const n = this.xs.length, comp = new Int32Array(n).fill(-1);
      let best = -1, bestSize = 0, cid = 0;
      for (let s = 0; s < n; s++) {
        if (comp[s] >= 0) continue;
        const stack = [s]; comp[s] = cid; let size = 0;
        while (stack.length) {
          const u = stack.pop(); size++;
          for (const e of this.adj[u]) { const v = this.other(e, u); if (comp[v] < 0) { comp[v] = cid; stack.push(v); } }
        }
        if (size > bestSize) { bestSize = size; best = cid; }
        cid++;
      }
      const g = new Graph(), map = new Int32Array(n).fill(-1);
      for (let i = 0; i < n; i++) if (comp[i] === best) map[i] = g.addNode(this.xs[i], this.ys[i]);
      for (const [a, b] of this.edges) if (map[a] >= 0 && map[b] >= 0) g.addEdge(map[a], map[b]);
      g.mx = g.edges.map(e => (g.xs[e[0]] + g.xs[e[1]]) / 2);
      g.my = g.edges.map(e => (g.ys[e[0]] + g.ys[e[1]]) / 2);
      g.nodeGrid = new PointGrid(g.xs, g.ys, 80);
      g.coverGrid = new PointGrid(g.xs.concat(g.mx), g.ys.concat(g.my), 80);
      return g;
    }
  }

  /* 疑似道路網(碁盤目＋乱れ)。実際の道路が取れないときのデモ用 */
  function syntheticGraph(half, seed = 1) {
    const rnd = mulberry32(seed), spacing = 90, jitter = 14, drop = 0.10, diag = 0.04;
    const n = Math.floor(2 * half / spacing) + 1, th = 18 * Math.PI / 180, ca = Math.cos(th), sa = Math.sin(th);
    const g = new Graph(), id = [];
    for (let i = 0; i < n; i++) {
      id.push([]);
      for (let j = 0; j < n; j++) {
        const x = (i - n / 2) * spacing + (rnd() * 2 - 1) * jitter, y = (j - n / 2) * spacing + (rnd() * 2 - 1) * jitter;
        id[i].push(g.addNode(ca * x - sa * y, sa * x + ca * y));
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i + 1 < n && rnd() >= drop) g.addEdge(id[i][j], id[i + 1][j]);
      if (j + 1 < n && rnd() >= drop) g.addEdge(id[i][j], id[i][j + 1]);
      if (i + 1 < n && j + 1 < n && rnd() < diag) g.addEdge(id[i][j], id[i + 1][j + 1]);
      if (i + 1 < n && j > 0 && rnd() < diag) g.addEdge(id[i][j], id[i + 1][j - 1]);
    }
    return g.finalize();
  }

  /* ---------- OpenStreetMap(Overpass) ---------- */
  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  function overpassQuery(lat, lon, radiusM) {
    const dLat = radiusM / M_PER_DEG_LAT, dLon = radiusM / (M_PER_DEG_LON * Math.cos(lat * Math.PI / 180));
    const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map(v => v.toFixed(6)).join(',');
    const hw = 'footway|path|pedestrian|residential|living_street|service|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|track|cycleway|road';
    return `[out:json][timeout:60];way["highway"~"^(${hw})$"]["foot"!="no"]["access"!~"private|no"]["service"!~"driveway|parking_aisle"](${bbox});(._;>;);out skel qt;`;
  }
  async function fetchRoads(lat, lon, radiusM, opts = {}) {
    const body = 'data=' + encodeURIComponent(overpassQuery(lat, lon, radiusM));
    const timeoutMs = opts.timeoutMs || 45000, errs = [];
    for (const url of (opts.endpoints || OVERPASS)) {
      let host = url; try { host = new URL(url).host; } catch (e) { /* そのまま */ }
      if (opts.onStatus) opts.onStatus(`道路データを取得中…（${host}）`);
      const ctl = new AbortController(); let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
      try {
        const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 429 ? '（混雑中）' : ''));
        return await res.json();
      } catch (e) {
        errs.push(`${host}: ${timedOut ? Math.round(timeoutMs / 1000) + '秒で時間切れ' : (e.message || '接続できません')}`);
      } finally { clearTimeout(timer); }
    }
    throw new Error('道路データを取得できませんでした（' + errs.join(' ／ ') + '）');
  }
  function buildGraphFromOverpass(json, lat0, lon0) {
    const g = new Graph(), coords = new Map(), idx = new Map();
    for (const el of json.elements) if (el.type === 'node') coords.set(el.id, [el.lat, el.lon]);
    const node = id => {
      let i = idx.get(id);
      if (i === undefined) { const c = coords.get(id); const [x, y] = toLocal(c[0], c[1], lat0, lon0); i = g.addNode(x, y); idx.set(id, i); }
      return i;
    };
    for (const el of json.elements) {
      if (el.type !== 'way' || !el.nodes) continue;
      for (let k = 0; k + 1 < el.nodes.length; k++) {
        if (!coords.has(el.nodes[k]) || !coords.has(el.nodes[k + 1])) continue;
        g.addEdge(node(el.nodes[k]), node(el.nodes[k + 1]));
      }
    }
    return g.finalize();
  }

  /* ---------- 幾何ユーティリティ ---------- */
  function distPtSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function distPtPoly(px, py, pts, closed) {
    let d = Infinity; const n = pts.length;
    for (let i = 0; i + 1 < n; i++) d = Math.min(d, distPtSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    if (closed) d = Math.min(d, distPtSeg(px, py, pts[n - 1][0], pts[n - 1][1], pts[0][0], pts[0][1]));
    return d;
  }
  /* 折れ線を一定間隔でサンプリング(閉曲線なら最初に戻る) */
  function samplePoly(pts, step, closed) {
    const P = closed ? pts.concat([pts[0]]) : pts, out = [];
    let carry = 0;
    for (let i = 0; i + 1 < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1], L = Math.hypot(bx - ax, by - ay);
      let s = carry;
      while (s < L) { out.push([ax + (bx - ax) * s / L, ay + (by - ay) * s / L]); s += step; }
      carry = s - L;
    }
    return out;
  }
  function pip(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function rasterIoU(A, B, n = 72) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of A.concat(B)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    let inter = 0, uni = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = x0 + (i + 0.5) * (x1 - x0) / n, y = y0 + (j + 0.5) * (y1 - y0) / n;
      const a = pip(x, y, A), b = pip(x, y, B);
      if (a && b) inter++; if (a || b) uni++;
    }
    return uni ? inter / uni : 0;
  }
  function transformOutline(outline, sizeM, angleDeg, ox, oy) {
    const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return outline.map(([x, y]) => [(c * x - s * y) * sizeM + ox, (s * x + c * y) * sizeM + oy]);
  }

  /* ---------- 最短経路(ダイクストラ) ---------- */
  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
      while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v, rk = k[0], rv = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
      if (n) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1; if (c >= n) break;
          if (c + 1 < n && k[c + 1] < k[c]) c++;
          if (k[c] >= lk) break;
          k[i] = k[c]; v[i] = v[c]; i = c;
        }
        k[i] = lk; v[i] = lv;
      }
      return [rk, rv];
    }
  }
  function makeRouter(g) {
    const n = g.xs.length, dist = new Float64Array(n), stamp = new Int32Array(n), prev = new Int32Array(n);
    let cur = 0;
    return function path(src, dst, cost) {
      if (src === dst) return [src];
      cur++;
      const h = new Heap(); dist[src] = 0; stamp[src] = cur; prev[src] = -1; h.push(0, src);
      while (h.size) {
        const [d, u] = h.pop();
        if (d > dist[u]) continue;
        if (u === dst) break;
        const adj = g.adj[u];
        for (let k = 0; k < adj.length; k++) {
          const e = adj[k], v = g.other(e, u), nd = d + cost[e];
          if (stamp[v] !== cur || nd < dist[v]) { stamp[v] = cur; dist[v] = nd; prev[v] = u; h.push(nd, v); }
        }
      }
      if (stamp[dst] !== cur) return null;
      const out = []; for (let u = dst; u !== -1; u = prev[u]) out.push(u);
      return out.reverse();
    };
  }
  /* A→B→A のような往復(行き止まりへの寄り道)を取り除く */
  function removeBacktracks(path) {
    const st = [];
    for (const nd of path) {
      if (st.length && st[st.length - 1] === nd) continue;
      if (st.length >= 2 && st[st.length - 2] === nd) st.pop(); else st.push(nd);
    }
    return st;
  }

  /* ---------- フィット ---------- */
  function routeFor(g, router, ideal, tol, stepM) {
    // 形の線から離れる道ほど高コスト → 経路が輪郭に沿う
    const cost = new Float64Array(g.edges.length);
    for (let e = 0; e < g.edges.length; e++) cost[e] = g.edges[e][2] * (1 + distPtPoly(g.mx[e], g.my[e], ideal, true) / tol);
    const samples = samplePoly(ideal, stepM, true), seq = [];
    for (const [x, y] of samples) { const r = g.nodeGrid.nearest(x, y); if (r.i >= 0) seq.push(r.i); }
    if (seq.length < 4) return null;
    seq.push(seq[0]);
    let path = [seq[0]];
    for (let k = 0; k + 1 < seq.length; k++) {
      if (seq[k] === seq[k + 1]) continue;
      const p = router(seq[k], seq[k + 1], cost);
      if (!p) continue;
      for (let q = 1; q < p.length; q++) path.push(p[q]);
    }
    path = removeBacktracks(path);
    if (path.length < 4) return null;
    return path.map(i => [g.xs[i], g.ys[i]]);
  }
  function polyLength(pts, closed) {
    let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (closed) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    return L;
  }
  function evaluate(route, ideal) {
    const a = samplePoly(route, 15, false), b = samplePoly(ideal, 15, true);
    const da = a.map(([x, y]) => distPtPoly(x, y, ideal, true)).sort((p, q) => p - q);
    const db = b.map(([x, y]) => distPtPoly(x, y, route, false)).sort((p, q) => p - q);
    const q95 = arr => arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))] || 0;
    return { iou: rasterIoU(route, ideal), dev95: Math.max(q95(da), q95(db)) };
  }

  const tick = () => new Promise(r => setTimeout(r, 0));

  /* 県の形(outline: 最長辺=1に正規化)をグラフに当てはめ、良い順に最大 keep 案を返す */
  async function generate(opts) {
    const { graph: g, outline, sizeM, onProgress } = opts;
    const start = opts.start || [0, 0], keep = opts.keep || 3;
    const maxRot = opts.maxRot == null ? 30 : opts.maxRot, rotStep = 10, nTop = opts.nTop || 6;
    if (g.xs.length < 50) throw new Error('この周辺の道路が少なすぎます。別の場所を選んでください。');
    const router = makeRouter(g), tol = sizeM * 0.01;
    const angles = []; for (let a = -maxRot; a <= maxRot; a += rotStep) angles.push(a);
    const shifts = []; for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) shifts.push([dx * sizeM * 0.25, dy * sizeM * 0.25]);

    // 1) 道路がよく当たる配置を粗く探す
    const base = samplePoly(outline, 0.04, true); // 正規化座標でのサンプル
    const cands = [];
    for (const ang of angles) {
      const rot = transformOutline(base, sizeM, ang, 0, 0);
      for (const [dx, dy] of shifts) {
        let s = 0;
        for (const [x, y] of rot) s += g.coverGrid.nearest(x + start[0] + dx, y + start[1] + dy).d;
        cands.push({ score: s / rot.length, ang, dx, dy });
      }
    }
    cands.sort((a, b) => a.score - b.score);

    // 2) 上位候補だけ実際にルートを作って評価
    const results = [], top = cands.slice(0, nTop);
    for (let k = 0; k < top.length; k++) {
      const c = top[k];
      if (onProgress) onProgress((k + 0.2) / top.length, `${k + 1}/${top.length} 案を計算中…`);
      await tick();
      const ideal = transformOutline(outline, sizeM, c.ang, start[0] + c.dx, start[1] + c.dy);
      const pts = routeFor(g, router, ideal, tol, Math.max(30, sizeM / 30));
      if (!pts) continue;
      const ev = evaluate(pts, ideal);
      results.push({ pts, ideal, angle: c.ang, lengthM: polyLength(pts, true), iou: ev.iou, dev95: ev.dev95 });
    }
    if (onProgress) onProgress(1, '完了');
    results.sort((a, b) => b.iou - a.iou);
    if (!results.length) throw new Error('ルートを作れませんでした。別の場所か大きさを試してください。');
    return results.slice(0, keep);
  }

  /* 走ったルートが、計画ルートをどれだけなぞったか(0〜1)。trail/plan とも[x,y](メートル) */
  function coverage(plan, trail, tolM = 30) {
    if (!trail.length) return 0;
    const samples = samplePoly(plan, 20, true);
    if (!samples.length) return 0;
    let hit = 0;
    for (const [x, y] of samples) { if (distPtPoly(x, y, trail, false) <= tolM) hit++; }
    return hit / samples.length;
  }

  /* 実際に走ったか(GPS)の判定。
   * ・スタート地点(📍)に着いてから数え始める
   * ・赤い線を「順番どおり」になぞった部分だけが進み具合になる(先の区間を飛ばしたり逆走しても数えない)
   * ・精度の悪い測位や、走る速さを超える移動(車・自転車・位置のワープ)は数えない
   * ・全体の95%以上をなぞり、途切れが約60m以内で、ゴール側まで到達したら完成
   */
  class CourseTracker {
    constructor(plan, o = {}) {
      this.tol = o.tol || 30;            // コースからこの距離以内なら「通った」(m)
      this.step = o.step || 10;          // 判定する点の間隔(m)
      this.look = o.lookahead || 15;     // いま到達した所から先に数えられる範囲(点の数)
      this.maxSpeed = o.maxSpeed || 9;   // 一瞬の移動(ワープ)がこれを超えたら数えない(m/秒≒時速32km)
      this.maxAvg = o.maxAvg || 8.5;     // 6秒以上の平均の速さがこれを超えたら数えない(m/秒≒時速30km・自転車や車)
      this.maxAcc = o.maxAcc || 40;      // これより精度の悪い測位は捨てる(m)
      this.startR = o.startRadius || 60; // スタート地点とみなす範囲(m)
      this.minDone = o.minDone || 0.95;  // 完成に必要な割合
      this.maxGap = o.maxGap || 6;       // 途切れてよい最大の点数(6×10m=60m)
      this.s = samplePoly(plan, this.step, true);
      this.n = this.s.length;
      this.cov = new Uint8Array(this.n);
      this.nCov = 0; this.front = -1; this.started = false;
      this.last = null; this.prev = null; this.dist = 0;
      this.rejected = { accuracy: 0, speed: 0 }; this.speedRun = 0; this.hist = [];
    }
    get progress() { return this.n ? this.nCov / this.n : 0; }
    /* x,y: メートル座標, t: ミリ秒, acc: 精度(m)。sim=true は開発用(速さ・精度の検査を省く) */
    add(x, y, t, acc, o = {}) {
      if (!o.sim && acc && acc > this.maxAcc) { this.rejected.accuracy++; return { ok: false, reason: 'accuracy' }; }
      const last = this.last;
      if (!o.sim && last) {
        const d = Math.hypot(x - last.x, y - last.y), dt = (t - last.t) / 1000;
        if (dt > 0 && d > 25 && d / dt > this.maxSpeed) {
          this.rejected.speed++;
          // 最初の測位が大きくずれていたときに、ずっと拒否し続けないよう、連続したら基準を取り直す
          if (++this.speedRun >= 8) { this.last = { x, y, t }; this.prev = null; this.speedRun = 0; this.hist = []; }
          return { ok: false, reason: 'speed' };
        }
      }
      this.speedRun = 0;
      if (!o.sim) {   // 6秒以上前の位置との平均の速さ(自転車・車など、走る速さを超える移動を弾く)
        let ref = null;
        for (let i = this.hist.length - 1; i >= 0; i--) if (t - this.hist[i].t >= 6000) { ref = this.hist[i]; break; }
        if (ref && Math.hypot(x - ref.x, y - ref.y) / ((t - ref.t) / 1000) > this.maxAvg) { this.rejected.speed++; return { ok: false, reason: 'speed' }; }
      }
      this.hist.push({ x, y, t });
      while (this.hist.length && t - this.hist[0].t > 30000) this.hist.shift();
      this.last = { x, y, t };
      if (!this.started) {
        const d0 = Math.hypot(x - this.s[0][0], y - this.s[0][1]);
        if (d0 > this.startR) return { ok: true, state: 'toStart', toStart: d0 };
        this.started = true;
      }
      let a = this.prev && (t - this.prev.t) < 60000 ? this.prev : { x, y };
      if (this.prev) this.dist += Math.hypot(x - this.prev.x, y - this.prev.y);
      this.prev = { x, y, t };
      const hi = Math.min(this.n - 1, this.front + this.look);
      let near = Infinity, changed = false, front = this.front;
      for (let i = 0; i <= hi; i++) {
        const d = distPtSeg(this.s[i][0], this.s[i][1], a.x, a.y, x, y);
        if (d <= this.tol && !this.cov[i]) { this.cov[i] = 1; this.nCov++; changed = true; if (i > front) front = i; }
        if (i >= this.front - 5) near = Math.min(near, Math.hypot(this.s[i][0] - x, this.s[i][1] - y));
      }
      this.front = front;
      let state = 'on';
      if (near > this.tol * 1.5) {
        let any = Infinity;
        for (let i = hi + 1; i < this.n; i++) any = Math.min(any, Math.hypot(this.s[i][0] - x, this.s[i][1] - y));
        state = any <= this.tol ? 'wrongWay' : 'off';
      }
      return { ok: true, state, off: near, changed, done: this.isComplete() };
    }
    maxGapNow() {
      let best = 0, run = 0;
      for (let i = 0; i < this.n; i++) { if (this.cov[i]) run = 0; else { run++; if (run > best) best = run; } }
      return best;
    }
    isComplete() {
      return this.started && this.progress >= this.minDone && this.maxGapNow() <= this.maxGap &&
        (this.cov[this.n - 1] || this.cov[this.n - 2] || this.cov[this.n - 3]) ? true : false;
    }
    /* なぞれた区間(連続した点の番号の範囲)。地図に緑で重ねる用 */
    coveredRuns() {
      const out = []; let st = -1;
      for (let i = 0; i <= this.n; i++) {
        const c = i < this.n && this.cov[i];
        if (c && st < 0) st = i; else if (!c && st >= 0) { out.push([st, i - 1]); st = -1; }
      }
      return out;
    }
  }

  return {
    CourseTracker, toLocal, toLatLng, Graph, syntheticGraph, overpassQuery, fetchRoads, buildGraphFromOverpass,
    generate, coverage, polyLength, samplePoly, transformOutline,
  };
});
