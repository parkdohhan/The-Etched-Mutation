/**
 * The pause sheet (2026-11-23) — Esc, at any time in the walk: brightness, volume, leave, go back.
 *
 * The old terrain stage had one (play-test.html #escMenu); the space stage had none. Same look, same stored
 * values (brightness: localStorage 'tem_brightness', as the main screen's settings; volume: 'tem_volume').
 * No language row here: changing it reloads the page and the walk would be lost.
 *
 * A browser does not hand the page the Esc that lets the cursor go — so the caller also opens this when the
 * cursor was let go by the walker (cosmos onEscape), not only on the key.
 *
 * While it is up, key presses do not reach the place and held keys are let go (the walker does not drift on under the sheet).
 */
const BRIGHT_KEY = 'tem_brightness', VOL_KEY = 'tem_volume';
const num = (v, d, lo, hi) => { const n = parseFloat(v); return isNaN(n) ? d : Math.max(lo, Math.min(hi, n)); };
const read = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (_) {} };

const CSS = `
#spEsc{display:none;position:fixed;inset:0;z-index:9000;background:rgba(6,6,10,.88);backdrop-filter:blur(0.5rem);-webkit-backdrop-filter:blur(0.5rem);justify-content:center;align-items:center;cursor:default}
#spEsc.on{display:flex}
#spEsc .p{text-align:center;min-width:17.5rem;max-width:21.25rem;font-family:'Cormorant Garamond','Noto Serif KR',serif}
#spEsc .t{font-size:0.813rem;letter-spacing:0.375rem;color:rgba(196,168,130,.4);margin-bottom:2.5rem;text-transform:uppercase}
#spEsc .r{display:flex;align-items:center;justify-content:space-between;gap:0.875rem;padding:0.875rem 0;border-bottom:1px solid rgba(196,168,130,.08)}
#spEsc .l{font-size:0.875rem;letter-spacing:1px;color:rgba(196,168,130,.7)}
#spEsc input[type=range]{width:7.5rem;accent-color:#c4a882}
#spEsc .v{font-size:0.75rem;color:rgba(196,168,130,.5);min-width:2.25rem;text-align:right}
#spEsc button{background:none;font-family:inherit;cursor:pointer;transition:all .3s}
#spEsc .x{margin-top:2rem;border:1px solid rgba(180,80,80,.3);color:rgba(180,80,80,.7);font-size:0.813rem;letter-spacing:0.188rem;padding:0.625rem 2rem;border-radius:0.188rem}
#spEsc .x:hover,#spEsc .x.sure{border-color:rgba(180,80,80,.6);color:rgba(180,80,80,1)}
#spEsc .e{display:block;margin:2rem auto 0;border:1px solid rgba(196,168,130,.35);color:rgba(196,168,130,.8);font-size:0.813rem;letter-spacing:0.188rem;padding:0.625rem 2rem;border-radius:0.188rem}
#spEsc .e:hover,#spEsc .e.sure{border-color:rgba(240,216,170,.8);color:rgba(240,216,170,1)}
#spEsc .e+.x{margin-top:0.9rem}
#spEsc .b{display:block;margin:1rem auto 0;border:none;color:rgba(196,168,130,.35);font-size:0.688rem;letter-spacing:0.188rem;padding:0.5rem 1.25rem}
#spEsc .b:hover{color:rgba(196,168,130,.6)}
`;

/**
 * @param {object} o
 * @param {boolean} o.ko
 * @param {(v:number)=>void} o.setVolume   0..1, applied to everything that sounds
 * @param {()=>boolean} [o.busy]           something of its own is up on Esc (the map): leave the key to it
 * @param {()=>void} [o.onOpen]
 * @param {(byHand:boolean)=>void} [o.onClose]
 * @param {()=>void} o.onLeave
 * @param {()=>void} [o.onEnd]             261128 (author: "split leaving in two — back to the menu, or end the story here"): given, a second button stands above the first: the walk is ended here and its ending is shown
 */
export function createEscMenu(o) {
  const ko = o.ko !== false;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'spEsc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = '<div class="p"><div class="t"></div>'
    + '<div class="r"><span class="l" data-k="b"></span><input type="range" data-k="bs" min="0.5" max="1.5" step="0.05"><span class="v" data-k="bv"></span></div>'
    + '<div class="r"><span class="l" data-k="s"></span><input type="range" data-k="ss" min="0" max="1" step="0.05"><span class="v" data-k="sv"></span></div>'
    + (o.onEnd ? '<button type="button" class="e"></button>' : '') + '<button type="button" class="x"></button><button type="button" class="b"></button></div>';
  document.body.appendChild(el);
  const q = (k) => el.querySelector('[data-k="' + k + '"]');
  const title = el.querySelector('.t'), exit = el.querySelector('.x'), back = el.querySelector('.b');
  title.textContent = ko ? '멈춤' : 'paused';
  q('b').textContent = ko ? '밝기' : 'Brightness'; q('s').textContent = ko ? '소리' : 'Volume';
  back.textContent = ko ? 'ESC 로 돌아가기' : 'press ESC to resume';
  const exitText = () => { exit.textContent = exit.classList.contains('sure') ? (ko ? '한 번 더 누르면 나갑니다' : 'press again to leave') : (o.onEnd ? (ko ? '메뉴 화면으로 돌아가기' : 'Back to the menu') : (ko ? '나가기' : 'Exit')); };
  const end = el.querySelector('.e');
  const endText = () => { if (end) end.textContent = end.classList.contains('sure') ? (ko ? '한 번 더 누르면 여기서 끝납니다' : 'press again to end here') : (ko ? '이야기를 여기서 끝마치기' : 'End the story here'); };

  let open = false, openedAt = 0, focusWas = null;
  const pct = (v) => Math.round(v * 100) + '%';
  function bright(v, keep) { document.documentElement.style.filter = v === 1 ? '' : 'brightness(' + v + ')'; q('bs').value = v; q('bv').textContent = pct(v); if (keep) write(BRIGHT_KEY, v); }
  function volume(v, keep) { q('ss').value = v; q('sv').textContent = pct(v); if (o.setVolume) o.setVolume(v); if (keep) write(VOL_KEY, v); }
  bright(num(read(BRIGHT_KEY), 1, 0.5, 1.5), false);
  volume(num(read(VOL_KEY), 1, 0, 1), false);
  q('bs').addEventListener('input', () => bright(num(q('bs').value, 1, 0.5, 1.5), true));
  q('ss').addEventListener('input', () => volume(num(q('ss').value, 1, 0, 1), true));

  function show() {
    if (open) return; open = true; openedAt = performance.now();
    focusWas = document.activeElement && document.activeElement !== document.body ? document.activeElement : null; if (focusWas && focusWas.blur) focusWas.blur();   // a field under the sheet takes no typing
    exit.classList.remove('sure'); exitText(); if (end) { end.classList.remove('sure'); endText(); } el.classList.add('on');
    if (o.onOpen) o.onOpen();
  }
  function hide(byHand) {
    if (!open) return; open = false; el.classList.remove('on');
    if (focusWas && focusWas.isConnected && focusWas.focus) { try { focusWas.focus(); } catch (_) {} } focusWas = null;
    if (o.onClose) o.onClose(!!byHand);
  }
  back.addEventListener('click', () => hide(true));
  el.addEventListener('click', (e) => { if (e.target === el) hide(true); });
  exit.addEventListener('click', () => { if (!exit.classList.contains('sure')) { exit.classList.add('sure'); exitText(); return; } if (o.onLeave) o.onLeave(); });
  if (end) end.addEventListener('click', () => { if (!end.classList.contains('sure')) { end.classList.add('sure'); endText(); exit.classList.remove('sure'); exitText(); return; } hide(false); o.onEnd(); });

  // capture: before the place's own key handlers
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!open && o.busy && o.busy()) return;                               // the map closes itself on this key
      e.preventDefault(); e.stopPropagation();
      if (open) { if (performance.now() - openedAt > 250) hide(true); }      // (the key that let the cursor go may also arrive here)
      else show();
      return;
    }
    if (open && !el.contains(e.target)) { e.stopPropagation(); }
  }, true);

  return { open: show, close: () => hide(false), isOpen: () => open };
}
