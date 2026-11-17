/* BGM(オリジナル): 音声ファイルは使わず、ブラウザ内で自動演奏する。著作権の心配がなく、容量も増えない。
   場面ごとに曲調が変わる: calm=ふだん / work=コース作成中 / run=走行中 */
(function (root) {
  'use strict';
  const KEY = 'hashitte-music-v1';
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // 4小節のコード進行(C△7 → Am7 → F△7 → G6)。各和音は [ルート, 構成音...] のMIDIノート番号
  const CHORDS = [
    { root: 36, tones: [48, 52, 55, 59] },
    { root: 33, tones: [45, 48, 52, 55] },
    { root: 41, tones: [45, 48, 52, 57] },
    { root: 43, tones: [43, 47, 50, 52] },
  ];
  const SCENES = {
    calm: { bpm: 84, pad: 0.05, arp: 0.5, bass: false, kick: 0, hat: false, clap: false, oct: 12 },
    work: { bpm: 108, pad: 0.04, arp: 0.85, bass: true, kick: 2, hat: true, clap: false, oct: 12 },
    run: { bpm: 140, pad: 0.035, arp: 1, bass: true, kick: 4, hat: true, clap: true, oct: 24 },
  };
  const PATTERN = [0, 2, 1, 3, 2, 1, 3, 2];

  let ctx = null, master = null, fx = null, noise = null, timer = null;
  let on = true, scene = 'calm', step = 0, nextT = 0, started = false;
  try { const v = localStorage.getItem(KEY); if (v !== null) on = v === '1'; } catch (e) { /* 初期値のまま */ }

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
  function pad(chord, t, dur, level) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.connect(master); f.connect(fx);
    for (const n of chord.tones) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = midi(n); o.detune.value = det;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level / 3, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(f); o.start(t); o.stop(t + dur + 0.05);
      }
    }
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
      const i = step % 32, bar = Math.floor(i / 8) % 4, k = i % 8, ch = CHORDS[bar], t = nextT;
      if (k === 0) pad(ch, t, e8 * 8 + 0.4, S.pad);
      if (Math.random() < S.arp) {
        const note = ch.tones[PATTERN[k] % ch.tones.length] + S.oct;
        tone('triangle', midi(note), t, 0.32, 0.055, 0.004, true);
        if (scene === 'run' && k % 4 === 3) tone('sine', midi(note + 12), t, 0.2, 0.03, 0.004, true);
      }
      if (S.bass && (k === 0 || k === 4 || (scene === 'run' && k === 6))) tone('sine', midi(ch.root), t, e8 * 1.6, 0.16, 0.01, false);
      if (S.kick && (k % 2 === 0) && (S.kick === 4 || k === 0 || k === 4)) kick(t, 0.32);
      if (S.hat && k % 2 === 1) hit(t, 7000, scene === 'run' ? 0.05 : 0.03, 0.05);
      if (S.clap && (k === 2 || k === 6)) hit(t, 1500, 0.07, 0.12);
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
    if (on) { if (ctx.state === 'suspended') ctx.resume(); master.gain.linearRampToValueAtTime(0.9, t + 0.8); startLoop(); }
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
    /* 効果音: done=完成のファンファーレ ok=コースができた */
    sfx(kind) {
      if (!on || !ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.02;
      const seq = kind === 'done' ? [72, 76, 79, 84, 88] : [76, 83];
      seq.forEach((n, i) => { tone('triangle', midi(n), t + i * 0.11, 0.5, 0.12, 0.005, true); tone('sine', midi(n + 12), t + i * 0.11, 0.35, 0.04, 0.005, true); });
    },
    refresh: updateButton,
  };
  root.Music = Music;
})(typeof self !== 'undefined' ? self : this);
