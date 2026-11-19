/* BGM(オリジナル): 音声ファイルは使わず、ブラウザ内で自動演奏する。著作権の心配がなく、容量も増えない。
   場面ごとに曲調が変わる: calm=ふだん / work=コース作成中 / run=走行中 */
(function (root) {
  'use strict';
  const KEY = 'hashitte-music-v1';
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // 8小節のコード進行(C → G/B → Am7 → Em7 → F → C/E → Dm7 → G7)。ほのぼのポップな明るい響き
  const CHORDS = [
    { root: 36, tones: [60, 64, 67] }, { root: 31, tones: [59, 62, 67] }, { root: 33, tones: [60, 64, 67, 69] }, { root: 40, tones: [59, 62, 67, 64] },
    { root: 41, tones: [60, 65, 69] }, { root: 40, tones: [60, 64, 67] }, { root: 38, tones: [60, 65, 69, 62] }, { root: 43, tones: [59, 62, 65, 67] },
  ];
  // メロディ(オリジナル): 1小節 = 8分音符8つ。0は休み
  const MELODY = [
    76, 0, 79, 0, 76, 74, 72, 0,   74, 0, 71, 74, 79, 0, 74, 0,   76, 0, 72, 0, 69, 72, 76, 0,   79, 0, 76, 74, 76, 0, 0, 0,
    77, 0, 81, 0, 77, 76, 72, 0,   76, 0, 79, 0, 84, 0, 79, 0,     77, 0, 74, 0, 77, 81, 77, 0,   79, 0, 77, 74, 71, 0, 74, 0,
  ];
  const SCENES = {
    calm: { bpm: 90, mel: 0.075, pluck: 0.03, bass: 0.13, shake: 0.018, tick: 0.02, kick: 0, clap: false, spark: false },
    work: { bpm: 106, mel: 0.07, pluck: 0.032, bass: 0.15, shake: 0.026, tick: 0.03, kick: 2, clap: false, spark: false },
    run: { bpm: 124, mel: 0.07, pluck: 0.034, bass: 0.17, shake: 0.032, tick: 0.035, kick: 4, clap: true, spark: true },
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
    fx = ctx.createGain(); fx.gain.value = 0.35;
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
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
  function marimba(n, t, dur, peak) {              // やわらかい木琴/ベルのような音
    const f = midi(n);
    tone('sine', f, t, dur, peak, 0.003, true);
    tone('triangle', f * 4, t, 0.09, peak * 0.35, 0.002, true);
    tone('sine', f * 2, t, dur * 0.5, peak * 0.3, 0.003, true);
  }
  function pluck(n, t, peak) {                      // ウクレレのような軽いはじき
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = midi(n); f.type = 'lowpass'; f.frequency.value = 2200;
    env(g, t, 0.004, peak, 0.42); o.connect(f); f.connect(g); g.connect(master); g.connect(fx); o.start(t); o.stop(t + 0.5);
  }
  function bassNote(n, t, dur, peak) {              // ぽよんと弾むベース
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(midi(n) * 1.5, t); o.frequency.exponentialRampToValueAtTime(midi(n), t + 0.05);
    env(g, t, 0.006, peak, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
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
      const t = nextT + (k % 2 ? e8 * 0.16 : 0);       // 裏拍を少し遅らせて、弾むノリに
      const m = MELODY[i];
      if (m) marimba(m, t, k % 4 === 3 ? 0.3 : 0.5, S.mel);
      if (S.spark && m && k % 2 === 0) marimba(m + 12, t + e8 * 0.5, 0.22, S.mel * 0.35);
      if (k === 0 || k === 3 || k === 6) ch.tones.slice().sort((a, b) => a - b).forEach((n, j) => pluck(n - 12, t + j * 0.012, S.pluck * (k === 3 ? 0.8 : 1)));
      if (k === 0 || k === 3 || k === 4) bassNote(ch.root + 12, t, e8 * 1.5, S.bass * (k === 3 ? 0.8 : 1));
      if (S.kick && ((S.kick === 4 && k % 2 === 0) || k === 0 || k === 4)) kick(t, 0.2);
      if (k % 2 === 1) hit(t, 6500, S.shake * 1.5, 0.05); else hit(t, 8000, S.shake, 0.04);
      if (k === 2 || k === 6) tone('sine', 1250, t, 0.035, S.tick, 0.001, false);
      if (S.clap && (k === 2 || k === 6)) hit(t, 1800, 0.05, 0.1);
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
      seq.forEach((n, i) => marimba(n, t + i * 0.1, 0.6, 0.16));
    },
    refresh: updateButton,
  };
  root.Music = Music;
})(typeof self !== 'undefined' ? self : this);
