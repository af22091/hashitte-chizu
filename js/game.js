/* 待ち時間のミニゲーム(3種類): jump=ランナージャンプ / snake=へび / mole=もぐらたたき */
(function (root) {
  'use strict';
  const BEST = k => 'hashitte-game-best-' + k;
  const best = k => { try { return +localStorage.getItem(BEST(k)) || 0; } catch (e) { return 0; } };
  const saveBest = (k, v) => { if (v > best(k)) { try { localStorage.setItem(BEST(k), v); } catch (e) { /* なし */ } } };
  let cv, c, raf = null, timer = null, g = null, kind = null, listeners = [];
  const on = (t, ev, fn) => { t.addEventListener(ev, fn); listeners.push([t, ev, fn]); };
  function clearAll() {
    if (raf) cancelAnimationFrame(raf); raf = null; clearInterval(timer); timer = null;
    listeners.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn)); listeners = [];
  }
  function overlay(W, H, title, sub) {
    c.fillStyle = 'rgba(16,41,59,.68)'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.textAlign = 'center';
    c.font = '700 18px sans-serif'; c.fillText(title, W / 2, H / 2 - 6); c.font = '13px sans-serif'; c.fillText(sub, W / 2, H / 2 + 20); c.textAlign = 'left';
  }

  /* ---------- 1. ランナージャンプ ---------- */
  function jumpGame() {
    const W = 320, H = 150, GY = 112;
    setup(W, H);
    const reset = () => { g = { y: 0, vy: 0, obs: [], t: 0, score: 0, over: false, speed: 3.4, next: 70 }; }; reset();
    const jump = () => { if (g.over) { reset(); return; } if (g.y === 0) g.vy = 9.6; };
    on(cv, 'pointerdown', jump); on(root, 'keydown', e => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } });
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!g.over) {
        g.t++; g.score = Math.floor(g.t / 6); g.speed = 3.4 + Math.min(3.2, g.t / 900);
        g.vy -= 0.58; g.y = Math.max(0, g.y + g.vy); if (g.y === 0) g.vy = 0;
        if (--g.next <= 0) { g.obs.push({ x: W + 10, w: 16 + Math.random() * 10 }); g.next = 48 + Math.random() * 55 - Math.min(22, g.t / 60); }
        g.obs.forEach(o => { o.x -= g.speed; }); g.obs = g.obs.filter(o => o.x > -40);
        for (const o of g.obs) if (o.x < 58 && o.x + o.w > 34 && g.y < 22) { g.over = true; saveBest('jump', g.score); }
      }
      c.fillStyle = '#cfeaf6'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const x = ((i * 130 - g.t * 0.4) % (W + 60) + W + 60) % (W + 60) - 30; c.beginPath(); c.arc(x, 30 + i * 9, 10, 0, 7); c.arc(x + 12, 32 + i * 9, 8, 0, 7); c.fill(); }
      c.fillStyle = '#9fd0b5'; c.fillRect(0, GY + 4, W, H - GY);
      c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([12, 10]); c.lineDashOffset = g.t * g.speed; c.beginPath(); c.moveTo(0, GY + 12); c.lineTo(W, GY + 12); c.stroke(); c.setLineDash([]);
      c.font = '26px sans-serif'; c.fillText('🏃', 32, GY - g.y); g.obs.forEach(o => c.fillText('🚧', o.x, GY + 2));
      c.fillStyle = '#10293b'; c.font = '700 13px sans-serif'; c.fillText(`${g.score}m  ベスト ${best('jump')}m`, 10, 20);
      if (g.over) overlay(W, H, `${g.score}m 走りました`, 'タップでもう一度');
    };
    raf = requestAnimationFrame(loop);
  }

  /* ---------- 2. へび(スワイプか矢印キーで向きを変える) ---------- */
  function snakeGame() {
    const N = 15, S = 20, W = N * S, H = N * S;
    setup(W, H);
    const reset = () => { g = { body: [[7, 7], [6, 7], [5, 7]], dir: [1, 0], next: [1, 0], food: null, score: 0, over: false }; food(); };
    const food = () => { let p; do { p = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; } while (g.body.some(b => b[0] === p[0] && b[1] === p[1])); g.food = p; };
    reset();
    const turn = d => { if (g.over) { reset(); return; } if (d[0] !== -g.dir[0] || d[1] !== -g.dir[1]) g.next = d; };
    let sx = 0, sy = 0;
    const noScroll = e => e.preventDefault();               // 画面が上下に動かないよう固定
    cv.addEventListener('touchmove', noScroll, { passive: false }); listeners.push([cv, 'touchmove', noScroll]);
    cv.addEventListener('touchstart', noScroll, { passive: false }); listeners.push([cv, 'touchstart', noScroll]);
    on(cv, 'pointerdown', e => { sx = e.clientX; sy = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* なし */ } });
    on(cv, 'pointermove', e => {                           // なぞった瞬間に曲がる(指を離さなくてOK)
      if (!(e.buttons || e.pressure)) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) >= 18) { turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); sx = e.clientX; sy = e.clientY; }
    });
    on(cv, 'pointerup', e => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 14) { if (g.over) reset(); return; }
      turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
    });
    on(root, 'keydown', e => { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code]; if (m) { e.preventDefault(); turn(m); } });
    const draw = () => {
      c.fillStyle = '#e9f5ee'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#d9ecdf'; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) c.fillRect(i * S, j * S, S, S);
      c.font = '17px sans-serif'; c.fillText('🍙', g.food[0] * S + 1, g.food[1] * S + 17);
      g.body.forEach((b, i) => { c.fillStyle = i ? '#2ea36f' : '#1b7f53'; c.beginPath(); c.roundRect(b[0] * S + 1, b[1] * S + 1, S - 2, S - 2, 6); c.fill(); });
      c.fillStyle = '#10293b'; c.font = '700 13px sans-serif'; c.fillText(`${g.score}こ  ベスト ${best('snake')}こ`, 8, 16);
      if (g.over) overlay(W, H, `${g.score}こ 食べました`, 'タップでもう一度');
    };
    timer = setInterval(() => {
      if (!g.over) {
        g.dir = g.next; const h = [g.body[0][0] + g.dir[0], g.body[0][1] + g.dir[1]];
        if (h[0] < 0 || h[1] < 0 || h[0] >= N || h[1] >= N || g.body.some(b => b[0] === h[0] && b[1] === h[1])) { g.over = true; saveBest('snake', g.score); }
        else { g.body.unshift(h); if (h[0] === g.food[0] && h[1] === g.food[1]) { g.score++; food(); } else g.body.pop(); }
      }
      draw();
    }, 140);
  }

  /* ---------- 3. もぐらたたき(25秒) ---------- */
  function moleGame() {
    const W = 270, H = 300, CELL = 90;
    setup(W, H);
    const reset = () => { g = { moles: Array(9).fill(0), score: 0, t0: performance.now(), over: false, last: 0, flash: Array(9).fill(0) }; }; reset();
    on(cv, 'pointerdown', e => {
      if (g.over) { reset(); return; }
      const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top - 0) / r.height * H - 30;
      if (y < 0) return; const i = Math.floor(y / CELL) * 3 + Math.floor(x / CELL);
      if (i >= 0 && i < 9 && g.moles[i] > performance.now()) { g.score++; g.moles[i] = 0; g.flash[i] = performance.now() + 200; }
    });
    const loop = now => {
      raf = requestAnimationFrame(loop);
      const left = Math.max(0, 25 - (now - g.t0) / 1000);
      if (!g.over) {
        if (left <= 0) { g.over = true; saveBest('mole', g.score); }
        else if (now - g.last > Math.max(420, 900 - (25 - left) * 18)) {
          g.last = now; const i = Math.floor(Math.random() * 9); if (g.moles[i] < now) g.moles[i] = now + Math.max(650, 1100 - (25 - left) * 15);
        }
      }
      c.fillStyle = '#d9ecdf'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#10293b'; c.font = '700 14px sans-serif'; c.fillText(`${g.score}ひき   のこり ${left.toFixed(1)}秒   ベスト ${best('mole')}`, 8, 20);
      for (let i = 0; i < 9; i++) {
        const cx = (i % 3) * CELL + CELL / 2, cy = 30 + Math.floor(i / 3) * CELL + CELL / 2 + 8;
        c.fillStyle = '#7a5a3a'; c.beginPath(); c.ellipse(cx, cy + 18, 32, 13, 0, 0, 7); c.fill();
        if (g.moles[i] > now) { c.font = '40px sans-serif'; c.textAlign = 'center'; c.fillText('🐹', cx, cy + 12); c.textAlign = 'left'; }
        else if (g.flash[i] > now) { c.font = '30px sans-serif'; c.textAlign = 'center'; c.fillText('💥', cx, cy + 10); c.textAlign = 'left'; }
      }
      if (g.over) overlay(W, H, `${g.score}ひき たたきました`, 'タップでもう一度');
    };
    raf = requestAnimationFrame(loop);
  }

  function setup(W, H) { cv.width = W * 2; cv.height = H * 2; cv.style.aspectRatio = W + ' / ' + H; cv.style.maxWidth = Math.min(W * 1.4, 380) + 'px'; c = cv.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.textBaseline = 'alphabetic'; }
  const GAMES = { jump: jumpGame, snake: snakeGame, mole: moleGame };
  root.MiniGame = {
    start(canvas, k) { this.stop(); cv = canvas; kind = k; (GAMES[k] || jumpGame)(); },
    stop() { clearAll(); },
    kinds: ['jump', 'snake', 'mole'],
  };
})(window);
