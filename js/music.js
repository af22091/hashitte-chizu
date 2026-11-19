/* BGM(オリジナル・南国ポップ): 音声ファイルは使わず、ブラウザ内で自動演奏する。著作権の心配がなく、容量も増えない。
   場面ごとに曲調が変わる: calm=ふだん / work=コース作成中 / run=走行中 */
(function (root) {
  'use strict';
  const KEY = 'hashitte-music-v1';
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // 南国ポップ(カリプソ風)の8小節: C → Am7 → F → G7 → C → Am7 → Dm7 → G7。ウクレレ・スチールパン・コンガの生音っぽい編成
  const CHORDS = [
    { root: 36, tones: [55, 60, 64, 67] }, { root: 33, tones: [57, 60, 64, 67] }, { root: 41, tones: [53, 57, 60, 65] }, { root: 43, tones: [55, 59, 62, 65] },
    { root: 36, tones: [55, 60, 64, 67] }, { root: 33, tones: [57, 60, 64, 67] }, { root: 38, tones: [57, 60, 62, 65] }, { root: 43, tones: [55, 59, 62, 65] },
  ];
  // スチールパンのメロディ(オリジナル、シンコペーション): 1小節 = 8分音符8つ。0は休み
  const MELODY = [
    79, 0, 76, 79, 0, 81, 79, 0,   76, 0, 72, 76, 0, 79, 76, 0,   77, 0, 81, 77, 0, 79, 77, 0,   74, 0, 77, 79, 0, 71, 74, 0,
    79, 0, 76, 79, 0, 84, 81, 0,   81, 0, 79, 76, 0, 72, 76, 0,   77, 0, 74, 77, 0, 81, 77, 0,   79, 0, 77, 74, 71, 0, 74, 0,
  ];
  const SCENES = {
    calm: { bpm: 96, mel: 0.085, uke: 0.035, bass: 0.15, shake: 0.016, conga: 0.06, clave: 0, spark: false },
    work: { bpm: 108, mel: 0.08, uke: 0.04, bass: 0.17, shake: 0.022, conga: 0.08, clave: 0.02, spark: false },
    run: { bpm: 122, mel: 0.08, uke: 0.045, bass: 0.18, shake: 0.028, conga: 0.1, clave: 0.03, spark: true },
  };

  let ctx = null, master = null, fx = null, noise = null, timer = null;
  let on = true, scene = 'calm', step = 0, nextT = 0, started = false, vol = 1, sfxOn = true;
  try { const v = localStorage.getItem(KEY); if (v !== null) on = v === '1'; const q = parseFloat(localStorage.getItem(KEY + '-vol')); if (q >= 0 && q <= 1) vol = q; sfxOn = localStorage.getItem(KEY + '-sfx') !== '0'; } catch (e) { /* 初期値のまま */ }

  function init() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    // 簡易リバーブ(フィードバックディレイ)
    fx = ctx.createGain(); fx.gain.value = 0.2;
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.16;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    fx.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
    const len = ctx.sampleRate; noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function env(g, t, a, peak, dur) {            // 立ち上がり→指数減衰
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(type, freq, t, dur, peak, attack, send) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
    env(g, t, attack, peak, dur); o.connect(g); g.connect(master); if (send) g.connect(fx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function steelpan(n, t, dur, peak) {              // スチールパン: 丸い基音+オクターブ上の倍音、ゆるいビブラート
    const f = midi(n), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    env(g, t, 0.004, peak, dur); g.connect(master); const w = ctx.createGain(); w.gain.value = 0.35; g.connect(w); w.connect(fx);
    lfo.frequency.value = 5.5; lg.gain.value = f * 0.004; lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + 0.05);
    [[1, 1, -3], [2, 0.45, 2], [3.01, 0.12, 0]].forEach(([m, a, d]) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m; o.detune.value = d; og.gain.value = a;
      lg.connect(o.frequency); o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function uke(n, t, peak, len) {                    // ウクレレのはじき/カッティング
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'square'; o.frequency.value = midi(n); o2.frequency.value = midi(n) * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.12; o2.connect(g2); g2.connect(f);
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + len);
    env(g, t, 0.002, peak, len); o.connect(f); f.connect(g); g.connect(master); g.connect(fx); o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }
  function bassNote(n, t, dur, peak) {              // 木のぬくもりのあるベース
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.value = 520; env(g, t, 0.008, peak, dur); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function conga(t, hi, peak) {                     // コンガ(高い/低い)
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    const f0 = hi ? 360 : 230; o.frequency.setValueAtTime(f0 * 1.25, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.06);
    env(g, t, 0.002, peak, hi ? 0.14 : 0.2); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.25);
    hit(t, hi ? 2500 : 1800, peak * 0.35, 0.03);
  }
  function kick(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.003, v, 0.22); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
  }
  function hit(t, hp, peak, dur) {              // ハイハット/クラップ(ノイズ)
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = hp; env(g, t, 0.002, peak, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function schedule() {
    const S = SCENES[scene], spb = 60 / S.bpm, e8 = spb / 2;
    while (nextT < ctx.currentTime + 0.35) {
      const i = step % 64, bar = Math.floor(i / 8), k = i % 8, ch = CHORDS[bar];
      const t = nextT + (k % 2 ? e8 * 0.12 : 0);        // 裏拍をほんの少し遅らせて、島のゆったりしたノリに
      const m = MELODY[i];
      if (m) steelpan(m, t, k % 4 === 3 ? 0.35 : 0.6, S.mel);
      if (S.spark && m && k % 4 === 0) steelpan(m + 12, t + e8 * 0.5, 0.25, S.mel * 0.3);
      if (k % 2 === 1) ch.tones.forEach((n, j) => uke(n, t + j * 0.01, S.uke * (k === 3 ? 1 : 0.75), 0.16));   // 裏拍のカッティング
      if (k === 0) ch.tones.forEach((n, j) => uke(n, t + j * 0.018, S.uke * 1.1, 0.5));                        // 頭は下ろすストローク
      if (k === 0 || k === 3 || k === 6) bassNote(k === 3 ? ch.root + 7 : ch.root + 12, t, e8 * 1.7, S.bass * (k === 0 ? 1 : 0.8));
      if (k === 0 || k === 4) conga(t, false, S.conga); else if (k === 3 || k === 6 || k === 7) conga(t, true, S.conga * 0.8);
      hit(t, k % 2 ? 6000 : 7500, k % 2 ? S.shake * 1.5 : S.shake, 0.05);
      if (S.clave && (k === 0 || k === 3 || k === 6)) tone('sine', 2100, t, 0.04, S.clave, 0.001, false);
      nextT += e8; step++;
    }
  }
  function startLoop() {
    if (timer || !ctx) return;
    nextT = ctx.currentTime + 0.08; step = 0; timer = setInterval(schedule, 40);
  }
  function stopLoop() { clearInterval(timer); timer = null; }
  function applyOn() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
    if (on) { if (ctx.state === 'suspended') ctx.resume(); master.gain.linearRampToValueAtTime(0.9 * vol, t + 0.8); startLoop(); }
    else { master.gain.linearRampToValueAtTime(0, t + 0.4); setTimeout(() => { if (!on) { stopLoop(); ctx.suspend && ctx.suspend(); } }, 500); }
  }
  function updateButton() {
    const b = document.getElementById('btn-music'); if (!b) return;
    b.classList.toggle('off', !on); b.setAttribute('aria-pressed', String(on)); b.title = on ? '音楽: オン' : '音楽: オフ';
  }
  const Music = {
    isOn: () => on,
    /* 最初のタップ/クリックで呼ぶ(ブラウザの仕様で、操作がないと音は鳴らせない) */
    unlock() { if (started) return; if (!init()) return; started = true; applyOn(); },
    toggle() {
      on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 保存できなくても続行 */ }
      if (on && !started) { if (init()) started = true; }
      applyOn(); updateButton(); return on;
    },
    scene(name) { if (SCENES[name]) scene = name; },
    volume: () => vol,
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); try { localStorage.setItem(KEY + '-vol', String(vol)); } catch (e) { /* なし */ } if (ctx && on) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.9 * vol, t + 0.15); } },
    sfxIsOn: () => sfxOn,
    setSfx(b) { sfxOn = !!b; try { localStorage.setItem(KEY + '-sfx', b ? '1' : '0'); } catch (e) { /* なし */ } },
    setOn(b) { if (b !== on) this.toggle(); },
    /* 効果音: done=完成のファンファーレ ok=コースができた */
    sfx(kind) {
      if (!on || !sfxOn || !ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.02;
      const seq = kind === 'done' ? [72, 76, 79, 84, 79, 84, 88] : [79, 84];
      seq.forEach((n, i) => steelpan(n, t + i * 0.1, 0.7, 0.17));
    },
    refresh: updateButton,
  };
  root.Music = Music;
})(typeof self !== 'undefined' ? self : this);
