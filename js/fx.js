/* 画面の動き(UIのアニメーション)をまとめたもの。app.js から使う。
   波紋・紙吹雪・シェイク・シートのスワイプ・スワイプで削除・円形に広がる切り替え */
(function (root) {
  'use strict';
  const reduceMQ = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let enabled = true, last = { x: innerWidth / 2, y: innerHeight / 2 };
  const ok = () => enabled && !reduceMQ.matches;

  document.addEventListener('pointerdown', e => { last = { x: e.clientX, y: e.clientY }; }, true);

  /* ① 波紋: 押した場所から広がる */
  document.addEventListener('pointerdown', e => {
    if (!ok()) return;
    const b = e.target.closest && e.target.closest('button:not(.switch):not(.link):not(:disabled), .mode-card'); if (!b) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span'); s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    const po = b.style.position, ov = b.style.overflow;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative'; b.style.overflow = 'hidden';
    b.appendChild(s); setTimeout(() => { s.remove(); b.style.position = po; b.style.overflow = ov; }, 650);
  }, true);

  /* ② 紙吹雪: 完成のお祝い */
  function confetti(colors) {
    if (!ok()) return;
    const cv = document.createElement('canvas'); cv.id = 'confetti'; document.body.appendChild(cv);
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr, c = cv.getContext('2d');
    const cs = colors && colors.length ? colors : ['#ff6b81', '#ffb703', '#22c493', '#a27bff', '#ff9ad5'];
    const P = Array.from({ length: 130 }, (_, i) => {
      const side = i % 2 ? 1 : -1;
      return { x: W / 2 + side * W * 0.1, y: H * 0.62, vx: (Math.random() * 7 + 2) * side * dpr * (0.6 + Math.random()), vy: -(Math.random() * 15 + 9) * dpr,
        w: (6 + Math.random() * 7) * dpr, h: (4 + Math.random() * 6) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .5, c: cs[i % cs.length] };
    });
    const t0 = performance.now();
    const tick = now => {
      const t = now - t0; c.clearRect(0, 0, W, H);
      for (const p of P) {
        p.vy += 0.45 * dpr; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1800) / 900);
        c.fillStyle = p.c; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore();
      }
      if (t < 2800) requestAnimationFrame(tick); else cv.remove();
    };
    requestAnimationFrame(tick);
  }

  /* ③ シェイク: まちがい・警告の合図 */
  function shake(el) {
    if (!el || !ok()) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 520);
  }

  /* ④ 円形に広がる切り替え(押した場所から) */
  function reveal(el) {
    if (!ok() || !el || !el.animate) return;
    const x = last.x, y = last.y, rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 20;
    el.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] }, { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  /* ⑤ ボトムシート: 下へなぞって閉じる(離すとばねで戻る) */
  function sheetSwipe(sheet, onClose) {
    let y0 = null, dy = 0;
    sheet.addEventListener('pointerdown', e => {
      if (!e.target.closest('.grab, .sheet-title')) return;
      y0 = e.clientY; dy = 0; sheet.style.transition = 'none'; try { sheet.setPointerCapture(e.pointerId); } catch (x) { /* なし */ }
    });
    sheet.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
    const end = () => {
      if (y0 == null) return; y0 = null;
      sheet.style.transition = 'transform .35s cubic-bezier(.34,1.56,.64,1)';
      if (dy > 90) { sheet.style.transform = 'translateY(110%)'; setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = ''; onClose(); }, 180); }
      else { sheet.style.transform = ''; setTimeout(() => { sheet.style.transition = ''; }, 380); }
    };
    sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
  }

  /* ⑥ 横にずらすと「削除」が出る一覧 */
  function swipeRows(container, onDelete) {
    let row = null, x0 = 0, y0 = 0, dx = 0, drag = false, openRow = null;
    const W = 88;
    container.addEventListener('pointerdown', e => {
      const r = e.target.closest('.rec-wrap'); if (!r || e.target.closest('.rec-del')) return;
      if (openRow && openRow !== r) { openRow.querySelector('.rec').style.transform = ''; openRow = null; }
      row = r; x0 = e.clientX; y0 = e.clientY; dx = 0; drag = false;
    });
    container.addEventListener('pointermove', e => {
      if (!row) return; const mx = e.clientX - x0, my = e.clientY - y0;
      if (!drag && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) { drag = true; try { container.setPointerCapture(e.pointerId); } catch (x) { /* なし */ } }
      if (!drag) return; dx = Math.max(-W - 20, Math.min(0, (openRow === row ? -W : 0) + mx));
      const b = row.querySelector('.rec'); b.style.transition = 'none'; b.style.transform = `translateX(${dx}px)`;
    });
    const end = () => {
      if (!row) return; const b = row.querySelector('.rec'); b.style.transition = 'transform .3s cubic-bezier(.34,1.56,.64,1)';
      if (drag) { if (dx < -W / 2) { b.style.transform = `translateX(${-W}px)`; openRow = row; } else { b.style.transform = ''; if (openRow === row) openRow = null; } const rw = row; rw.dataset.swiped = '1'; setTimeout(() => { delete rw.dataset.swiped; }, 50); }
      row = null;
    };
    container.addEventListener('pointerup', end); container.addEventListener('pointercancel', end);
    container.addEventListener('click', e => {
      const d = e.target.closest('.rec-del'); if (d) { e.stopPropagation(); onDelete((d.closest('.rec-wrap') || {dataset:{}}).dataset.key); return; }
      const w = e.target.closest('.rec-wrap'); if (w && e.target.closest('.rec') && (openRow || w.dataset.swiped)) { e.stopPropagation(); e.preventDefault(); if (openRow) { openRow.querySelector('.rec').style.transform = ''; openRow = null; } }
    }, true);
  }

  root.FX = { confetti, shake, reveal, sheetSwipe, swipeRows, setEnabled(b) { enabled = !!b; document.documentElement.classList.toggle('no-motion', !b); } };
})(window);
