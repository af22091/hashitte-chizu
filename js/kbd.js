/* アプリ内のキーボード(フリック / QWERTY)。設定で「端末のもの」「フリック」「QWERTY」から選ぶ。
   検索欄(#search, #place-q)にだけ使う。端末のキーボードは出さない(inputmode="none")。 */
(function (root) {
  'use strict';
  const TARGETS = '#search, #place-q';
  const KANA = [['あ', 'い', 'う', 'え', 'お'], ['か', 'き', 'く', 'け', 'こ'], ['さ', 'し', 'す', 'せ', 'そ'], ['た', 'ち', 'つ', 'て', 'と'], ['な', 'に', 'ぬ', 'ね', 'の'], ['は', 'ひ', 'ふ', 'へ', 'ほ'], ['ま', 'み', 'む', 'め', 'も'], ['や', '（', 'ゆ', '）', 'よ'], ['ら', 'り', 'る', 'れ', 'ろ'], ['わ', 'を', 'ん', 'ー', '〜'], ['、', '。', '？', '！', '…']];
  const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, null, 9, 10];            // 3列×4行(null=小゛゜キー)
  const CYCLES = ['あぁ', 'いぃ', 'うぅ', 'えぇ', 'おぉ', 'かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ', 'ただ', 'ちぢ', 'てで', 'とど', 'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ', 'つっづ', 'やゃ', 'ゆゅ', 'よょ', 'わゎ'].map(s => [...s]);
  const QROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const T = x => (root.I18N ? root.I18N.tr(x) : x);
  let mode = 'system', layout = 'flick', el = null, input = null, cand = () => [], hideTimer = 0;

  const kata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  function insert(text) {
    if (!input) return; const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
    input.setRangeText(text, a, b, 'end'); input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function back() {
    if (!input) return; const a = input.selectionStart ?? 0, b = input.selectionEnd ?? a;
    if (a !== b) input.setRangeText('', a, b, 'end'); else if (a > 0) input.setRangeText('', a - 1, a, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function modifier() {                                              // 直前の文字を 濁点/半濁点/小さい字 に切り替える
    if (!input) return; const a = input.selectionStart ?? 0; if (a < 1) return; const ch = input.value[a - 1];
    const cy = CYCLES.find(c => c.includes(ch)); if (!cy) return;
    input.setRangeText(cy[(cy.indexOf(ch) + 1) % cy.length], a - 1, a, 'end'); input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function enter() {
    if (!input) return; const f = input.form;
    if (f) { f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true })); }
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    hide();
  }

  function build() {
    if (el) el.remove();
    el = document.createElement('div'); el.id = 'kbd'; el.setAttribute('data-notr', ''); el.hidden = true;
    el.addEventListener('pointerdown', e => { e.preventDefault(); clearTimeout(hideTimer); });          // 入力欄からフォーカスを外さない
    const bar = document.createElement('div'); bar.className = 'kbd-cand'; el.appendChild(bar);
    const body = document.createElement('div'); body.className = 'kbd-body ' + layout; el.appendChild(body);
    const pop = document.createElement('div'); pop.className = 'kbd-pop'; pop.hidden = true; el.appendChild(pop);
    const mk = (cls, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'kk ' + cls; b.textContent = label; b.addEventListener('click', fn); return b; };
    if (layout === 'flick') {
      const col0 = document.createElement('div'); col0.className = 'col0';
      col0.append(mk('fn', 'ABC', () => { layout = 'qwerty'; build(); show(); }), mk('fn', '☆', () => insert('　')));
      const grid = document.createElement('div'); grid.className = 'grid';
      ORDER.forEach(i => {
        if (i === null) { grid.appendChild(mk('fn', '小゛゜', modifier)); return; }
        const set = KANA[i], b = document.createElement('button'); b.type = 'button'; b.className = 'kk flick'; b.textContent = set[0];
        let x0 = 0, y0 = 0, down = false, pick = 0;
        const dir = (dx, dy) => (Math.abs(dx) < 16 && Math.abs(dy) < 16) ? 0 : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 2 : 4);
        b.addEventListener('pointerdown', e => { down = true; x0 = e.clientX; y0 = e.clientY; pick = 0; try { b.setPointerCapture(e.pointerId); } catch (x) { /* なし */ } showPop(b, set, 0); });
        b.addEventListener('pointermove', e => { if (!down) return; const d = dir(e.clientX - x0, e.clientY - y0); if (d !== pick) { pick = d; showPop(b, set, d); } });
        const up = () => { if (!down) return; down = false; pop.hidden = true; insert(set[pick]); };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', () => { down = false; pop.hidden = true; });
        grid.appendChild(b);
      });
      const col4 = document.createElement('div'); col4.className = 'col4';
      col4.append(mk('fn', '⌫', back), mk('fn', T('空白'), () => insert('　')), mk('fn go', T('検索'), enter));
      body.append(col0, grid, col4);
    } else {
      QROWS.forEach((r, ri) => {
        const row = document.createElement('div'); row.className = 'qrow r' + ri;
        [...r].forEach(c => row.appendChild(mk('q', c, () => insert(c))));
        if (ri === 3) row.appendChild(mk('fn', '⌫', back));
        body.appendChild(row);
      });
      const last = document.createElement('div'); last.className = 'qrow last';
      last.append(mk('fn', 'あ', () => { layout = 'flick'; build(); show(); }), mk('q sp', T('空白'), () => insert(' ')), mk('fn go', T('検索'), enter));
      body.appendChild(last);
    }
    function showPop(b, set, d) {
      const r = b.getBoundingClientRect(), pr = el.getBoundingClientRect();
      pop.hidden = false; pop.textContent = set[d]; pop.style.left = (r.left - pr.left + r.width / 2) + 'px'; pop.style.top = (r.top - pr.top - 46) + 'px';
    }
    document.body.appendChild(el); renderCand();
  }
  function renderCand() {
    if (!el) return; const bar = el.querySelector('.kbd-cand'); bar.textContent = '';
    if (!input || input.id !== 'search') { bar.hidden = true; return; }
    const list = cand(input.value) || []; bar.hidden = !list.length;
    list.slice(0, 8).forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'kc'; b.textContent = c.label; b.addEventListener('click', () => { input.value = c.value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); hide(); }); bar.appendChild(b); });
  }
  function setH() { const h = el && !el.hidden ? Math.round(el.getBoundingClientRect().height) : 0; document.documentElement.style.setProperty('--kbd', h + 'px'); document.documentElement.classList.toggle('kbd-on', h > 0); }
  function show() { if (!el) build(); el.hidden = false; renderCand(); requestAnimationFrame(() => { setH(); try { input && input.scrollIntoView({ block: 'center' }); } catch (e) { /* なし */ } }); }
  function hide() { if (el) el.hidden = true; setH(); }

  document.addEventListener('focusin', e => {
    const t = e.target; if (mode === 'system' || !t.matches || !t.matches(TARGETS)) return;
    input = t; clearTimeout(hideTimer); show();
  });
  document.addEventListener('focusout', e => { if (e.target.matches && e.target.matches(TARGETS)) hideTimer = setTimeout(hide, 120); });
  document.addEventListener('input', e => { if (input && e.target === input) renderCand(); });

  function apply() {
    document.querySelectorAll(TARGETS).forEach(i => { i.inputMode = mode === 'system' ? 'search' : 'none'; });
    if (mode === 'system') hide(); else { layout = mode === 'qwerty' ? 'qwerty' : 'flick'; if (el) { build(); el.hidden = true; } }
  }
  root.Kbd = { setMode(m) { mode = m === 'flick' || m === 'qwerty' ? m : 'system'; apply(); }, setCandidates(fn) { cand = fn; }, refresh() { if (el) { const was = !el.hidden; build(); el.hidden = !was; setH(); } }, kata };
  window.addEventListener('i18nchange', () => root.Kbd.refresh());
})(window);
