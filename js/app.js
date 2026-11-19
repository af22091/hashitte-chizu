/* はしって日本地図 — 画面とアプリの流れ */
(() => {
  'use strict';
  const RE = window.RouteEngine;
  const COLORS = ['#ff6b81', '#ffb703', '#22c493', '#a27bff', '#ff9ad5'];
  const SIZES = { s: 1000, m: 1500, l: 2000 };            // 形の最長辺(m)
  const STORE_KEY = 'hashitte-nihon-v1';
  /* ---------- ユーザー設定(この端末の中だけに保存) ---------- */
  const SET_KEY = 'hashitte-settings-v1', APP_VER = '2026.11.18';
  const SET_DEF = { nick: '', units: 'km', autoLocate: true, autoNav: true, keepAwake: true, vibrate: true, voice: false, motion: true };
  let settings = Object.assign({}, SET_DEF);
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { /* 既定 */ }
  const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* なし */ } };
  FX.setEnabled(settings.motion !== false);
  const U = () => (settings.units === 'mi' ? { f: 0.621371, n: 'mi' } : { f: 1, n: 'km' });
  const kmTxt = (km, d = 1) => (km * U().f).toFixed(d) + U().n;
  const buzz = p => { if (settings.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* なし */ } };
  const DEFAULT_START = [35.6762, 139.6503];              // 場所が未設定のときの地図の中心(東京)
  const DEV = new URLSearchParams(location.search).has('dev');   // ?dev=1 のときだけ、デモ道路とシミュレーション走行が使える
  const $ = s => document.querySelector(s);
  const tick = () => new Promise(r => setTimeout(r, 0));

  /* ---------- モード(日本 / 世界) ---------- */
  const MODES = {
    jp: { key: 'jp', title: 'はしって日本地図', home: '日本', file: 'data/prefectures.json', runs: 'runs', unit: '県', font: 8.5,
      hint: '走りたい県をタップ。ピンチで拡大もできます', searchPh: '県の名前で探す' },
    world: { key: 'world', title: 'はしって世界地図', home: '世界', file: 'data/world.json', runs: 'worldRuns', unit: '国', font: 7,
      hint: '走りたい国をタップ。ピンチで拡大・検索もできます', searchPh: '国の名前で探す(日本語・英語)' },
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
    const el = $('#toast'); el.textContent = t; el.hidden = false; el.classList.remove('out'); void el.offsetWidth; el.classList.add('in');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('in', 'out'); }, 260); }, 3200);
  }
  function haversine(a, b) {
    const R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = m => kmTxt(m / 1000, 2);
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
      DATAS[m.key] = { data: d, prefs: d.prefs, byId: Object.fromEntries(d.prefs.map(p => [p.id, p])) }; I18N.names(d.prefs);
    }));
  }
  const prefOf = (mk, id) => DATAS[mk].byId[id];
  /* 形の大きさ(m)。細長い国は少し大きめにする */
  const sizeOf = (p, key) => Math.min(SIZES[key] * (p.scale || 1), MAX_SIZE_M);

  /* ---------- 音楽 ---------- */
  $('#btn-music').onclick = () => { Music.unlock(); Music.toggle(); };
  const unlockOnce = e => { if (e && e.target && e.target.closest && e.target.closest('#btn-music')) return; Music.unlock(); window.removeEventListener('pointerdown', unlockOnce); window.removeEventListener('keydown', unlockOnce); };
  window.addEventListener('pointerdown', unlockOnce); window.addEventListener('keydown', unlockOnce);
  Music.refresh();

  /* ---------- ホーム(モード選択) ---------- */
  function thumb(mk) {
    const D = DATAS[mk], runs = runsOf(mk), [x0, y0, w, h] = D.data.viewBox;
    let html = `<svg viewBox="${x0} ${y0} ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
    for (const p of D.prefs) html += `<path d="${p.d}" fill="${runs[p.id] ? COLORS[p.color] : '#fff'}" stroke="#1c1b22" stroke-width="${mk === 'world' ? 0.35 : 0.9}" stroke-linejoin="round"/>`;
    return html + '</svg>';
  }
  function renderHome() {
    renderHomeStat();
    $('.home-lead').textContent = settings.nick ? `${settings.nick}さん、どの地図を走る？` : 'どの地図を走る？';
    $('#home-cards').innerHTML = Object.values(MODES).map(m => {
      const D = DATAS[m.key], n = Object.keys(runsOf(m.key)).filter(id => D.byId[id]).length, tot = D.prefs.length;
      return `<button class="mode-card stag" style="--i:${m.key === 'world' ? 1 : 0}" data-mode="${m.key}"><div class="mode-thumb">${thumb(m.key)}</div>` +
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
    fitBase();
  }
  /* 地図の実際の大きさに、表示範囲をぴったり合わせる(余白を詰めて、最初から大きく見せる) */
  function fitBase() {
    try {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      $('#board').querySelectorAll('.piece, .frame').forEach(el => { const q = el.getBBox(); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.width); y1 = Math.max(y1, q.y + q.height); });
      const bb = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }; if (!(bb.width > 0 && bb.height > 0)) return;
      const px = bb.width * 0.012, py = bb.height * 0.012;
      const W0 = bb.width + 2 * px, H0 = bb.height + 2 * py;
      // 画面の縦横比に合わせて表示範囲を作る(縦長のスマホでも、地図が小さく余白だらけにならない)
      const r = $('#board').getBoundingClientRect(), a = (r.width > 50 && r.height > 50) ? r.width / r.height : innerWidth / Math.max(300, innerHeight - 200);
      let bw = W0, bh = H0; if (W0 / H0 < a) bw = H0 * a; else bh = W0 / a;
      base = { x: bb.x + bb.width / 2 - bw / 2, y: bb.y + bb.height / 2 - bh / 2, w: bw, h: bh };
      view = Object.assign({}, base);
      if (cur === 'world' && a < 0.9) {                     // 世界地図は縦長画面だと小さすぎるので、最初から拡大して中央(ヨーロッパ〜アジア)を見せる
        const vw = W0 / 2.3, vh = vw / a;
        view = { x: bb.x + bb.width * 0.56 - vw / 2, y: bb.y + bb.height * 0.5 - vh / 2, w: vw, h: vh };
      }
      applyView();
    } catch (e) { /* 元の表示範囲のまま */ }
  }
  function goHome() {
    cur = null; closeSheet(); show('home'); renderHome();
  }
  $('#btn-home').onclick = async () => {
    if (mode === 'run' && run.tracker.progress > 0.05 && !await askConfirm('ホーム（日本・世界の選択）にもどりますか？', 'ここまでの記録は保存されません。', 'ホームにもどる', 'このまま走る')) return;
    if (mode === 'plan' && plan.routes.length && !await askConfirm('ホーム（日本・世界の選択）にもどりますか？', 'いま表示しているコースは消えます。<br>（あとで「前回作ったコース」から呼び戻せます）', 'ホームにもどる', 'コースの画面にとどまる')) return;
    if (mode === 'run') $('#btn-quit').dataset.force = '1', $('#btn-quit').click();
    if (mode === 'plan') { clearCourse(); leaveMap(); }
    goHome();
  };

  /* ---------- ① パズル盤(拡大・移動つき) ---------- */
  let selectedId = null, view = null, base = null;
  function renderBoard() {
    if (!cur) return;
    const [x0, y0, w, h] = data.viewBox, runs = RUNS();
    let html = `<rect class="ocean" x="${x0}" y="${y0}" width="${w}" height="${h}"/>`;
    if (data.inset) { const [ix, iy, iw, ih] = data.inset; html += `<path class="frame" d="M${ix},${iy + ih} L${ix},${iy} L${ix + iw},${iy}"/>`; }
    for (const p of prefs) {
      const done = !!runs[p.id];
      html += `<path class="piece${done ? ' done' : ''}${selectedId === p.id ? ' sel' : ''}" data-id="${p.id}" d="${p.d}"` +
        (done ? ` style="fill:${COLORS[p.color]}"` : '') + '/>';
    }
    for (const p of prefs) html += `<text class="lab" data-id="${p.id}" data-lz="${p.lz || 1}" x="${p.label[0]}" y="${p.label[1]}">${p.short}</text>`;
    $('#board').innerHTML = html;
    labOrder = null;
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
    if (!declutterQ) declutterQ = requestAnimationFrame(declutter);
  }
  /* 文字が重なるときは、大きい国から順に残して、重なる小さい国の名前は隠す(タップ・マウスを乗せると名前が出る) */
  let labOrder = null, declutterQ = 0;
  function declutter() {
    declutterQ = 0;
    const svg = $('#board'); if (!svg || !svg.isConnected) return;
    if (!labOrder) {
      const area = {};
      svg.querySelectorAll('.piece').forEach(el => { try { const b = el.getBBox(); area[el.dataset.id] = b.width * b.height; } catch (e) { area[el.dataset.id] = 0; } });
      labOrder = [...svg.querySelectorAll('.lab')].sort((a, b) => (area[b.dataset.id] || 0) - (area[a.dataset.id] || 0));
    }
    const vis = labOrder.filter(el => el.style.display !== 'none');
    if (selectedId) vis.sort((a, b) => (b.dataset.id === selectedId) - (a.dataset.id === selectedId));
    const rects = vis.map(el => el.getBoundingClientRect()), placed = [];
    vis.forEach((el, i) => {
      const r = rects[i], m = 2;
      const hit = placed.some(q => r.left < q.right + m && r.right > q.left - m && r.top < q.bottom + m && r.bottom > q.top - m);
      if (hit) el.style.display = 'none'; else placed.push(r);
    });
  }
  /* マウスを乗せた国の名前を、ふきだしで出す */
  const hoverTip = document.createElement('div'); hoverTip.id = 'hover-tip'; hoverTip.hidden = true; document.body.appendChild(hoverTip);
  $('#board').addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) { hoverTip.hidden = true; return; }
    const t = e.target.closest && e.target.closest('.piece');
    if (!t) { hoverTip.hidden = true; return; }
    const p = byId[t.dataset.id]; if (!p) { hoverTip.hidden = true; return; }
    hoverTip.textContent = p.name || p.short; hoverTip.hidden = false;
    hoverTip.style.left = Math.min(window.innerWidth - 150, e.clientX + 14) + 'px'; hoverTip.style.top = (e.clientY + 16) + 'px';
  });
  $('#board').addEventListener('pointerleave', () => { hoverTip.hidden = true; });
  window.addEventListener('resize', () => { if (cur && $('#screen-board').classList.contains('active')) fitBase(); });
  function clampView() {
    view.w = Math.min(base.w, Math.max(base.w / 20, view.w)); view.h = view.w * base.h / base.w;
    view.x = Math.min(base.x + base.w - view.w, Math.max(base.x, view.x));
    view.y = Math.min(base.y + base.h - view.h * (view.w < base.w ? 0.6 : 1), Math.max(base.y, view.y));   // 拡大中は下に余白を許す(シートに隠れる端の県を見せるため)
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
  $('#z-in').onclick = () => zoomCenter(1.35);
  $('#z-out').onclick = () => zoomCenter(1 / 1.35);
  $('#z-reset').onclick = () => { view = Object.assign({}, base); applyView(); };
  $('#board').addEventListener('wheel', e => {
    e.preventDefault(); const p = svgPt(e.clientX, e.clientY); zoomAt(p.x, p.y, Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.0012));
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
    const z = Math.min(12, Math.max(1.6, Math.min(base.w / (bb.width * 3.2), base.h / (bb.height * 3.2))));
    view.w = base.w / z; view.h = base.h / z; view.x = cx - view.w / 2; view.y = cy - view.h * 0.36;   // 下のシートに隠れないよう、少し上寄りに表示
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
    let body = `<div class="sheet-title"><h2>${p.name}${p.en && I18N.lang !== 'en' ? ` <small class="muted">${p.en}</small>` : ''}</h2><span class="stars" title="形の難しさ">${stars(p.level)}</span></div>`;
    if (run) {
      body += `<div class="sheet-body-row"><div class="trail-prev">${trailSvg(run.trail, COLORS[p.color], run.planned, 110)}</div>` +
        `<div class="facts" id="sh-facts">完成 ${fmtDate(run.date)}<br>距離 ${fmtKm(run.distanceM)}<br>時間 ${fmtTime(run.durationS)}<span id="sh-place">${placeHtml(run, cur + id)}</span>${run.demo ? '<br><span class="muted">（デモの記録）</span>' : ''}</div></div>` +
        `<div class="sheet-actions"><button id="sh-view">記録を見る</button><button class="primary" id="sh-run">もう一度走る</button></div>`;
    } else {
      body += `<div class="facts" style="margin:10px 0">目安の距離: 小 約${kmTxt(estKm(p, 's'))} ／ 中 約${kmTxt(estKm(p, 'm'))} ／ 大 約${kmTxt(estKm(p, 'l'))}</div>` +
        `<div class="sheet-actions"><button class="primary" id="sh-run">この${u}を走る</button></div>`;
    }
    $('#sheet-body').innerHTML = body; $('#sheet').hidden = false;
    $('#sh-run').onclick = () => openPlan(id);
    const v = $('#sh-view'); if (v) v.onclick = () => showDone(id, false);
    const pb = $('#sh-place .mini'); if (pb) pb.onclick = () => fetchPlaceFor(cur, id);
  }
  FX.sheetSwipe($('#sheet'), closeSheet);
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
    if (name === 'board' && cur) requestAnimationFrame(() => fitBase());
    { const sc = $('#screen-' + name); if (sc) { if (name === 'map') FX.reveal(sc); else sc.classList.remove('enter'), void sc.offsetWidth, sc.classList.add('enter'); } }
    if (name !== 'map') Music.scene('calm');
    $('#counter').hidden = name === 'home';
    if (name === 'home') { $('#top h1').textContent = 'はしって地図あつめ'; document.title = 'はしって地図あつめ'; }
  }
  function ensureMap() {
    if (map) return;
    map = L.map('map', { zoomControl: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 160, wheelDebounceTime: 60 });
    /* 地図は2種類: 「地図」(標準) / 「航空写真」 */
    const bases = {
      '地図': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }),
      '航空写真': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
    };
    let pick = '地図'; try { pick = localStorage.getItem('hashitte-basemap4') || pick; } catch (e) { /* 既定 */ }
    if (!bases[pick]) pick = '地図';
    bases[pick].addTo(map);
    L.control.layers(bases, null, { position: 'topright', collapsed: true }).addTo(map);
    map.on('baselayerchange', e => { try { localStorage.setItem('hashitte-basemap4', e.name); } catch (err) { /* なし */ } });
    planLayer = L.layerGroup().addTo(map); runLayer = L.layerGroup().addTo(map);
    const s = save.lastStart || DEFAULT_START;
    map.setView(s, 15);
    map.on('click', async e => { if (mode !== 'plan' || plan.busy) return; if (!await guardCourse()) return; plan.touched = true; setStart([e.latlng.lat, e.latlng.lng]); });
  }

  const boardName = () => (cur === 'world' ? '世界地図' : '日本地図');
  /* ---------- 確認ダイアログ(まちがい防止) ---------- */
  function askConfirm(title, body, okLabel, cancelLabel) {
    return new Promise(res => {
      const m = $('#modal'), c = $('#modal-card'), prev = c.innerHTML, prevHidden = m.hidden;
      c.innerHTML = `<h2 style="font-size:20px">${title}</h2><p class="muted" style="line-height:1.7">${body}</p>` +
        `<div class="row" style="gap:10px;margin-top:14px"><button id="cf-no" style="flex:1">${cancelLabel || 'もどる'}</button><button id="cf-ok" class="primary" style="flex:1">${okLabel || 'OK'}</button></div>`;
      m.hidden = false;
      const done = v => { m.removeEventListener('click', bg, true); c.innerHTML = prev; m.hidden = prevHidden; res(v); };
      const bg = e => { if (e.target === m) { e.stopPropagation(); done(false); } };
      m.addEventListener('click', bg, true);
      $('#cf-ok').onclick = () => done(true); $('#cf-no').onclick = () => done(false);
    });
  }
  /* 作ったコースがあるとき、消える操作の前に確認する */
  async function guardCourse() {
    if (!plan.routes.length) return true;
    const ok = await askConfirm('作ったコースが消えます', 'このまま進むと、いま表示しているコースは消えます。<br>（あとで「前回作ったコース」から呼び戻せます）', '消して進む', 'コースを残す');
    if (ok) clearCourse();
    return ok;
  }
  function clearCourse() {
    stopRunner();
    plan.routes = []; planLayer && planLayer.clearLayers(); $('#plan-results').hidden = true;
    $('#panel-plan').classList.remove('compact'); $('#btn-opts').hidden = true; refreshDraft();
  }
  window.addEventListener('beforeunload', e => { if ((mode === 'plan' && plan.routes.length) || mode === 'run') { e.preventDefault(); e.returnValue = ''; } });
  history.replaceState({ a: 1 }, ''); history.pushState({ a: 2 }, '');
  window.addEventListener('popstate', () => {          // 端末の「戻る」を押しても、すぐには画面を離れない
    history.pushState({ a: 2 }, '');
    if (!$('#nav').hidden) return closeNav();
    if ($('#view3d') && !$('#view3d').hidden) return close3d();
    if (mode === 'run') $('#run-back').click();
    else if (mode === 'plan') $('#plan-back').click();
    else if (cur) goHome();
  });

  /* ---------- ② コース作成 ---------- */
  let mode = 'board';
  const plan = { pref: null, size: 'm', start: null, routes: [], sel: 0, lat0: 0, lon0: 0, busy: false, token: 0 };

  function openPlan(id) {
    closeSheet(); mode = 'plan';
    plan.pref = byId[id]; plan.routes = []; plan.sel = 0;
    show('map'); runLayer.clearLayers(); planLayer.clearLayers();
    $('#panel-run').hidden = true; $('#panel-plan').hidden = false;
    $('#plan-title').textContent = plan.pref.name + ' を走る'; plan.mk = cur;
    $('#plan-results').hidden = true; $('#plan-msg').textContent = ''; $('#loading').hidden = true;
    $('#panel-plan').classList.remove('compact'); $('#btn-opts').hidden = true;
    setStart(save.lastStart || DEFAULT_START, true);
    plan.touched = false; locateStart();
    $('#plan-back').textContent = `← ${boardName()}にもどる`;
    updateEst(); refreshDraft();
  }
  /* 作ったコースの控え: 消してしまっても12時間は呼び戻せる */
  const r1 = n => +n.toFixed(1);
  function saveDraft() {
    save.draft = { mk: cur, id: plan.pref.id, size: plan.size, lat0: plan.lat0, lon0: plan.lon0, t: Date.now(),
      routes: plan.routes.map(r => ({ pts: r.pts.map(p => [r1(p[0]), r1(p[1])]), ideal: r.ideal.map(p => [r1(p[0]), r1(p[1])]),
        iou: r.iou, lengthM: r.lengthM, dev95: r.dev95, angle: r.angle, startDist: r.startDist })) };
    persist();
  }
  function refreshDraft() {
    const d = save.draft, b = $('#btn-draft');
    const ok = d && plan.pref && d.mk === cur && d.id === plan.pref.id && Date.now() - d.t < 12 * 3600e3 && !plan.routes.length;
    b.hidden = !ok; if (!ok) return;
    const m = Math.max(1, Math.round((Date.now() - d.t) / 60000));
    b.textContent = `🕘 前回作ったコースを使う（${m < 60 ? m + '分前' : Math.round(m / 60) + '時間前'}）`;
  }
  $('#btn-draft').onclick = () => {
    const d = save.draft; if (!d) return;
    plan.size = d.size; document.querySelectorAll('#size-seg button').forEach(x => x.classList.toggle('on', x.dataset.s === d.size)); updateEst();
    setStart(RE.toLatLng(0, 0, d.lat0, d.lon0), true);
    plan.routes = d.routes; plan.sel = 0; plan.lat0 = d.lat0; plan.lon0 = d.lon0; plan.demo = false;
    $('#btn-draft').hidden = true; showRoutes();
  };
  function setStart(ll, recenter) {
    plan.start = ll; save.lastStart = ll; persist();
    if (!startMarker) {
      startMarker = L.marker(ll, { draggable: true, icon: L.divIcon({ className: '', html: '<div class="start-pin">📍</div>', iconSize: [26, 26], iconAnchor: [13, 24] }) }).addTo(map);
      startMarker.on('dragend', async () => {
        const p = startMarker.getLatLng();
        if (plan.routes.length && !await guardCourse()) { startMarker.setLatLng(plan.start); return; }
        plan.touched = true;
        setStart([p.lat, p.lng]);
      });
    } else startMarker.setLatLng(ll);
    if (!startMarker._map) startMarker.addTo(map);
    if (recenter) map.setView(ll, 15);
  }
  function updateEst() {
    const p = plan.pref; if (!p) return;
    $('#plan-est').textContent = `${kmTxt(sizeOf(p, plan.size) / 1000)}四方・走る距離の目安 約${kmTxt(estKm(p, plan.size))}`;
  }
  $('#size-seg').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || b.dataset.s === plan.size) return;
    if (!await guardCourse()) return;
    plan.size = b.dataset.s;
    document.querySelectorAll('#size-seg button').forEach(x => x.classList.toggle('on', x === b));
    updateEst();
  });
  /* 地図画面を開いたら、まず現在地にピンを立てる(許可されていない・取得できないときは、前回の場所のまま) */
  /* 場所の検索(OpenStreetMap Nominatim)→ 結果をタップでスタート地点に */
  $('#place-form').addEventListener('submit', async e => {
    e.preventDefault(); const q = $('#place-q').value.trim(), box = $('#place-res'); if (!q) return;
    box.hidden = false; box.innerHTML = '<div class="muted">検索中…</div>'; $('#place-go').disabled = true;
    try {
      const c = map ? map.getCenter() : null;
      const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=' + I18N.lang + '&q=' + encodeURIComponent(q) + (c ? `&viewbox=${c.lng - 1},${c.lat + 1},${c.lng + 1},${c.lat - 1}` : '');
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      box.innerHTML = j.length ? j.map((x, i) => `<button type="button" data-i="${i}"><b>${esc((x.display_name || '').split(',')[0])}</b><small>${esc((x.display_name || '').split(',').slice(1, 4).join(' '))}</small></button>`).join('') : '<div class="muted">見つかりませんでした。別の言葉でお試しください。</div>';
      box.onclick = async ev => {
        const b = ev.target.closest('button[data-i]'); if (!b) return; const x = j[+b.dataset.i], ll = [+x.lat, +x.lon];
        if (plan.routes.length && !await guardCourse()) return;
        if (plan.busy) return; plan.touched = true;
        setStart(ll, true); map.setView(ll, 15); box.hidden = true; toast('スタートを設定しました');
      };
    } catch (er) { box.innerHTML = '<div class="muted">検索できませんでした。通信を確認してもう一度お試しください。</div>'; }
    finally { $('#place-go').disabled = false; }
  });
  function locateStart() {
    if (!navigator.geolocation || !settings.autoLocate) return;
    const cur0 = plan.pref && plan.pref.id;
    navigator.geolocation.getCurrentPosition(p => {
      const ll = [p.coords.latitude, p.coords.longitude];
      if (window.Theme) Theme.setLocation(ll[0], ll[1]);
      if (mode !== 'plan' || !plan.pref || plan.pref.id !== cur0 || plan.touched || plan.routes.length || plan.busy) return;   // もう自分で選んだ後は動かさない
      setStart(ll, true);
    }, () => { /* 許可なし・失敗: そのまま */ }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  $('#btn-here').onclick = async () => {
    if (!await guardCourse()) return;
    if (!navigator.geolocation) return toast('この端末では現在地を取得できません');
    navigator.geolocation.getCurrentPosition(
      p => { plan.touched = true; if (window.Theme) Theme.setLocation(p.coords.latitude, p.coords.longitude); setStart([p.coords.latitude, p.coords.longitude], true); },
      err => toast('現在地を取得できませんでした: ' + err.message), { enableHighAccuracy: true, timeout: 12000 });
  };
  $('#plan-back').onclick = async () => {
    if (plan.routes.length && !await askConfirm(`${boardName()}の画面にもどりますか？`, 'いま表示しているコースは消えます。<br>（あとで「前回作ったコース」から呼び戻せます）', `${boardName()}にもどる`, 'コースの画面にとどまる')) return;
    clearCourse(); leaveMap();
  };
  function leaveMap() {
    stopRunner();
    mode = 'board'; if (startMarker) { startMarker.remove(); }
    planLayer && planLayer.clearLayers(); runLayer && runLayer.clearLayers();
    show('board'); renderBoard();
  }
  /* 待ち時間の演出: 走る形が線で描かれ、その上を点が走る。ヒントも入れ替わる */
  const TIPS = [
    '赤い線が、これから走る道です。紫の点線が目標の形。',
    '案は3つ作ります。再現度が高いものを選びましょう。',
    '大きさを「小」にすると、短い距離で走れます。',
    '道が少ない場所だと、形が崩れやすくなります。',
    '走り終えると、走った場所の地名も記録されます。',
    'ゆっくり歩いても完成します。ただしコースは順番どおりに。',
    'スタート地点に着くと、自動で記録が始まります。',
  ];
  let tipTimer = null, tipI = 0, tips = TIPS;
  function outlineSvg(outline) {
    const pts = outline.map(([x, y]) => [50 + x * 76, 50 - y * 76]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('') + 'Z';
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="${d}" fill="rgba(232,56,79,.08)" stroke="#dbe5ec" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path id="loader-path" class="loader-line" pathLength="1" d="${d}" fill="none" stroke="#e8384f" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle r="3.6" fill="#1e88e5" stroke="#fff" stroke-width="1.6"><animateMotion dur="2.6s" repeatCount="indefinite" calcMode="linear"><mpath href="#loader-path"/></animateMotion></circle></svg>`;
  }
  function startLoader() {
    $('#loader-shape').innerHTML = plan.pref ? outlineSvg(plan.pref.outline) : '';
    tips = (window.TRIVIA_JP && cur === 'jp' && plan.pref && TRIVIA_JP[plan.pref.short] ? ['🗾 ' + TRIVIA_JP[plan.pref.short]] : []).concat(TIPS);
    $('#ld-title').textContent = (plan.pref ? plan.pref.name : '') + 'のコースを作っています';
    tipI = 0; $('#loader-tip').textContent = tips[0];
    clearInterval(tipTimer);
    tipTimer = setInterval(() => {
      const el = $('#loader-tip'); el.classList.add('out');
      setTimeout(() => { tipI = (tipI + 1) % tips.length; el.textContent = tips[tipI]; el.classList.remove('out'); }, 250);
    }, 4000);
  }
  function stopLoader() {
    clearInterval(tipTimer); tipTimer = null; MiniGame.stop(); $('#game').hidden = true; $('#game-help').hidden = true; $('#ld-open').hidden = true;
    document.querySelectorAll('.ld-game-tabs button').forEach(x => x.classList.remove('on'));
  }
  const GAME_HELP = {
    jump: '遊び方：画面をタップでジャンプ。障害物をよけて、できるだけ遠くまで走ろう。',
    stop: '遊び方：左右に動くランナーを、タップで止めます。緑の旗の枠の中で止まれば得点（真ん中ほど高得点）。3回はずすとおしまい。',
    mole: '遊び方：出てきたもぐらをタップ！ 早くたたくほど高得点。',
  };
  $('.ld-game-tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const cv = $('#game');
    const hp = $('#game-help');
    if (b.classList.contains('on')) { MiniGame.stop(); cv.hidden = true; hp.hidden = true; b.classList.remove('on'); return; }   // もう一度押すと、とじる
    document.querySelectorAll('.ld-game-tabs button').forEach(x => x.classList.toggle('on', x === b));
    cv.hidden = false; hp.hidden = false; hp.textContent = GAME_HELP[b.dataset.g]; MiniGame.start(cv, b.dataset.g);
    cv.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('#ld-cancel').onclick = async () => {
    if (!await askConfirm('コース作成をやめますか？', 'ここまでの作成は中止されます。', 'やめる', '続ける')) return;
    plan.token++; plan.busy = false; Music.scene('calm'); $('#btn-make').disabled = false; $('#btn-make').textContent = 'コースを作る'; $('#loading').hidden = true; stopLoader();
  };
  function progress(f, text) {
    if ($('#loading').hidden) { $('#loading').hidden = false; startLoader(); }
    $('#loading .bar i').style.width = Math.round(f * 100) + '%';
    $('#loader-pct').textContent = Math.round(f * 100) + '%';
    if (text) $('#loader-phase').textContent = text;
  }
  $('#btn-make').onclick = makeCourse;
  /* 道路データのキャッシュ(IndexedDB): 近い場所・同じ大きさなら再取得しない */
  const RoadCache = {
    open() {
      return new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no idb'));
        const q = indexedDB.open('hashitte-roads', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('r', { keyPath: 't' });
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
    },
    async all() { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('r').objectStore('r').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async get(lat, lon, r) {
      try {
        const near = (await this.all()).filter(x => x.r >= r * 0.98 && Math.hypot((x.lat - lat) * 111000, (x.lon - lon) * 91000) < 80 && Date.now() - x.t < 7 * 864e5);
        return near.length ? near[0].json : null;
      } catch (e) { return null; }
    },
    async put(lat, lon, r, json) {
      try {
        const db = await this.open(), all = (await this.all()).sort((a, b) => a.t - b.t);
        const tx = db.transaction('r', 'readwrite'), st = tx.objectStore('r');
        all.slice(0, Math.max(0, all.length - 3)).forEach(x => st.delete(x.t));     // 古いものは捨てて、直近4件まで
        st.put({ t: Date.now(), lat, lon, r, json });
      } catch (e) { /* 保存できなくても続行 */ }
    },
  };
  async function makeCourse() {
    if (plan.busy) return;
    const sizeM = sizeOf(plan.pref, plan.size), [lat0, lon0] = plan.start, src = $('#src').value;
    plan.busy = true; const tok = ++plan.token; Music.scene('work'); $('#btn-make').disabled = true; $('#btn-make').textContent = '作成中…'; $('#plan-msg').textContent = '';
    $('#plan-results').hidden = true; planLayer.clearLayers();
    try {
      let g;
      if (src === 'demo') {
        progress(0.05, 'デモの道路網を作成中…'); await tick();
        g = RE.syntheticGraph(sizeM * 1.2 + 1500, 1);
      } else {
        progress(0.03, '道路データを取得中…（数秒〜数十秒かかることがあります）');
        const rad = sizeM * 0.95 + 150;
        let json = await RoadCache.get(lat0, lon0, rad);              // 同じ場所を続けて試すときは、保存した道路データを使う(待ち時間ゼロ)
        if (json) progress(0.1, '前回取得した道路データを使います');
        else { json = await RE.fetchRoads(lat0, lon0, rad, { onStatus: t => progress(0.05, t) }); RoadCache.put(lat0, lon0, rad, json); }
        progress(0.12, '道路網を作成中…'); await tick();
        g = RE.buildGraphFromOverpass(json, lat0, lon0);
      }
      const routes = await RE.generate({
        graph: g, outline: plan.pref.outline, sizeM, start: [0, 0],
        onProgress: (f, t) => progress(0.15 + 0.85 * f, t),
      });
      if (tok !== plan.token) return;
      plan.routes = routes; plan.sel = 0; plan.lat0 = lat0; plan.lon0 = lon0; plan.demo = src === 'demo';
      Music.sfx('ok'); saveDraft(); showRoutes();
      if (!$('#game').hidden && !$('#loading').hidden) {      // ゲーム中は、勢いで押してもコース画面に移らないよう、ボタンで進む
        MiniGame.stop(); $('#game').hidden = true; $('#game-help').hidden = true;
        $('#loader-phase').textContent = '🎉 コースができました！'; $('#loading .bar i').style.width = '100%'; $('#loader-pct').textContent = '100%';
        const ob = $('#ld-open'); ob.hidden = false; ob.disabled = true; setTimeout(() => { ob.disabled = false; }, 1200);
        ob.onclick = () => { $('#loading').hidden = true; stopLoader(); };
        plan.holdLoader = true;
      }
    } catch (e) {
      if (tok !== plan.token) return;
      FX.shake($('#plan-msg')); $('#plan-msg').textContent = e.message + (src === 'osm' ? '。大きさを「小」にするか、道路の少ない場所で試すか、少し待ってからもう一度お試しください。「デモ」ならネットなしで動きます。' : '');
    } finally {
      if (tok === plan.token) { plan.busy = false; if (plan.holdLoader) { plan.holdLoader = false; } else { $('#loading').hidden = true; stopLoader(); } Music.scene('calm'); $('#btn-make').disabled = false; $('#btn-make').textContent = 'コースを作る'; }
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
      b.innerHTML = `案${i + 1}<br>${Math.round(r.iou * 100)}% ・ ${kmTxt(r.lengthM / 1000)}`;
      b.onclick = () => { plan.sel = i; showRoutes(); }; chips.appendChild(b);
    });
    const r = plan.routes[plan.sel];
    planLayer.clearLayers();
    const ideal = L.polygon(toLL(r.ideal, plan.lat0, plan.lon0), { color: '#7b3fe4', weight: 2, dashArray: '6 6', fill: false });
    const ll = toLL(r.pts.concat([r.pts[0]]), plan.lat0, plan.lon0);
    planLayer.addLayer(L.polyline(ll, { color: '#fff', weight: 9, opacity: .95, lineJoin: 'round' }));   // 白い縁取りで、地図の上でも線がくっきり見える
    const line = L.polyline(ll, { color: '#e8384f', weight: 5, opacity: .95, lineJoin: 'round' });
    planLayer.addLayer(ideal); planLayer.addLayer(line);
    map.fitBounds(line.getBounds(), fitPad()); startRunner(ll);
    $('#plan-info').textContent = `再現度 ${Math.round(r.iou * 100)}%（紫の点線が目標の形）・走る距離 約${kmTxt(r.lengthM / 1000)}` + (plan.demo ? '・デモ道路' : '');
    $('#plan-results').hidden = false;
    $('#panel-plan').classList.add('compact'); $('#btn-opts').hidden = false;   // 設定欄をたたんで地図を広く
  }
  let runnerRaf = 0;
  function stopRunner() { cancelAnimationFrame(runnerRaf); runnerRaf = 0; }
  function startRunner(ll) {                                 // 人型アイコンがコースを一周なぞる
    stopRunner();
    const cum = [0]; for (let i = 1; i < ll.length; i++) cum.push(cum[i - 1] + Math.hypot(ll[i][0] - ll[i - 1][0], ll[i][1] - ll[i - 1][1]));
    const total = cum[cum.length - 1] || 1;
    const mk = L.marker(ll[0], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: '<div class="runner">🏃</div>', iconSize: [30, 30], iconAnchor: [15, 22] }) });
    planLayer.addLayer(mk);
    const trail = L.polyline([ll[0]], { color: '#ffd23f', weight: 5, opacity: .95, lineJoin: 'round' }); planLayer.addLayer(trail);
    const dur = 9000; let t0 = performance.now(), i = 1;
    const tick = now => {
      if (!mk._map) return;
      const f = ((now - t0) % (dur + 1500)) / dur;
      if (f >= 1) { mk.setLatLng(ll[ll.length - 1]); runnerRaf = requestAnimationFrame(tick); return; }
      const d = f * total; let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
      const u = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1), a = ll[k - 1], b = ll[k];
      const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      mk.setLatLng(p); trail.setLatLngs(ll.slice(0, k).concat([p]));
      runnerRaf = requestAnimationFrame(tick);
    };
    runnerRaf = requestAnimationFrame(tick);
  }
  $('#btn-opts').onclick = () => { $('#panel-plan').classList.remove('compact'); $('#btn-opts').hidden = true; };
  $('#btn-go').onclick = () => { stopRunner(); openRun(plan.routes[plan.sel]); };

  /* ---------- 3D・衛星ビューア: 作ったコースの上空を、一周ぶん飛んで見られる ---------- */
  let v3 = null, v3raf = 0, v3play = true, v3style = 'map', v3t = 0;
  function v3msg(t) { const m = $('#v3-msg'); m.textContent = t || ''; m.hidden = !t; }
  function close3d() {
    cancelAnimationFrame(v3raf); $('#view3d').hidden = true;
    if (v3) { try { v3.remove(); } catch (e) { /* なし */ } v3 = null; }
  }
  let v3vis = {};
  function applyV3Style() {
    document.querySelectorAll('#v3-style button').forEach(b => b.classList.toggle('on', b.dataset.st === v3style));
    if (!v3) return;
    const sat = v3style === 'sat';
    try {
      if (v3.getLayer('esri')) v3.setLayoutProperty('esri', 'visibility', sat ? 'visible' : 'none');
      if (v3.getLayer('osm')) v3.setLayoutProperty('osm', 'visibility', sat ? 'none' : 'visible');
      for (const l of v3.getStyle().layers) {
        if (['background', 'fill', 'line', 'fill-extrusion'].includes(l.type) && !l.id.startsWith('route') && l.id !== 'esri' && l.id !== 'osm') {
          if (!(l.id in v3vis)) v3vis[l.id] = (l.layout && l.layout.visibility) || 'visible';
          v3.setLayoutProperty(l.id, 'visibility', sat ? 'none' : v3vis[l.id]);
        }
      }
    } catch (e) { /* 読み込み中は次の機会に反映 */ }
  }
  $('#v3-style').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; v3style = b.dataset.st; applyV3Style(); if (v3) { v3.once('idle', applyV3Style); v3.triggerRepaint(); } });
  $('#v3-close').onclick = close3d;
  $('#v3-play').onclick = () => { v3play = !v3play; $('#v3-play').textContent = v3play ? '⏸' : '▶'; };
  $('#btn-3d').onclick = () => {
    const r = plan.routes[plan.sel]; if (!r) return;
    if (!window.maplibregl) return toast('3D表示を読み込めませんでした');
    v3vis = {}; $('#view3d').hidden = false; v3msg('3D地図を読み込み中…'); v3play = true; $('#v3-play').textContent = '⏸'; v3t = 0;
    const ll = toLL(r.pts.concat([r.pts[0]]), plan.lat0, plan.lon0).map(p => [p[1], p[0]]);
    const cum = [0]; for (let i = 1; i < ll.length; i++) cum.push(cum[i - 1] + haversine([ll[i - 1][1], ll[i - 1][0]], [ll[i][1], ll[i][0]]));
    const total = cum[cum.length - 1] || 1;
    const at = d => { d = ((d % total) + total) % total; let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [ll[i - 1][0] + (ll[i][0] - ll[i - 1][0]) * f, ll[i - 1][1] + (ll[i][1] - ll[i - 1][1]) * f]; };
    const bearing = (a, b) => { const y = Math.sin((b[0] - a[0]) * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180); const x = Math.cos(a[1] * Math.PI / 180) * Math.sin(b[1] * Math.PI / 180) - Math.sin(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.cos((b[0] - a[0]) * Math.PI / 180); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
    try {
      if (v3) { v3.remove(); v3 = null; }
      const start = ll[0];
      v3 = new maplibregl.Map({ container: 'map3d', style: 'https://tiles.openfreemap.org/styles/liberty', center: start, zoom: 15.5, pitch: 62, bearing: 0, maxPitch: 80, attributionControl: { compact: true } });
      const m = v3;
      let v3loaded = false, v3fell = false;
      const v3fallback = () => { if (v3fell || v3loaded || v3 !== m) return; v3fell = true; v3msg('標準の地図で表示します…'); m.setStyle(OSM_STYLE); };   // きれいな地図が読めない端末では、標準の地図で
      setTimeout(v3fallback, 8000);
      m.on('error', () => { if (!v3loaded) v3fallback(); });
      m.on('style.load', () => {
        v3loaded = true; if (m.getSource('route')) return;
        v3msg('');
        try {
          m.addSource('esri', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
          const first = m.getStyle().layers.find(l => l.type !== 'background');
          m.addLayer({ id: 'esri', type: 'raster', source: 'esri', layout: { visibility: 'none' } }, first && first.id);
          m.addSource('dem', { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 14, encoding: 'terrarium' });
          m.setTerrain({ source: 'dem', exaggeration: 1.2 });
        } catch (e) { /* 地形なしでも続行 */ }
        m.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: ll } } });
        m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 11 } });
        m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#e8384f', 'line-width': 6 } });
        
        
        applyV3Style();
        // カメラは固定(酔わないように回転・追従しない)。コース全体が見える角度で止めて、人型アイコンだけが走る
        const bb = ll.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [180, 90, -180, -90]);
        m.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { pitch: 45, bearing: 0, padding: { top: 90, bottom: 60, left: 40, right: 40 }, duration: 0 });
        m.addSource('done', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [start, start] } } });
        m.addLayer({ id: 'route-done', type: 'line', source: 'done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffd23f', 'line-width': 6 } });
        const el = document.createElement('div'); el.className = 'runner'; el.textContent = '🏃';
        const me = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(start).addTo(m);
        let last = performance.now();
        const speed = total / 12;                                     // 一周 約12秒
        const tick = now => {
          const dt = Math.min(0.1, (now - last) / 1000); last = now;
          if (v3play) {
            v3t += speed * dt; const p = at(v3t), k = Math.max(0, cum.findIndex(c => c >= (v3t % total)));
            me.setLngLat(p);
            const d = v3t % total, idx = cum.findIndex(c => c > d);
            m.getSource('done').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: ll.slice(0, Math.max(1, idx)).concat([p]) } });
          }
          v3raf = requestAnimationFrame(tick);
        };
        v3raf = requestAnimationFrame(tick);
      });
      m.on('dragstart', () => { v3play = false; $('#v3-play').textContent = '▶'; });
    } catch (e) { v3msg('3D表示を開始できませんでした（この端末では未対応かもしれません）'); }
  };

  /* ---------- ③ 走る(GPSで本当に通らないと完成しない) ---------- */
  const run = { route: null, lat0: 0, lon0: 0, planLL: [], tracker: null, trail: [], t0: 0, elapsed: 0,
    running: false, watchId: null, simTimer: null, clock: null, simPos: 0,
    layerCovered: null, line: null, me: null, wake: null, sim: false, lastN: -1 };

  function setStatus(text, kind) {
    const el = $('#run-status'); el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : ''); if (kind === 'warn' || kind === 'bad') FX.shake(el);
    const ns = $('#nav-status'); if (ns) { ns.textContent = text; ns.className = 'status' + (kind ? ' ' + kind : ''); }
  }

  /* ---------- ナビ表示: 進む向きが上になる、Googleマップのナビのような主観画面 ---------- */
  const OSM_STYLE = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] };
  const NV = { map: null, pts: null, idx: 0, me: null, brg: 0, last: null, open: false };
  const bearingLL = (a, b) => {                                  // a,b = [lat,lon] → 方位(度)
    const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
    const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;        // +なら右へ
  function resample(ll, step) {                                  // コースを一定間隔(m)の点列にする
    const out = [ll[0]]; let acc = 0;
    for (let i = 1; i < ll.length; i++) {
      let a = out[out.length - 1], b = ll[i], d = haversine(a, b);
      while (d >= step) { const f = step / d; a = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; out.push(a); d = haversine(a, b); }
    }
    return out;
  }
  const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  function nextTurn() {                                          // 次に曲がる場所を探す(10m刻みの点列で判定)
    const R = NV.pts, i = NV.idx, n = R.length;
    for (let j = i + 4; j < Math.min(n - 3, i + 60); j++) {
      const b1 = bearingLL(R[j - 3], R[j - 1]), b2 = bearingLL(R[j], R[j + 2]), d = angDiff(b1, b2);
      if (Math.abs(d) > 40) return { dist: (j - i) * 10, d };
    }
    return null;
  }
  function turnText(t) {
    const a = Math.abs(t.d), side = t.d > 0 ? '右' : '左';
    return a > 135 ? 'Uターン' : a > 100 ? `大きく${side}へ` : a > 60 ? `${side}折` : `${side}へ`;
  }
  function navRender() {
    const R = NV.pts; if (!R) return;
    const left = Math.max(0, R.length - 1 - NV.idx) * 10, t = nextTurn();
    let arrow = '⬆', text;
    if (left < 40 && run.tracker.progress > 0.6) text = 'もうすぐゴールです';
    else if (t) { arrow = t.d > 0 ? '↱' : '↰'; if (Math.abs(t.d) > 135) arrow = '↩'; text = `${t.dist < 15 ? 'まもなく' : Math.round(t.dist / 10) * 10 + 'm先'} ${turnText(t)}`; }
    else text = 'まっすぐ進む';
    $('#nav-arrow').textContent = arrow; $('#nav-text').textContent = text;
    if (settings.voice && 'speechSynthesis' in window) {          // 音声案内: 曲がり角の60m手前と、ゴール間近で読み上げる
      const key = t ? (t.dist <= 60 ? text : null) : (text === 'もうすぐゴールです' ? text : null);
      if (key && key !== NV.spoken) { NV.spoken = key; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(I18N.lang === 'en' ? I18N.tr(key) : key.replace('m先', 'メートル先')); u.lang = I18N.speechLang(); speechSynthesis.speak(u); } catch (e) { /* なし */ } }
      if (!key) NV.spoken = null;
    }
    $('#nav-left').textContent = fmtKm(run.route.lengthM * (1 - run.tracker.progress));
    $('#nav-cov').textContent = Math.round(run.tracker.progress * 100) + '%';
  }
  function navCovered() {
    if (!NV.map || !NV.map.getSource('cov')) return;
    const T = run.tracker, feats = [];
    for (const [a, b] of T.coveredRuns()) {
      const pts = []; for (let i = a; i <= Math.min(b + 1, T.n - 1); i++) { const p = RE.toLatLng(T.s[i][0], T.s[i][1], run.lat0, run.lon0); pts.push([p[1], p[0]]); }
      if (pts.length > 1) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts } });
    }
    NV.map.getSource('cov').setData({ type: 'FeatureCollection', features: feats });
  }
  function navUpdate(lat, lon, acc) {
    if (!NV.open || !NV.map) return;
    const R = NV.pts; let best = NV.idx, bd = 1e9;
    for (let k = Math.max(0, NV.idx - 3); k < Math.min(R.length, NV.idx + 30); k++) { const d = haversine([lat, lon], R[k]); if (d < bd) { bd = d; best = k; } }
    if (bd < 40) NV.idx = best;
    // 向き: 直前の位置からの移動方向。止まっているときは、コースの進行方向
    if (NV.last && haversine(NV.last, [lat, lon]) >= 4) { NV.brg = bearingLL(NV.last, [lat, lon]); NV.last = [lat, lon]; }
    else if (!NV.last) NV.last = [lat, lon];
    else if (NV.idx + 3 < R.length) NV.brg = bearingLL(R[NV.idx], R[NV.idx + 3]);
    if (NV.me) NV.me.setLngLat([lon, lat]);
    NV.map.easeTo({ center: [lon, lat], bearing: NV.brg, pitch: 58, zoom: 18, duration: 900, easing: x => x });
    $('#nav-acc').textContent = acc ? `GPS ±${Math.round(acc)}m` : 'GPS';
    navCovered(); navRender();
  }
  function closeNav() {
    NV.open = false; $('#nav').hidden = true;
    if (NV.map) { try { NV.map.remove(); } catch (e) { /* なし */ } NV.map = null; }
  }
  function openNav() {
    if (!run.route) return;
    if (!window.maplibregl) return toast('ナビ表示を読み込めませんでした');
    NV.open = true; NV.last = null; NV.idx = 0; $('#nav').hidden = false;
    const ll = run.planLL.concat([run.planLL[0]]); NV.pts = resample(ll, 10);
    NV.brg = bearingLL(NV.pts[0], NV.pts[Math.min(3, NV.pts.length - 1)]);
    $('#nav-acc').textContent = 'GPS'; $('#nav-run').textContent = $('#btn-run').textContent;
    try {
      const m = NV.map = new maplibregl.Map({ container: 'nav-map', style: 'https://tiles.openfreemap.org/styles/liberty', center: [ll[0][1], ll[0][0]], zoom: 18, pitch: 58, bearing: NV.brg, attributionControl: { compact: true } });
      let loaded = false, fell = false;
      const fallback = () => { if (fell || loaded || !NV.map) return; fell = true; $('#nav-status').textContent = '標準の地図に切り替えました'; m.setStyle(OSM_STYLE); };
      setTimeout(fallback, 8000);
      m.on('style.load', () => {
        loaded = true; if (m.getSource('rt')) return;
        const line = ll.map(p => [p[1], p[0]]);
        m.addSource('rt', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: line } } });
        m.addSource('cov', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        const L2 = (id, src, color, w) => m.addLayer({ id, type: 'line', source: src, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': w } });
        L2('rt-casing', 'rt', '#fff', 14); L2('rt-line', 'rt', '#e8384f', 8); L2('cov-line', 'cov', '#2fa36b', 8);
        const el = document.createElement('div'); el.className = 'nav-me'; el.innerHTML = '<i></i>';
        NV.me = new maplibregl.Marker({ element: el, pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat(line[0]).addTo(m);
        const p = run.trail.length ? run.trail[run.trail.length - 1] : null;
        if (p) navUpdate(p[0], p[1], null); else navRender();
      });
      m.on('error', () => { if (!loaded) fallback(); });
    } catch (e) { closeNav(); toast('この端末ではナビ表示を開始できませんでした'); }
  }
  $('#btn-nav').onclick = openNav;
  $('#nav-close').onclick = closeNav;
  $('#nav-run').onclick = () => $('#btn-run').click();
  new MutationObserver(() => { $('#nav-run').textContent = $('#btn-run').textContent; }).observe($('#btn-run'), { childList: true, characterData: true, subtree: true });
  function openRun(route) {
    mode = 'run';
    Object.assign(run, { route, lat0: plan.lat0, lon0: plan.lon0, trail: [], elapsed: 0, running: false, sim: false, simPos: 0, lastN: -1 });
    run.tracker = new RE.CourseTracker(route.pts);
    run.planLL = toLL(route.pts, run.lat0, run.lon0);
    planLayer.clearLayers(); runLayer.clearLayers(); if (startMarker) startMarker.remove();
    runLayer.addLayer(L.polyline(run.planLL.concat([run.planLL[0]]), { color: '#fff', weight: 9, opacity: .8 }));
    runLayer.addLayer(L.polyline(run.planLL.concat([run.planLL[0]]), { color: '#e8384f', weight: 5, opacity: .6 }));
    run.layerCovered = L.layerGroup().addTo(runLayer);
    run.line = L.polyline([], { color: '#7b3fe4', weight: 4, opacity: .9 }).addTo(runLayer);
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
    else if (r.state === 'off') { if (!run.offBuzz) buzz(150); run.offBuzz = true; setStatus(`コースから約${Math.round(r.off)}m離れています。赤い線に戻ってください。`, 'warn'); }
    else { run.offBuzz = false; setStatus(`いい調子です！ あと約${kmTxt(Math.max(0, run.route.lengthM * (1 - run.tracker.progress) / 1000))}`, 'ok'); }
    updateStats(); navUpdate(lat, lon, acc);
    if (r.done) completeRun();
  }
  async function startRun() {
    run.running = true; run.t0 = Date.now() - run.elapsed * 1000; Music.scene('run');
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
      try { if (settings.keepAwake && navigator.wakeLock) run.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* 画面を点けたままにできなくても続行 */ }
    }
  }
  function stopTracking() {
    run.running = false; clearInterval(run.clock); clearInterval(run.simTimer); Music.scene('calm');
    if (run.watchId != null) { navigator.geolocation.clearWatch(run.watchId); run.watchId = null; }
    if (run.wake) { try { run.wake.release(); } catch (e) { /* 何もしない */ } run.wake = null; }
  }
  function pauseRun() {
    stopTracking(); $('#btn-run').textContent = '再開'; $('#sim').disabled = false; $('#sim-speed').disabled = false;
  }
  $('#btn-run').onclick = () => { if (run.running) pauseRun(); else { startRun(); if (settings.autoNav && !NV.open && !$('#sim').checked) openNav(); } };   // スタートすると、自分視点のナビ表示になる
  $('#btn-quit').onclick = async () => {
    const force = $('#btn-quit').dataset.force; delete $('#btn-quit').dataset.force;
    if (!force && run.tracker.progress > 0.05 && !await askConfirm('走るのをやめて、コース画面にもどりますか？', 'ここまでの記録は保存されません。', 'やめてもどる', 'このまま走る')) return;
    stopTracking(); closeNav(); runLayer.clearLayers(); mode = 'plan';
    $('#panel-run').hidden = true; $('#panel-plan').hidden = false;
    if (startMarker) startMarker.addTo(map); showRoutes();
  };
  $('#run-back').onclick = () => $('#btn-quit').click();
  /* GPSで一周できたときだけ保存される */
  function completeRun() {
    stopTracking(); closeNav(); buzz([200, 80, 200, 80, 400]);
    const keep = []; let prev = null;
    for (const p of run.trail) { if (!prev || haversine(prev, p) >= 8) { keep.push([+p[0].toFixed(6), +p[1].toFixed(6)]); prev = p; } }
    const id = plan.pref.id, mk = plan.mk || cur;
    runsOf(mk)[id] = {
      date: new Date().toISOString(), distanceM: run.tracker.dist, durationS: run.elapsed, coverage: run.tracker.progress,
      iou: run.route.iou, sizeM: sizeOf(plan.pref, plan.size), demo: !!(run.sim || plan.demo),
      trail: keep, planned: run.planLL.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]),
      place: null,
    };
    persist(); Music.sfx('done'); leaveMap(); flashPiece(id); showDone(id, true);
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
        const url = `${PLACE_URL}?format=jsonv2&addressdetails=1&zoom=16&accept-language=${I18N.lang}&lat=${c[0].toFixed(5)}&lon=${c[1].toFixed(5)}`;
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
    if (fresh) { FX.confetti([COLORS[p.color]]); buzz([30, 40, 60]); }
    const pb = $('#md-place .mini'); if (pb) pb.onclick = () => fetchPlaceFor(mk, id);
    $('#md-ok').onclick = () => { $('#modal').hidden = true; };
    $('#md-del').onclick = async () => {
      if (!await askConfirm('記録を消しますか？', `${p.name} の記録を消します。元に戻せません。`, '消す', 'やめる')) { showDone(id, fresh, mk); return; }
      delete runsOf(mk)[id]; persist(); if (cur === mk) renderBoard(); else if (!cur) renderHome(); $('#modal').hidden = true; closeSheet(); toast('記録を消しました');
    };
  }
  /* きろく: 合計の成績(距離・回数・完成数・連続日数)と、走った場所つきの一覧 */
  function computeStats() {
    let m = 0, secs = 0, count = 0, done = 0; const days = new Set(), key = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    for (const mo of Object.values(MODES)) for (const [id, r] of Object.entries(runsOf(mo.key))) {
      if (!DATAS[mo.key].byId[id]) continue; done++; count++; m += r.distanceM || 0; secs += r.durationS || 0; days.add(key(new Date(r.date)));
    }
    let streak = 0, d = new Date(); if (!days.has(key(d))) d.setDate(d.getDate() - 1);
    while (days.has(key(d))) { streak++; d.setDate(d.getDate() - 1); }
    return { km: m / 1000, secs, count, done, streak };
  }
  function renderHomeStat() { const st = computeStats(), el = $('#home-stat'); if (el) el.textContent = st.count ? `${kmTxt(st.km, 1)} ・ ${st.count}回` : ''; }
  /* 記録一覧(国・地域をまたいで、走った場所つきで一覧) */
  function showList() {
    const items = [];
    for (const m of Object.values(MODES)) for (const [id, r] of Object.entries(runsOf(m.key))) if (DATAS[m.key].byId[id]) items.push({ mk: m.key, id, r, p: DATAS[m.key].byId[id] });
    items.sort((a, b) => b.r.date.localeCompare(a.r.date));
    $('#modal-card').innerHTML = `<h2>きろく</h2>` + (() => {
        const st = computeStats(), JP_KM = 3000, EARTH = 40075, pct = (v, t) => Math.min(100, v / t * 100);
        return `<div class="sum-stats"><div><b>${kmTxt(st.km, 1)}</b><small>合計距離</small></div><div><b>${st.count}回</b><small>走った回数</small></div>` +
          `<div><b>${st.done}</b><small>完成した数</small></div><div><b>${st.streak}日</b><small>連続日数</small></div></div>` +
          `<div class="stat-bar"><span>日本縦断 ${kmTxt(JP_KM, 0)}</span><b>${pct(st.km, JP_KM).toFixed(1)}%</b><div class="bar"><i style="width:${pct(st.km, JP_KM)}%"></i></div></div>` +
          `<div class="stat-bar"><span>地球一周 ${kmTxt(EARTH, 0)}</span><b>${pct(st.km, EARTH).toFixed(2)}%</b><div class="bar"><i style="width:${pct(st.km, EARTH)}%"></i></div></div>` +
          `<h3 class="stat-h">${items.length}件の記録</h3>`;
      })() +
      (items.length ? `<div class="rec-list">` + items.map(({ mk, id, r, p }) =>
        `<div class="rec-wrap" data-key="${mk}:${id}" style="--i:${items.findIndex(x => x.id === id && x.mk === mk)}"><button class="rec-del" aria-label="削除">削除</button><button class="rec" data-key="${mk}:${id}"><span class="rec-trail">${trailSvg(r.trail, COLORS[p.color], null, 56)}</span>` +
        `<span class="rec-main"><b>${p.name}</b><small>${MODES[mk].home} ・ ${fmtDate(r.date)} ・ ${fmtKm(r.distanceM)}</small>` +
        `<small class="rec-place">${r.place && r.place.text ? '📍 ' + esc(r.place.text) : '📍 未取得'}</small></span></button></div>`).join('') + '</div>'
        : '<p class="muted">まだ記録がありません。</p>') +
      `<div class="sheet-actions" style="margin-top:12px"><button class="primary" id="md-ok">とじる</button></div>`;
    $('#modal').hidden = false; $('#md-ok').onclick = () => { $('#modal').hidden = true; };
    const rl = $('#modal-card .rec-list');
    if (rl) {
      FX.swipeRows(rl, async key => {
        const [mk, id] = key.split(':'), p = prefOf(mk, id);
        if (!await askConfirm('記録を消しますか？', `${p.name} の記録を消します。元に戻せません。`, '消す', 'やめる')) { showList(); return; }
        delete runsOf(mk)[id]; persist(); if (cur === mk) renderBoard(); else if (!cur) renderHome(); showList(); toast('記録を消しました');
      });
      rl.addEventListener('click', e => {
        const b = e.target.closest('.rec'); if (!b) return; const [mk, id] = b.dataset.key.split(':'); showDone(id, false, mk);
      });
    }
  }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').hidden = true; });

  /* ---------- メニュー(書き出し・読み込み・初期化) ---------- */
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
  $('#menu-reset').onclick = async () => {
    if (!await askConfirm('すべての記録を消しますか？', '走った記録と、前回作ったコースが消えます。元には戻せません。<br>（先に「記録を書き出す」でバックアップできます）', 'すべて消す', 'やめる')) return;
    save = blankSave(); persist(); cur ? renderBoard() : renderHome(); closeSheet();
  };

  /* ---------- 設定画面 ---------- */
  const tg = (key, label, note) => `<div class="set-row"><div class="set-l"><b>${label}</b>${note ? `<small>${note}</small>` : ''}</div><button class="switch" role="switch" data-set="${key}" aria-checked="${!!settings[key]}"><i></i></button></div>`;
  const sg = (key, label, opts, val, note) => `<div class="set-row col"><div class="set-l"><b>${label}</b>${note ? `<small>${note}</small>` : ''}</div><div class="seg" data-seg="${key}">` + opts.map(([v, t]) => `<button data-v="${v}" class="${v === val ? 'on' : ''}">${t}</button>`).join('') + '</div></div>';
  function openSettings() {
    $('#menu').hidden = true;
    const nm = (save.runs ? Object.keys(save.runs).length : 0) + (save.worldRuns ? Object.keys(save.worldRuns).length : 0);
    $('#modal-card').innerHTML = `<div class="set-head"><h2>設定</h2><button id="set-close" class="link">とじる</button></div><div class="set-body">` +
      `<h3>プロフィール</h3><div class="set-row col"><div class="set-l"><b>ニックネーム</b><small>ホームの見出しに表示されます（この端末の中だけに保存）</small></div><input id="set-nick" type="text" maxlength="12" placeholder="例: しゅう" value="${esc(settings.nick)}"></div>` +
      `<h3>表示</h3>` + sg('theme', '画面の色', [['auto', '自動'], ['morning', '朝'], ['day', '昼'], ['evening', '夕方'], ['night', '夜']], Theme.mode(), '自動は、いる場所の日の出・日没に合わせて変わります') +
      sg('lang', '言語', [['ja', '日本語'], ['en', 'English']], I18N.lang) +
      sg('units', '距離の単位', [['km', 'キロメートル'], ['mi', 'マイル']], settings.units) +
      `<h3>音</h3>` + `<div class="set-row"><div class="set-l"><b>BGM</b></div><button class="switch" data-snd="bgm" role="switch" aria-checked="${Music.isOn()}"><i></i></button></div>` +
      `<div class="set-row col"><div class="set-l"><b>BGMの音量</b></div><input id="set-vol" type="range" min="0" max="100" value="${Math.round(Music.volume() * 100)}"></div>` +
      `<div class="set-row"><div class="set-l"><b>効果音</b><small>コース完成・ゴールの音</small></div><button class="switch" data-snd="sfx" role="switch" aria-checked="${Music.sfxIsOn()}"><i></i></button></div>` +
      `<div class="set-row"><div class="set-l"><b>ボタンの音</b><small>押したときの、やわらかい「ぽん」という音</small></div><button class="switch" data-snd="tap" role="switch" aria-checked="${Music.tapIsOn()}"><i></i></button></div>` +
      `<h3>走るとき</h3>` + tg('autoLocate', '開いたら現在地にピンを立てる', '位置情報の許可が必要です') + tg('autoNav', 'スタートで自分視点のナビ表示にする') +
      tg('voice', '音声案内', '曲がり角の手前で読み上げます') + tg('vibrate', 'バイブレーション', 'ゴールとコースから外れたときに振動') + tg('keepAwake', '走っている間、画面を消さない') +
      `<h3>見た目</h3>` + tg('motion', 'アニメーション', '波紋・紙吹雪・切り替えの動き') +
      `<h3>記録のデータ</h3><div class="set-row"><div class="set-l"><b>走った記録</b><small>${nm}件</small></div></div>` +
      `<div class="set-btns"><button id="set-list"><span>きろく</span></button><button id="set-export"><span>書き出す</span></button><button id="set-import"><span>読み込む</span></button></div>` +
      `<div class="set-btns"><button id="set-reset" class="danger">すべて消す</button></div>` +
      `<h3>このアプリについて</h3><div class="set-about">はしって地図あつめ　バージョン ${APP_VER}<br>走った道をつないで、地図のピースを集めるアプリです。<br><br>` +
      `位置情報は、コース作りと走行の記録のためだけに使い、この端末の外へは保存しません（地図と道路データの取得のために、場所の周辺の範囲を地図サービスへ送ります）。記録はこの端末のブラウザの中だけに保存されます。<br><br>` +
      `地図データ © OpenStreetMap contributors ／ 航空写真 © Esri, Maxar, Earthstar Geographics ／ 地名 Nominatim ／ 3D地図 OpenFreeMap・MapLibre</div></div>`;
    $('#modal').hidden = false;
  }
  $('#modal').addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('#modal-card'); if (!c || !c.querySelector('.set-body')) return;
    const sw = e.target.closest('.switch');
    if (sw) {
      const on = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(on));
      if (sw.dataset.snd === 'bgm') Music.setOn(on); else if (sw.dataset.snd === 'sfx') { Music.setSfx(on); if (on) Music.sfx('ok'); } else if (sw.dataset.snd === 'tap') { Music.setTap(on); if (on) Music.tap(false); }
      else { settings[sw.dataset.set] = on; saveSettings(); if (sw.dataset.set === 'motion') FX.setEnabled(on); if (sw.dataset.set === 'voice' && on && 'speechSynthesis' in window) { try { const u = new SpeechSynthesisUtterance(I18N.tr('音声案内をオンにしました')); u.lang = I18N.speechLang(); speechSynthesis.speak(u); } catch (er) { /* なし */ } } }
      return;
    }
    const sb = e.target.closest('.seg button');
    if (sb) {
      const key = sb.parentElement.dataset.seg; sb.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === sb));
      if (key === 'lang') { I18N.setLang(sb.dataset.v); return; } else if (key === 'theme') Theme.setMode(sb.dataset.v); else { settings[key] = sb.dataset.v; saveSettings(); if (cur && key === 'units') { refreshAfterUnits(); } }
      return;
    }
    const id = (e.target.closest('button') || e.target).id;
    if (id === 'set-close') $('#modal').hidden = true;
    else if (id === 'set-list') showList();
    else if (id === 'set-export') $('#menu-export').click();
    else if (id === 'set-import') $('#menu-import').click();
    else if (id === 'set-reset') { $('#modal').hidden = true; $('#menu-reset').click(); }
  });
  $('#modal').addEventListener('input', e => {
    if (e.target.id === 'set-nick') { settings.nick = e.target.value.trim().slice(0, 12); saveSettings(); if (!cur) renderHome(); }
    else if (e.target.id === 'set-vol') Music.setVolume(e.target.value / 100);
  });
  function refreshAfterUnits() { if (typeof updateEst === 'function' && plan.pref) try { updateEst(); } catch (er) { /* なし */ } }
  $('#menu-settings').onclick = openSettings; $('#btn-settings').onclick = openSettings; $('#home-list').onclick = showList;

  /* ---------- 起動 ---------- */
  if (!DEV) { $('.row.sim').hidden = true; $('#src option[value="demo"]').remove(); $('.src-row').hidden = true; }
  loadAll().then(() => { renderHome(); show('home'); }).catch(e => {
    $('#home-cards').innerHTML = '<p class="muted" style="padding:16px">データを読み込めませんでした。フォルダで `python -m http.server` を実行し、http://localhost:8000 で開いてください。 ' + esc(e.message) + '</p>';
  });
  window.__app = { save: () => save, byId: () => byId, plan, run, mode: () => cur, view: () => view };   // 動作確認用
})();
