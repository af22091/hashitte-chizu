/* はしって日本地図 — 画面とアプリの流れ */
(() => {
  'use strict';
  const RE = window.RouteEngine;
  const COLORS = ['#ff6b6b', '#ffc145', '#2ec4a6', '#9b7bf2', '#3da5f5'];
  const SIZES = { s: 1000, m: 1500, l: 2000 };            // 形の最長辺(m)
  const STORE_KEY = 'hashitte-nihon-v1';
  const DEFAULT_START = [35.6762, 139.6503];              // 場所が未設定のときの地図の中心(東京)
  const DEV = new URLSearchParams(location.search).has('dev');   // ?dev=1 のときだけ、デモ道路とシミュレーション走行が使える
  const $ = s => document.querySelector(s);
  const tick = () => new Promise(r => setTimeout(r, 0));

  /* ---------- モード(日本 / 世界) ---------- */
  const MODES = {
    jp: { key: 'jp', title: 'はしって日本地図', home: '日本', file: 'data/prefectures.json', runs: 'runs', unit: '県', font: 8.5,
      hint: '走りたい県をタップしてください。ピンチやボタンで拡大、検索もできます。', searchPh: '県の名前で探す' },
    world: { key: 'world', title: 'はしって世界地図', home: '世界', file: 'data/world.json', runs: 'worldRuns', unit: '国', font: 7,
      hint: '走りたい国をタップしてください。ピンチやボタンで拡大、検索もできます。', searchPh: '国の名前で探す(日本語・英語)' },
  };
  const MAX_SIZE_M = 3000;                                 // 細長い国で拡大しても、道路取得が重くならない上限
  let cur = null;                                          // いま開いているモード('jp' / 'world' / null=ホーム)
  const DATAS = {};                                        // モードごとの { data, prefs, byId }

  /* ---------- 保存(ブラウザ内) ---------- */
  const blankSave = () => ({ runs: {}, worldRuns: {}, lastStart: null });
  let save = blankSave();
  try {
    const j = JSON.parse(localStorage.getItem(STORE_KEY));
    if (j && j.runs) save = Object.assign(blankSave(), j);
  } catch (e) { /* 初回 */ }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); }
    catch (e) { toast('保存できませんでした（容量や設定を確認してください）'); }
  }
  const runsOf = mk => save[MODES[mk].runs];
  const RUNS = () => runsOf(cur);

  /* ---------- 共通 ---------- */
  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }
  function haversine(a, b) {
    const R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = m => (m / 1000).toFixed(2) + ' km';
  const fmtTime = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const fmtDate = iso => { const d = new Date(iso); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };

  /* 緯度経度の列を、枠に収まるSVGのパスにする(走った絵の表示用) */
  function trailSvg(latlngs, color, planned, size = 200) {
    const all = latlngs.concat(planned || []);
    if (all.length < 2) return '';
    const lat0 = all.reduce((s, p) => s + p[0], 0) / all.length, lon0 = all.reduce((s, p) => s + p[1], 0) / all.length;
    const loc = pts => pts.map(p => RE.toLocal(p[0], p[1], lat0, lon0));
    const A = loc(latlngs), B = planned ? loc(planned) : [];
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    for (const p of A.concat(B)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const pad = 14, k = (size - pad * 2) / Math.max(x1 - x0, y1 - y0, 1);
    const ox = (size - (x1 - x0) * k) / 2, oy = (size - (y1 - y0) * k) / 2;
    const d = pts => pts.map((p, i) => (i ? 'L' : 'M') + (ox + (p[0] - x0) * k).toFixed(1) + ',' + (size - (oy + (p[1] - y0) * k)).toFixed(1)).join('');
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">` +
      (B.length ? `<path d="${d(B)}Z" fill="none" stroke="#b9c3cd" stroke-width="2" stroke-dasharray="4 4" stroke-linejoin="round"/>` : '') +
      `<path class="trail-line" pathLength="1" d="${d(A)}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  /* ---------- データ読み込み ---------- */
  let data = null, prefs = [], byId = {};
  async function loadAll() {
    await Promise.all(Object.values(MODES).map(async m => {
      let d = window.__DATA && window.__DATA[m.key];      // data/embedded.js があればそれを使う(ダブルクリックでも動く)
      if (!d) {
        const res = await fetch(m.file);
        if (!res.ok) throw new Error(m.file + ' ' + res.status);
        d = await res.json();
      }
      DATAS[m.key] = { data: d, prefs: d.prefs, byId: Object.fromEntries(d.prefs.map(p => [p.id, p])) };
    }));
  }
  const prefOf = (mk, id) => DATAS[mk].byId[id];
  /* 形の大きさ(m)。細長い国は少し大きめにする */
  const sizeOf = (p, key) => Math.min(SIZES[key] * (p.scale || 1), MAX_SIZE_M);

  /* ---------- ホーム(モード選択) ---------- */
  function thumb(mk) {
    const D = DATAS[mk], runs = runsOf(mk), [x0, y0, w, h] = D.data.viewBox;
    let html = `<svg viewBox="${x0} ${y0} ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
    for (const p of D.prefs) html += `<path d="${p.d}" fill="${runs[p.id] ? COLORS[p.color] : '#f7f9fb'}" stroke="#fff" stroke-width="${mk === 'world' ? 0.5 : 1}"/>`;
    return html + '</svg>';
  }
  function renderHome() {
    $('#home-cards').innerHTML = Object.values(MODES).map(m => {
      const D = DATAS[m.key], n = Object.keys(runsOf(m.key)).filter(id => D.byId[id]).length, tot = D.prefs.length;
      return `<button class="mode-card" data-mode="${m.key}"><div class="mode-thumb">${thumb(m.key)}</div>` +
        `<div class="mode-info"><h2>${m.home}</h2><div class="mode-count"><b>${n}</b> / ${tot}</div>` +
        `<div class="bar"><i style="width:${Math.round(n / tot * 100)}%"></i></div></div></button>`;
    }).join('');
  }
  $('#home-cards').addEventListener('click', e => {
    const c = e.target.closest('.mode-card'); if (c) enterMode(c.dataset.mode);
  });
  function enterMode(mk) {
    cur = mk; const D = DATAS[mk]; data = D.data; prefs = D.prefs; byId = D.byId; selectedId = null;
    const [x0, y0, w, h] = data.viewBox; base = { x: x0, y: y0, w, h }; view = Object.assign({}, base);
    $('#search').value = ''; $('#search').placeholder = MODES[mk].searchPh;
    $('#search-list').innerHTML = prefs.map(p => `<option value="${p.name}">${p.en || ''}</option>`).join('');
    $('#board-hint').textContent = MODES[mk].hint;
    show('board'); renderBoard();
  }
  function goHome() {
    cur = null; closeSheet(); show('home'); renderHome();
  }
  $('#btn-home').onclick = goHome;

  /* ---------- ① パズル盤(拡大・移動つき) ---------- */
  let selectedId = null, view = null, base = null;
  function renderBoard() {
    if (!cur) return;
    const [x0, y0, w, h] = data.viewBox, runs = RUNS();
    let html = `<rect class="ocean" x="${x0}" y="${y0}" width="${w}" height="${h}"/>`;
    if (data.inset) { const [ix, iy, iw, ih] = data.inset; html += `<rect class="frame" x="${ix}" y="${iy}" width="${iw}" height="${ih}"/>`; }
    for (const p of prefs) {
      const done = !!runs[p.id];
      html += `<path class="piece${done ? ' done' : ''}${selectedId === p.id ? ' sel' : ''}" data-id="${p.id}" d="${p.d}"` +
        (done ? ` style="fill:${COLORS[p.color]}"` : '') + '/>';
    }
    for (const p of prefs) html += `<text class="lab" data-lz="${p.lz || 1}" x="${p.label[0]}" y="${p.label[1]}">${p.short}</text>`;
    $('#board').innerHTML = html;
    $('#count-done').textContent = Object.keys(runs).filter(id => byId[id]).length;
    $('#count-total').textContent = prefs.length;
    $('#top h1').textContent = MODES[cur].title; document.title = MODES[cur].title;
    applyView();
  }
  function applyView() {
    const svg = $('#board'), z = base.w / view.w;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    svg.style.setProperty('--lab', (MODES[cur].font / Math.sqrt(z)).toFixed(2));
    svg.dataset.zoom = z.toFixed(2);
    svg.querySelectorAll('.lab').forEach(el => { el.style.display = z + 1e-6 >= +el.dataset.lz ? '' : 'none'; });
  }
  function clampView() {
    view.w = Math.min(base.w, Math.max(base.w / 14, view.w)); view.h = view.w * base.h / base.w;
    view.x = Math.min(base.x + base.w - view.w, Math.max(base.x, view.x));
    view.y = Math.min(base.y + base.h - view.h, Math.max(base.y, view.y));
  }
  const svgPt = (cx, cy) => {
    const svg = $('#board'), pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: view.x + view.w / 2, y: view.y + view.h / 2 };
  };
  function zoomAt(ax, ay, f) {                    // (ax,ay)の位置を動かさずにf倍にする
    const nw = view.w / f; if (nw > base.w * 1.0001 && f < 1) f = view.w / base.w;
    const k = (view.w / f) / view.w;
    view.x = ax - (ax - view.x) * k; view.y = ay - (ay - view.y) * k; view.w = view.w * k; view.h = view.h * k;
    clampView(); applyView();
  }
  const zoomCenter = f => zoomAt(view.x + view.w / 2, view.y + view.h / 2, f);
  $('#z-in').onclick = () => zoomCenter(1.6);
  $('#z-out').onclick = () => zoomCenter(1 / 1.6);
  $('#z-reset').onclick = () => { view = Object.assign({}, base); applyView(); };
  $('#board').addEventListener('wheel', e => {
    e.preventDefault(); const p = svgPt(e.clientX, e.clientY); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.25 : 0.8);
  }, { passive: false });

  /* ドラッグで移動・2本指(またはホイール)で拡大。ほとんど動かなかったらタップ扱い */
  const ptrs = new Map(); let gesture = null, moved = false;
  $('#board').addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) moved = false;
    gesture = { n: ptrs.size, d0: pinchDist(), v0: Object.assign({}, view), sx: e.clientX, sy: e.clientY };
  });
  function pinchDist() { const a = [...ptrs.values()]; return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  window.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !gesture) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const m = $('#board').getScreenCTM(); if (!m) return;
    if (ptrs.size >= 2) {
      moved = true;
      const d = pinchDist(); if (gesture.d0 && d) {
        const a = [...ptrs.values()], c = svgPt((a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2);
        const f = d / gesture.d0; gesture.d0 = d; zoomAt(c.x, c.y, f);
      }
    } else {
      if (Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 6) moved = true;
      if (moved) { view.x -= (e.clientX - prev.x) / m.a; view.y -= (e.clientY - prev.y) / m.d; clampView(); applyView(); }
    }
  });
  const endPtr = e => { ptrs.delete(e.pointerId); if (gesture) { gesture.d0 = pinchDist(); } if (!ptrs.size) gesture = null; };
  window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
  $('#board').addEventListener('click', e => {
    if (moved) { moved = false; return; }
    const t = e.target.closest('.piece');
    if (t) openSheet(+t.dataset.id); else closeSheet();
  });

  /* 名前で探す: 見つけたらそこへ拡大してシートを開く */
  function focusPref(p) {
    const el = document.querySelector(`#board .piece[data-id="${p.id}"]`); if (!el) return;
    const bb = el.getBBox(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    const z = Math.min(8, Math.max(1.6, Math.min(base.w / (bb.width * 3.2), base.h / (bb.height * 3.2))));
    view.w = base.w / z; view.h = base.h / z; view.x = cx - view.w / 2; view.y = cy - view.h / 2;
    clampView(); applyView(); openSheet(p.id);
  }
  function doSearch() {
    const q = $('#search').value.trim().toLowerCase(); if (!q) return;
    const hit = prefs.find(p => p.name.toLowerCase() === q || (p.en || '').toLowerCase() === q)
      || prefs.find(p => p.name.toLowerCase().includes(q) || (p.en || '').toLowerCase().includes(q));
    if (hit) { focusPref(hit); $('#search').blur(); } else toast('見つかりませんでした');
  }
  $('#search').addEventListener('change', doSearch);
  $('#search').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  const estKm = (p, sizeKey) => p.perimeter * sizeOf(p, sizeKey) * 1.3 / 1000;
  function placeHtml(r, key) {
    if (r.place && r.place.text) return `<br>📍 ${esc(r.place.text)}`;
    return placeBusy.has(key) ? '<br><span class="muted">📍 地名を取得中…</span>' : '<br><span class="muted">📍 地名: 未取得</span> <button class="mini" data-act="place">取得する</button>';
  }
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function openSheet(id) {
    selectedId = id; renderBoardSel();
    const p = byId[id], run = RUNS()[id], u = MODES[cur].unit;
    let body = `<div class="sheet-title"><h2>${p.name}${p.en ? ` <small class="muted">${p.en}</small>` : ''}</h2><span class="stars" title="形の難しさ">${stars(p.level)}</span></div>`;
    if (run) {
      body += `<div class="sheet-body-row"><div class="trail-prev">${trailSvg(run.trail, COLORS[p.color], run.planned, 110)}</div>` +
        `<div class="facts" id="sh-facts">完成 ${fmtDate(run.date)}<br>距離 ${fmtKm(run.distanceM)}<br>時間 ${fmtTime(run.durationS)}<span id="sh-place">${placeHtml(run, cur + id)}</span>${run.demo ? '<br><span class="muted">（デモの記録）</span>' : ''}</div></div>` +
        `<div class="sheet-actions"><button id="sh-view">記録を見る</button><button class="primary" id="sh-run">もう一度走る</button></div>`;
    } else {
      body += `<div class="facts" style="margin:10px 0">目安の距離: 小 約${estKm(p, 's').toFixed(1)}km ／ 中 約${estKm(p, 'm').toFixed(1)}km ／ 大 約${estKm(p, 'l').toFixed(1)}km</div>` +
        `<div class="sheet-actions"><button class="primary" id="sh-run">この${u}を走る</button></div>`;
    }
    $('#sheet-body').innerHTML = body; $('#sheet').hidden = false;
    $('#sh-run').onclick = () => openPlan(id);
    const v = $('#sh-view'); if (v) v.onclick = () => showDone(id, false);
    const pb = $('#sh-place .mini'); if (pb) pb.onclick = () => fetchPlaceFor(cur, id);
  }
  function renderBoardSel() {
    document.querySelectorAll('#board .piece').forEach(el => el.classList.toggle('sel', +el.dataset.id === selectedId));
  }
  function closeSheet() { selectedId = null; $('#sheet').hidden = true; if (cur) renderBoardSel(); }

  /* ---------- 画面の切り替え ---------- */
  let map = null, planLayer = null, runLayer = null, startMarker = null;
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name === 'map') { ensureMap(); setTimeout(() => map.invalidateSize(), 50); }
    $('#btn-home').hidden = name === 'home';
    $('#counter').hidden = name === 'home';
    if (name === 'home') { $('#top h1').textContent = 'はしって地図あつめ'; document.title = 'はしって地図あつめ'; }
  }
  function ensureMap() {
    if (map) return;
    map = L.map('map', { zoomControl: true });
    /* file:// で開くとRefererが付かず、OSM公式タイルに拒否される。その場合だけ別の地図タイルを使う */
    const viaFile = location.protocol === 'file:';
    L.tileLayer(viaFile ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, subdomains: viaFile ? 'abcd' : 'abc', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' + (viaFile ? ' © CARTO' : '') }).addTo(map);
    planLayer = L.layerGroup().addTo(map); runLayer = L.layerGroup().addTo(map);
    const s = save.lastStart || DEFAULT_START;
    map.setView(s, 15);
    map.on('click', e => { if (mode === 'plan') setStart([e.latlng.lat, e.latlng.lng]); });
  }

  /* ---------- ② コース作成 ---------- */
  let mode = 'board';
  const plan = { pref: null, size: 'm', start: null, routes: [], sel: 0, lat0: 0, lon0: 0, busy: false };

  function openPlan(id) {
    closeSheet(); mode = 'plan';
    plan.pref = byId[id]; plan.routes = []; plan.sel = 0;
    show('map'); runLayer.clearLayers(); planLayer.clearLayers();
    $('#panel-run').hidden = true; $('#panel-plan').hidden = false;
    $('#plan-title').textContent = plan.pref.name + ' を走る'; plan.mk = cur;
    $('#plan-results').hidden = true; $('#plan-msg').textContent = ''; $('#plan-prog').hidden = true;
    $('#panel-plan').classList.remove('compact'); $('#btn-opts').hidden = true;
    setStart(save.lastStart || DEFAULT_START, true);
    updateEst();
  }
  function setStart(ll, recenter) {
    plan.start = ll; save.lastStart = ll; persist();
    if (!startMarker) {
      startMarker = L.marker(ll, { draggable: true, icon: L.divIcon({ className: '', html: '<div class="start-pin">📍</div>', iconSize: [26, 26], iconAnchor: [13, 24] }) }).addTo(map);
      startMarker.on('dragend', () => { const p = startMarker.getLatLng(); setStart([p.lat, p.lng]); });
    } else startMarker.setLatLng(ll);
    if (!startMarker._map) startMarker.addTo(map);
    if (recenter) map.setView(ll, 15);
    if (plan.routes.length) { plan.routes = []; planLayer.clearLayers(); $('#plan-results').hidden = true; $('#panel-plan').classList.remove('compact'); $('#btn-opts').hidden = true; }
  }
  function updateEst() {
    const p = plan.pref; if (!p) return;
    $('#plan-est').textContent = `${(sizeOf(p, plan.size) / 1000).toFixed(1)}km四方・走る距離の目安 約${estKm(p, plan.size).toFixed(1)}km`;
  }
  $('#size-seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    plan.size = b.dataset.s;
    document.querySelectorAll('#size-seg button').forEach(x => x.classList.toggle('on', x === b));
    updateEst(); plan.routes = []; planLayer.clearLayers(); $('#plan-results').hidden = true;
  });
  $('#btn-here').onclick = () => {
    if (!navigator.geolocation) return toast('この端末では現在地を取得できません');
    navigator.geolocation.getCurrentPosition(
      p => setStart([p.coords.latitude, p.coords.longitude], true),
      err => toast('現在地を取得できませんでした: ' + err.message), { enableHighAccuracy: true, timeout: 12000 });
  };
  $('#plan-back').onclick = () => { leaveMap(); };
  function leaveMap() {
    mode = 'board'; if (startMarker) { startMarker.remove(); }
    planLayer && planLayer.clearLayers(); runLayer && runLayer.clearLayers();
    show('board'); renderBoard();
  }
  function progress(f, text) {
    $('#plan-prog').hidden = false;
    $('#plan-prog .bar i').style.width = Math.round(f * 100) + '%';
    $('#plan-prog span').textContent = text || '';
  }
  $('#btn-make').onclick = makeCourse;
  async function makeCourse() {
    if (plan.busy) return;
    const sizeM = sizeOf(plan.pref, plan.size), [lat0, lon0] = plan.start, src = $('#src').value;
    plan.busy = true; $('#btn-make').disabled = true; $('#plan-msg').textContent = '';
    $('#plan-results').hidden = true; planLayer.clearLayers();
    try {
      let g;
      if (src === 'demo') {
        progress(0.05, 'デモの道路網を作成中…'); await tick();
        g = RE.syntheticGraph(sizeM * 1.2 + 1500, 1);
      } else {
        progress(0.03, '道路データを取得中…（数秒〜数十秒かかることがあります）');
        const json = await RE.fetchRoads(lat0, lon0, sizeM * 0.9 + 250, { onStatus: t => progress(0.05, t) });
        progress(0.12, '道路網を作成中…'); await tick();
        g = RE.buildGraphFromOverpass(json, lat0, lon0);
      }
      const routes = await RE.generate({
        graph: g, outline: plan.pref.outline, sizeM, start: [0, 0],
        onProgress: (f, t) => progress(0.15 + 0.85 * f, t),
      });
      plan.routes = routes; plan.sel = 0; plan.lat0 = lat0; plan.lon0 = lon0; plan.demo = src === 'demo';
      showRoutes();
    } catch (e) {
      $('#plan-msg').textContent = e.message + (src === 'osm' ? '。大きさを「小」にするか、道路の少ない場所で試すか、少し待ってからもう一度お試しください。「デモ」ならネットなしで動きます。' : '');
    } finally {
      plan.busy = false; $('#btn-make').disabled = false; $('#plan-prog').hidden = true;
    }
  }
  /* 地図を合わせるときの余白(パネルに隠れない位置に収める) */
  function fitPad() {
    return window.innerWidth >= 760 ? { paddingTopLeft: [470, 30], paddingBottomRight: [30, 30] }
      : { paddingTopLeft: [30, 30], paddingBottomRight: [30, 270] };
  }
  const toLL = (pts, lat0, lon0) => pts.map(p => RE.toLatLng(p[0], p[1], lat0, lon0));
  function showRoutes() {
    const chips = $('#chips'); chips.innerHTML = '';
    plan.routes.forEach((r, i) => {
      const b = document.createElement('button'); b.className = i === plan.sel ? 'on' : '';
      b.innerHTML = `案${i + 1}<br>${Math.round(r.iou * 100)}% ・ ${(r.lengthM / 1000).toFixed(1)}km`;
      b.onclick = () => { plan.sel = i; showRoutes(); }; chips.appendChild(b);
    });
    const r = plan.routes[plan.sel];
    planLayer.clearLayers();
    const ideal = L.polygon(toLL(r.ideal, plan.lat0, plan.lon0), { color: '#1e88e5', weight: 2, dashArray: '6 6', fill: false });
    const line = L.polyline(toLL(r.pts.concat([r.pts[0]]), plan.lat0, plan.lon0), { color: '#e53935', weight: 5, opacity: .9 });
    planLayer.addLayer(ideal); planLayer.addLayer(line);
    map.fitBounds(line.getBounds(), fitPad());
    $('#plan-info').textContent = `再現度 ${Math.round(r.iou * 100)}%（青い点線が目標の形）・走る距離 約${(r.lengthM / 1000).toFixed(1)}km` + (plan.demo ? '・デモ道路' : '');
    $('#plan-results').hidden = false;
    $('#panel-plan').classList.add('compact'); $('#btn-opts').hidden = false;   // 設定欄をたたんで地図を広く
  }
  $('#btn-opts').onclick = () => { $('#panel-plan').classList.remove('compact'); $('#btn-opts').hidden = true; };
  $('#btn-go').onclick = () => openRun(plan.routes[plan.sel]);

  /* ---------- ③ 走る(GPSで本当に通らないと完成しない) ---------- */
  const run = { route: null, lat0: 0, lon0: 0, planLL: [], tracker: null, trail: [], t0: 0, elapsed: 0,
    running: false, watchId: null, simTimer: null, clock: null, simPos: 0,
    layerCovered: null, line: null, me: null, wake: null, sim: false, lastN: -1 };

  function setStatus(text, kind) {
    const el = $('#run-status'); el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function openRun(route) {
    mode = 'run';
    Object.assign(run, { route, lat0: plan.lat0, lon0: plan.lon0, trail: [], elapsed: 0, running: false, sim: false, simPos: 0, lastN: -1 });
    run.tracker = new RE.CourseTracker(route.pts);
    run.planLL = toLL(route.pts, run.lat0, run.lon0);
    planLayer.clearLayers(); runLayer.clearLayers(); if (startMarker) startMarker.remove();
    runLayer.addLayer(L.polyline(run.planLL.concat([run.planLL[0]]), { color: '#e53935', weight: 5, opacity: .55 }));
    run.layerCovered = L.layerGroup().addTo(runLayer);
    run.line = L.polyline([], { color: '#1e88e5', weight: 4, opacity: .9 }).addTo(runLayer);
    L.marker(run.planLL[0], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="start-pin">📍</div>', iconSize: [26, 26], iconAnchor: [13, 24] }) }).addTo(runLayer);
    run.me = null;
    $('#panel-plan').hidden = true; $('#panel-run').hidden = false;
    $('#run-title').textContent = plan.pref.name;
    $('#sim').checked = false; $('#sim').disabled = false; $('#sim-speed').disabled = false; $('#run-msg').textContent = '';
    $('#btn-run').textContent = 'スタート'; $('#btn-quit').disabled = false;
    setStatus('📍のスタート地点に立って「スタート」を押し、赤い線に沿って一周してください。GPSで通ったことを確認して、ぜんぶ通ると完成します。');
    updateStats(); map.fitBounds(L.latLngBounds(run.planLL), fitPad());
  }
  function updateStats() {
    $('#st-dist').textContent = fmtKm(run.tracker.dist);
    $('#st-time').textContent = fmtTime(run.elapsed);
    $('#st-cov').textContent = Math.round(run.tracker.progress * 100) + '%';
  }
  /* なぞれた区間を緑で重ねる */
  function drawCovered() {
    run.layerCovered.clearLayers();
    const T = run.tracker, ll = i => RE.toLatLng(T.s[i][0], T.s[i][1], run.lat0, run.lon0);
    for (const [a, b] of T.coveredRuns()) {
      const pts = []; for (let i = a; i <= Math.min(b + 1, T.n - 1); i++) pts.push(ll(i));
      run.layerCovered.addLayer(L.polyline(pts, { color: '#2fa36b', weight: 8, opacity: .95, lineCap: 'round' }));
    }
  }
  function onFix(lat, lon, acc, t, sim) {
    const [x, y] = RE.toLocal(lat, lon, run.lat0, run.lon0);
    const r = run.tracker.add(x, y, t || Date.now(), acc, { sim });
    if (!run.me) run.me = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16] }), interactive: false }).addTo(runLayer);
    else run.me.setLatLng([lat, lon]);
    if (!map.getBounds().pad(-0.15).contains([lat, lon])) map.panTo([lat, lon]);
    if (!r.ok) {
      setStatus(r.reason === 'accuracy' ? '位置情報の精度が低いため、記録できていません。屋外の空が開けた場所で試してください。'
        : '移動が速すぎるため記録できません（走る・歩く速さで進んでください）。', 'warn');
      return;
    }
    if (r.state === 'toStart') { setStatus(`📍スタート地点まで、あと約${Math.round(r.toStart)}mです。着いたら自動で記録が始まります。`, 'warn'); updateStats(); return; }
    run.trail.push([lat, lon]); run.line.addLatLng([lat, lon]);
    if (run.tracker.nCov !== run.lastN) { run.lastN = run.tracker.nCov; drawCovered(); }
    if (r.state === 'wrongWay') setStatus('進む向きが違うか、道をショートカットしています。赤い線の順番どおりに進んでください。', 'warn');
    else if (r.state === 'off') setStatus(`コースから約${Math.round(r.off)}m離れています。赤い線に戻ってください。`, 'warn');
    else setStatus(`いい調子です！ あと約${Math.max(0, (run.route.lengthM * (1 - run.tracker.progress) / 1000)).toFixed(1)}km`, 'ok');
    updateStats();
    if (r.done) completeRun();
  }
  async function startRun() {
    run.running = true; run.t0 = Date.now() - run.elapsed * 1000;
    $('#btn-run').textContent = '一時停止'; $('#sim').disabled = true; $('#sim-speed').disabled = true;
    run.clock = setInterval(() => { run.elapsed = (Date.now() - run.t0) / 1000; updateStats(); }, 500);
    run.sim = DEV && $('#sim').checked;
    if (run.sim) {
      const path = RE.samplePoly(run.route.pts, 1, true);           // 1m間隔の点列(開発用)
      let s = run.simPos || 0; const speed = +$('#sim-speed').value;
      run.simTimer = setInterval(() => {
        s += speed * 0.2; run.simPos = s;
        if (s >= path.length - 1) { stopTracking(); setStatus('シミュレーションが終点に着きました。', 'warn'); return; }
        const p = path[Math.floor(s)], ll = RE.toLatLng(p[0] + (Math.random() - .5) * 6, p[1] + (Math.random() - .5) * 6, run.lat0, run.lon0);
        onFix(ll[0], ll[1], 5, Date.now(), true);
      }, 200);
    } else {
      if (!navigator.geolocation) { $('#run-msg').textContent = 'この端末では位置情報を使えません。'; pauseRun(); return; }
      run.watchId = navigator.geolocation.watchPosition(
        p => onFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.timestamp, false),
        err => { $('#run-msg').textContent = err.code === 1 ? '位置情報が許可されていません。ブラウザの設定で許可してください。' : '位置情報エラー: ' + err.message; },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
      try { if (navigator.wakeLock) run.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* 画面を点けたままにできなくても続行 */ }
    }
  }
  function stopTracking() {
    run.running = false; clearInterval(run.clock); clearInterval(run.simTimer);
    if (run.watchId != null) { navigator.geolocation.clearWatch(run.watchId); run.watchId = null; }
    if (run.wake) { try { run.wake.release(); } catch (e) { /* 何もしない */ } run.wake = null; }
  }
  function pauseRun() {
    stopTracking(); $('#btn-run').textContent = '再開'; $('#sim').disabled = false; $('#sim-speed').disabled = false;
  }
  $('#btn-run').onclick = () => { if (run.running) pauseRun(); else startRun(); };
  $('#btn-quit').onclick = () => {
    if (run.tracker.progress > 0.05 && !confirm('ここまでの記録は保存されません。やめますか？')) return;
    stopTracking(); runLayer.clearLayers(); mode = 'plan';
    $('#panel-run').hidden = true; $('#panel-plan').hidden = false;
    if (startMarker) startMarker.addTo(map); showRoutes();
  };
  $('#run-back').onclick = () => $('#btn-quit').click();
  /* GPSで一周できたときだけ保存される */
  function completeRun() {
    stopTracking();
    const keep = []; let prev = null;
    for (const p of run.trail) { if (!prev || haversine(prev, p) >= 8) { keep.push([+p[0].toFixed(6), +p[1].toFixed(6)]); prev = p; } }
    const id = plan.pref.id, mk = plan.mk || cur;
    runsOf(mk)[id] = {
      date: new Date().toISOString(), distanceM: run.tracker.dist, durationS: run.elapsed, coverage: run.tracker.progress,
      iou: run.route.iou, sizeM: sizeOf(plan.pref, plan.size), demo: !!(run.sim || plan.demo),
      trail: keep, planned: run.planLL.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]),
      place: null,
    };
    persist(); leaveMap(); flashPiece(id); showDone(id, true);
    fetchPlaceFor(mk, id);            // 走った場所の地名を、あとから自動で記録する
  }

  /* ---------- 走った場所の地名(逆ジオコーディング: OpenStreetMap Nominatim) ---------- */
  const PLACE_URL = 'https://nominatim.openstreetmap.org/reverse';
  function centroid(r) {
    const a = (r.planned && r.planned.length ? r.planned : r.trail) || [];
    if (!a.length) return null;
    return [a.reduce((s, p) => s + p[0], 0) / a.length, a.reduce((s, p) => s + p[1], 0) / a.length];
  }
  /* Nominatimの住所を「国・都道府県・市区町村・地区」にまとめる */
  function parsePlace(j) {
    const a = j.address || {};
    const country = a.country || '', state = a.state || a.province || a.region || a.state_district || '';
    const city = a.city || a.town || a.village || a.municipality || a.county || '';
    const ward = a.city_district || a.borough || '';
    const area = a.suburb || a.neighbourhood || a.quarter || a.hamlet || '';
    const jp = (a.country_code || '').toLowerCase() === 'jp';
    const parts = (jp ? [state, city, ward, area] : [area, ward, city, state, country]).filter(Boolean);
    const uniq = parts.filter((x, i) => x !== parts[i - 1]);
    const text = uniq.join(jp ? '' : ', ') || (j.display_name || '').split(',').slice(0, 3).join(',').trim();
    return { text, country, cc: (a.country_code || '').toUpperCase(), state, city, ward, area };
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const placeBusy = new Set();
  async function fetchPlaceFor(mk, id) {
    const r = runsOf(mk)[id]; if (!r || placeBusy.has(mk + id)) return;
    const c = centroid(r); if (!c) return;
    placeBusy.add(mk + id); refreshPlaceUI(mk, id);
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      try {
        const url = `${PLACE_URL}?format=jsonv2&addressdetails=1&zoom=16&accept-language=ja&lat=${c[0].toFixed(5)}&lon=${c[1].toFixed(5)}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json(); if (j.error) throw new Error(j.error);
        const pl = parsePlace(j); if (!pl.text) throw new Error('地名なし');
        const cur2 = runsOf(mk)[id]; if (cur2) { cur2.place = pl; ok = true; }
        else ok = true;
      } catch (e) { await sleep(1500 * (i + 1)); }     // 使用ルール(1秒に1回まで)を守って少し待ち直す
    }
    placeBusy.delete(mk + id);
    persist();
    refreshPlaceUI(mk, id);
    if (!ok) toast('地名を取得できませんでした（あとで「取得する」を押してください）');
  }
  function refreshPlaceUI(mk, id) {
    const r = runsOf(mk)[id]; if (!r) return;
    const f = $('#sh-place'); if (f && cur === mk && selectedId === +id) {
      f.innerHTML = placeHtml(r, mk + id);
      const pb = f.querySelector('.mini'); if (pb) pb.onclick = () => fetchPlaceFor(mk, id);
    }
    const m = $('#md-place'); if (m && m.dataset.key === mk + ':' + id) {
      m.innerHTML = placeHtml(r, mk + id).replace(/^<br>/, '');
      const pb = m.querySelector('.mini'); if (pb) pb.onclick = () => fetchPlaceFor(mk, id);
    }
    const li = document.querySelector(`.rec[data-key="${mk}:${id}"] .rec-place`);
    if (li) li.textContent = r.place && r.place.text ? '📍 ' + r.place.text : (placeBusy.has(mk + id) ? '📍 取得中…' : '📍 未取得');
  }

  /* ---------- 完成・記録の表示 ---------- */
  function flashPiece(id) {
    const el = document.querySelector(`#board .piece[data-id="${id}"]`);
    if (el) { el.classList.remove('flash'); void el.getBoundingClientRect(); el.classList.add('flash'); }
  }
  function showDone(id, fresh, mk = cur) {
    const p = prefOf(mk, id), r = runsOf(mk)[id]; if (!r) return;
    $('#modal-card').innerHTML =
      `<div class="muted">${fresh ? '🎉 完成しました！' : fmtDate(r.date) + ' の記録'}</div><h2>${p.name}</h2>` +
      `<div class="big-trail">${trailSvg(r.trail, COLORS[p.color], r.planned, 260)}</div>` +
      `<div class="facts">距離 ${fmtKm(r.distanceM)}　時間 ${fmtTime(r.durationS)}　なぞれた割合 ${Math.round((r.coverage || 0) * 100)}%` +
      `<div id="md-place" data-key="${mk}:${id}">${placeHtml(r, mk + id).replace(/^<br>/, '')}</div>` +
      `${r.demo ? '<span class="muted">（デモの記録）</span>' : ''}</div>` +
      `<div class="sheet-actions" style="margin-top:12px"><button id="md-del">この記録を消す</button><button class="primary" id="md-ok">とじる</button></div>`;
    $('#modal').hidden = false;
    const pb = $('#md-place .mini'); if (pb) pb.onclick = () => fetchPlaceFor(mk, id);
    $('#md-ok').onclick = () => { $('#modal').hidden = true; };
    $('#md-del').onclick = () => {
      if (!confirm(`${p.name} の記録を消しますか？`)) return;
      delete runsOf(mk)[id]; persist(); if (cur === mk) renderBoard(); else if (!cur) renderHome(); $('#modal').hidden = true; closeSheet();
    };
  }
  /* 記録一覧(国・地域をまたいで、走った場所つきで一覧) */
  function showList() {
    const items = [];
    for (const m of Object.values(MODES)) for (const [id, r] of Object.entries(runsOf(m.key))) if (DATAS[m.key].byId[id]) items.push({ mk: m.key, id, r, p: DATAS[m.key].byId[id] });
    items.sort((a, b) => b.r.date.localeCompare(a.r.date));
    $('#modal-card').innerHTML = `<h2>記録一覧</h2><div class="muted">${items.length}件</div>` +
      (items.length ? `<div class="rec-list">` + items.map(({ mk, id, r, p }) =>
        `<button class="rec" data-key="${mk}:${id}"><span class="rec-trail">${trailSvg(r.trail, COLORS[p.color], null, 56)}</span>` +
        `<span class="rec-main"><b>${p.name}</b><small>${MODES[mk].home} ・ ${fmtDate(r.date)} ・ ${fmtKm(r.distanceM)}</small>` +
        `<small class="rec-place">${r.place && r.place.text ? '📍 ' + esc(r.place.text) : '📍 未取得'}</small></span></button>`).join('') + '</div>'
        : '<p class="muted">まだ記録がありません。</p>') +
      `<div class="sheet-actions" style="margin-top:12px"><button class="primary" id="md-ok">とじる</button></div>`;
    $('#modal').hidden = false; $('#md-ok').onclick = () => { $('#modal').hidden = true; };
    $('#modal-card .rec-list') && $('#modal-card .rec-list').addEventListener('click', e => {
      const b = e.target.closest('.rec'); if (!b) return; const [mk, id] = b.dataset.key.split(':'); showDone(id, false, mk);
    });
  }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').hidden = true; });

  /* ---------- メニュー(書き出し・読み込み・初期化) ---------- */
  $('#btn-menu').onclick = e => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; };
  document.addEventListener('click', () => { $('#menu').hidden = true; });
  $('#menu-export').onclick = () => {
    const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `hashitte-nihon-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#menu-list').onclick = showList;
  $('#menu-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || typeof j.runs !== 'object') throw new Error('形式が違います');
      save = Object.assign(blankSave(), j); persist(); cur ? renderBoard() : renderHome(); toast('記録を読み込みました');
    } catch (err) { toast('読み込めませんでした: ' + err.message); }
    e.target.value = '';
  };
  $('#menu-reset').onclick = () => {
    if (!confirm('すべての記録を消します。よろしいですか？')) return;
    save = blankSave(); persist(); cur ? renderBoard() : renderHome(); closeSheet();
  };

  /* ---------- 起動 ---------- */
  if (!DEV) { $('.row.sim').hidden = true; $('#src option[value="demo"]').remove(); }
  loadAll().then(() => { renderHome(); show('home'); }).catch(e => {
    $('#home-cards').innerHTML = '<p class="muted" style="padding:16px">データを読み込めませんでした。フォルダで `python -m http.server` を実行し、http://localhost:8000 で開いてください。 ' + esc(e.message) + '</p>';
  });
  window.__app = { save: () => save, byId: () => byId, plan, run, mode: () => cur, view: () => view };   // 動作確認用
})();
