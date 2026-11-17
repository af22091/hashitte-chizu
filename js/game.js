/* 待ち時間のミニゲーム: タップ(またはスペースキー)でジャンプして、障害物をよける */
(function (root) {
  'use strict';
  const BEST = 'hashitte-game-best';
  let cv, c, raf = null, st = null, best = 0;
  try { best = +localStorage.getItem(BEST) || 0; } catch (e) { /* なし */ }
  const W = 320, H = 120, GY = 92;
  function reset() { st = { y: 0, vy: 0, obs: [], t: 0, score: 0, over: false, speed: 3.2, next: 70 }; }
  function jump() { if (!st) return; if (st.over) { reset(); return; } if (st.y === 0) st.vy = 9.2; }
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!st.over) {
      st.t++; st.score = Math.floor(st.t / 6); st.speed = 3.2 + Math.min(3, st.t / 900);
      st.vy -= 0.55; st.y = Math.max(0, st.y + st.vy); if (st.y === 0) st.vy = 0;
      if (--st.next <= 0) { st.obs.push({ x: W + 10, w: 16 + Math.random() * 10 }); st.next = 45 + Math.random() * 55 - Math.min(20, st.t / 60); }
      st.obs.forEach(o => { o.x -= st.speed; });
      st.obs = st.obs.filter(o => o.x > -40);
      for (const o of st.obs) if (o.x < 58 && o.x + o.w > 34 && st.y < 22) { st.over = true; if (st.score > best) { best = st.score; try { localStorage.setItem(BEST, best); } catch (e) { /* なし */ } } }
    }
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#cfeaf6'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const x = ((i * 130 - st.t * 0.4) % (W + 60) + W + 60) % (W + 60) - 30; c.beginPath(); c.arc(x, 24 + i * 9, 10, 0, 7); c.arc(x + 12, 26 + i * 9, 8, 0, 7); c.fill(); }
    c.fillStyle = '#9fd0b5'; c.fillRect(0, GY + 4, W, H - GY);
    c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([12, 10]); c.lineDashOffset = st.t * st.speed; c.beginPath(); c.moveTo(0, GY + 10); c.lineTo(W, GY + 10); c.stroke(); c.setLineDash([]);
    c.font = '24px sans-serif'; c.textBaseline = 'alphabetic';
    c.fillText('🏃', 32, GY - st.y);
    st.obs.forEach(o => { c.fillText('🚧', o.x, GY + 2); });
    c.fillStyle = '#10293b'; c.font = '700 13px sans-serif'; c.fillText(`${st.score}m  ベスト ${best}m`, 10, 18);
    if (st.over) { c.fillStyle = 'rgba(16,41,59,.65)'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '700 16px sans-serif'; c.textAlign = 'center'; c.fillText(`${st.score}m 走りました`, W / 2, 52); c.font = '13px sans-serif'; c.fillText('タップでもう一度', W / 2, 76); c.textAlign = 'left'; }
  }
  function key(e) { if (e.code === 'Space') { e.preventDefault(); jump(); } }
  root.MiniGame = {
    start(canvas) {
      this.stop(); cv = canvas; cv.width = W * 2; cv.height = H * 2; c = cv.getContext('2d'); c.scale(2, 2);
      reset(); cv.addEventListener('pointerdown', jump); root.addEventListener('keydown', key); raf = requestAnimationFrame(frame);
    },
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; if (cv) cv.removeEventListener('pointerdown', jump); root.removeEventListener('keydown', key); },
  };
})(window);
