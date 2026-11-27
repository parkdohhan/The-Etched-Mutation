/**
 * Memory editing (2026-11-28 night). Author: "make an edit tool too, to change a memory — I don't like some of the things."
 *
 * memory-edit.html — for the signed-in owner of a memory (memories.curator_id). What can be changed, scene by scene:
 *   - the thing (the line sculpture): asked for again from the same function the making screen uses (generate-scene-thing,
 *     told what the present one was so the next is drawn differently), looked at turning, then taken or dropped
 *   - the first part (scenes.text) and the second part (scenes.meta.space.b, one line a row)
 * Writes go straight from this account (the database lets an owner — and only an owner — update the scenes of their own
 * memory). A save is live at once: the next walker reads it. Nothing else of a scene is touched (its emotion, its sound,
 * its words afloat stay as they are).
 *
 * A hand-drawn thing (the flagship memory's, in js/spaceplay/things.js) is not a recipe. Replacing one stores the recipe and
 * sets meta.space.thing_over; "back to the hand-drawn one" takes that mark away (the recipe is kept, unused).
 * A memory whose text walkers have changed (remain_texts) reads from there for the changed scenes — editing scenes.text does
 * not show in those scenes until that table is emptied. The card says so.
 */
import * as data from '../roomplay/data.js';
import { makeThing, fromRecipe, sanitizeRecipe, hasHandDrawn, isSilent } from '../spaceplay/things.js?v=261128a';

const $ = (id) => document.getElementById(id);
const sb = () => data.client();
const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
const linesOf = (t) => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
const note = (t) => { $('meNote').textContent = t || ''; };
const status = (t) => { $('meStatus').textContent = t || ''; };

let ME = null, memory = null, scenes = [], changed = new Set(), picked = null, candidate = null, view = null;

// ── the thing, turning (one frame for the whole page: a browser holds only so many of these) ──
function createView(canvas) {
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 100);
  let group = null, thing = null, raf = 0; const t0 = performance.now(); let last = t0;
  function fit() { const w = canvas.clientWidth || 320, h = canvas.clientHeight || Math.round(w * 0.75); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!group) return;
    if (thing && thing.tick) thing.tick((now - t0) / 1000, dt);
    group.rotation.y = ((now - t0) / 1000) * 0.22;                          // slow, wide, heavy (260809)
    renderer.render(scene, cam);
  }
  /** @param th { g, h, tick } — a thing as things.js makes it */
  function show(th) {
    if (group) { scene.remove(group); group = null; }
    thing = th; if (!th) { renderer.render(scene, cam); return; }
    group = new THREE.Group(); th.g.position.y = -th.h / 2; group.add(th.g); scene.add(group);
    const d = Math.max(3.4, th.h * 1.85); cam.position.set(0, th.h * 0.12, d); cam.lookAt(0, 0, 0);
    fit(); if (!raf) raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', fit);
  return { show };
}

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  try { const { data: s } = await sb().auth.getSession(); ME = (s && s.session && s.session.user && s.session.user.id) || null; } catch (_) { ME = null; }
  if (!ME) {
    // ?look=<code>: without signing in, a memory can be looked at here (its text is public anyway) and a thing asked for —
    // nothing can be saved (the database refuses anyone who is not the owner). For checking the tool itself.
    const look = new URLSearchParams(location.search).get('look');
    if (look) {
      const r0 = await sb().from('memories').select('id, code, title, created_at, meta').eq('code', look).limit(1).maybeSingle();
      if (r0.data) { await open(r0.data); note('둘러보기 — 로그인하지 않아 저장은 되지 않습니다.'); return; }
    }
    note('로그인해야 열립니다. 메뉴의 프로필에서 로그인한 뒤 이 주소를 다시 열어 주세요.'); return;
  }
  const r = await sb().from('memories').select('id, code, title, created_at, meta').eq('curator_id', ME).order('created_at');
  if (r.error) { note('기억을 불러오지 못했습니다.'); console.error(r.error); return; }
  const mine = r.data || [];
  if (!mine.length) { note('이 계정이 올린 기억이 없습니다.'); return; }
  note('고칠 기억을 고르세요. 저장을 누르면 바로 사이트에 반영됩니다.');
  const list = $('meList');
  for (const m of mine) {
    const b = el('button', '', m.title || m.code || '제목 없음'); b.type = 'button'; b.dataset.id = m.id;
    b.addEventListener('click', () => open(m));
    list.appendChild(b);
  }
  const want = new URLSearchParams(location.search).get('memory');
  const first = want && mine.find((m) => m.id === want || m.code === want);
  if (first) open(first);
}

async function open(m) {
  memory = m; picked = null; candidate = null;
  document.querySelectorAll('#meList button').forEach((b) => b.classList.toggle('on', b.dataset.id === m.id));
  $('meTitle').textContent = '기억 고치기 — ' + (m.title || m.code || '');
  note('불러오는 중…'); status('');
  const [sc, rt] = await Promise.all([
    sb().from('scenes').select('id, scene_order, text, meta, void_info').eq('memory_id', m.id).order('scene_order'),
    sb().from('remain_texts').select('scene_order').eq('memory_id', m.id),
  ]);
  if (sc.error) { note('장면을 불러오지 못했습니다.'); console.error(sc.error); return; }
  scenes = sc.data || []; changed = new Set((rt.data || []).map((x) => Number(x.scene_order)));
  note('장면 ' + scenes.length + '개. 카드를 누르면 오른쪽에 그 장면의 조형물이 선다.');
  const box = $('meScenes'); box.innerHTML = '';
  for (const s of scenes) box.appendChild(card(s));
  $('meWork').hidden = false;
  view = view || createView($('meCanvas'));
  view.show(null); $('meThingRow').hidden = true; $('meWhat').textContent = ''; $('meSideK').textContent = '장면을 고르면 조형물이 여기 선다';
}

// ── a scene's card: its two parts ───────────────────────────────────────────
function card(s) {
  const c = el('article', 'me-scene'); c.dataset.id = s.id;
  const n = el('p', 'n'); n.append(el('span', '', s.scene_order + '번 장면'), el('span', 'tag', kindOf(s))); c.appendChild(n);
  const sp = (s.meta && s.meta.space) || {};
  const ta = el('textarea'); ta.value = s.text || ''; ta.spellcheck = false;
  const tb = el('textarea', 'b'); tb.value = Array.isArray(sp.b) ? sp.b.join('\n') : (typeof sp.b === 'string' ? sp.b : ''); tb.spellcheck = false; tb.placeholder = '뒷 토막 — 한 줄에 한 문장. 비워 두면 그 장면의 떠 있는 말·묻힌 말에서 가져온다.';
  const la = el('label', '', '앞 토막 (글)'), lb = el('label', '', '뒷 토막');
  const row = el('div', 'row'), save = el('button', '', '글 저장'), saved = el('span', 'saved'); save.type = 'button'; save.disabled = true;
  row.append(save, saved);
  c.append(la, ta, lb, tb, row);
  if (changed.has(Number(s.scene_order))) c.appendChild(el('p', 'now', '이 장면은 관객의 말로 글이 바뀌어 있다 — 여기서 앞 토막을 고쳐도 무대에는 바뀐 글이 읽힌다.'));
  const dirty = () => { save.disabled = ta.value === (s.text || '') && tb.value === (Array.isArray(sp.b) ? sp.b.join('\n') : (typeof sp.b === 'string' ? sp.b : '')); saved.textContent = ''; };
  ta.addEventListener('input', dirty); tb.addEventListener('input', dirty);
  c.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') return; pick(s); });
  save.addEventListener('click', async () => {
    const text = ta.value.trim(); if (!text) { saved.textContent = '앞 토막은 비울 수 없다.'; return; }
    save.disabled = true; saved.textContent = '저장 중…';
    const meta = Object.assign({}, s.meta || {}), space = Object.assign({}, meta.space || {}), b = linesOf(tb.value);
    if (b.length) space.b = b; else delete space.b;
    meta.space = space;
    const r = await sb().from('scenes').update({ text, meta }).eq('id', s.id).select('id');
    if (r.error || !(r.data && r.data.length)) { saved.textContent = '저장하지 못했다' + (r.error ? ' — ' + r.error.message : ' (이 계정의 기억이 아니다)'); save.disabled = false; return; }
    s.text = text; s.meta = meta; saved.textContent = '저장됨';
    if (picked && picked.id === s.id) showThing(s);
  });
  return c;
}
function kindOf(s) {
  if (isSilent(s)) return '침묵 장면 — 빈 고리';
  const sp = (s.meta && s.meta.space) || {}, hand = hasHandDrawn(memory.code, s), own = !!sanitizeRecipe(sp.thing);
  if (hand && !(sp.thing_over && own)) return '손으로 그린 조형물';
  return own ? '받은 조형물' : '조형물 없음 (막대 하나)';
}
function refreshTag(s) { const c = document.querySelector('.me-scene[data-id="' + s.id + '"] .tag'); if (c) c.textContent = kindOf(s); }

// ── the thing of the picked scene ───────────────────────────────────────────
function pick(s) {
  picked = s; candidate = null;
  document.querySelectorAll('.me-scene').forEach((c) => c.classList.toggle('on', c.dataset.id === s.id));
  showThing(s);
}
function showThing(s) {
  const sp = (s.meta && s.meta.space) || {}, own = sanitizeRecipe(sp.thing), hand = hasHandDrawn(memory.code, s), silent = isSilent(s);
  $('meSideK').textContent = s.scene_order + '번 장면의 조형물 — ' + kindOf(s);
  view.show(makeThing(memory.code, s));
  $('meWhat').textContent = silent ? '' : (hand && !(sp.thing_over && own) ? '' : (own && own.note) || '');
  $('meThingRow').hidden = silent;
  $('meAgain').hidden = false; $('meAgain').disabled = false; $('meTake').hidden = true; $('meDrop').hidden = true;
  $('meHand').hidden = !(hand && sp.thing_over);
  status(silent ? '침묵 장면의 조형물은 바꾸지 않는다.' : '');
}
/** What the present thing was, so the next is drawn differently (a hand-drawn one has no note: the scene's own first sentence stands in). */
function presentNote(s) {
  const own = sanitizeRecipe(s.meta && s.meta.space && s.meta.space.thing);
  return (candidate && candidate.note) || (own && own.note) || '';
}
async function again() {
  const s = picked; if (!s) return;
  const text = String(s.text || '').trim();
  if (text.length < 8) { status('글이 너무 짧아 조형물을 받을 수 없다.'); return; }
  $('meAgain').disabled = true; status('받는 중… (몇십 초 걸린다)');
  try {
    const sp = (s.meta && s.meta.space) || {}, props = (s.meta && s.meta.piece && Array.isArray(s.meta.piece.props)) ? s.meta.piece.props : [];
    const words = Array.isArray(sp.words) ? sp.words : props.filter((p) => p && p.kind === 'word' && p.text).map((p) => String(p.text));
    const deep = Array.isArray(sp.deep) ? sp.deep : props.filter((p) => p && p.kind === 'buried' && p.text).map((p) => String(p.text));
    const lang = /[가-힣]/.test(text) ? 'ko' : 'en';
    const resp = await sb().functions.invoke('generate-scene-thing', { body: { sceneText: text, b: Array.isArray(sp.b) ? sp.b : linesOf(sp.b), words, deep, lang, avoid: presentNote(s) } });
    const recipe = resp && !resp.error && resp.data && resp.data.ok && sanitizeRecipe(resp.data.recipe);
    if (!recipe) throw new Error((resp && resp.data && resp.data.error) || (resp && resp.error && resp.error.message) || 'no recipe');
    if (picked !== s) return;                                                // another scene was picked meanwhile
    candidate = recipe;
    view.show(fromRecipe(recipe));
    $('meWhat').textContent = recipe.note || '';
    $('meSideK').textContent = s.scene_order + '번 장면 — 새로 받은 것 (아직 안 바꿨다)';
    $('meTake').hidden = false; $('meDrop').hidden = false;
    status('마음에 들면 "이걸로 바꾼다", 아니면 "다시 받기"나 "버린다".');
  } catch (e) { console.warn('[memory-edit] thing', e); status('받지 못했다 — 다시 눌러 주세요.'); }
  $('meAgain').disabled = false;
}
async function saveSpace(s, change) {
  const meta = Object.assign({}, s.meta || {}), space = Object.assign({}, meta.space || {});
  change(space); meta.space = space;
  const r = await sb().from('scenes').update({ meta }).eq('id', s.id).select('id');
  if (r.error || !(r.data && r.data.length)) { status('저장하지 못했다' + (r.error ? ' — ' + r.error.message : ' (이 계정의 기억이 아니다)')); return false; }
  s.meta = meta; return true;
}
async function take() {
  const s = picked, recipe = candidate; if (!s || !recipe) return;
  $('meTake').disabled = true;
  const hand = hasHandDrawn(memory.code, s);
  const ok = await saveSpace(s, (space) => { space.thing = recipe; if (hand) space.thing_over = true; });
  $('meTake').disabled = false;
  if (!ok) return;
  candidate = null; refreshTag(s); showThing(s); status('바꿨다. 지금부터 무대에 이 조형물이 선다.');
}
function drop() { if (!picked) return; candidate = null; showThing(picked); status('버렸다. 지금 것 그대로다.'); }
async function backToHand() {
  const s = picked; if (!s) return;
  const ok = await saveSpace(s, (space) => { delete space.thing_over; });
  if (!ok) return;
  candidate = null; refreshTag(s); showThing(s); status('손으로 그린 것으로 되돌렸다.');
}
$('meAgain').addEventListener('click', again);
$('meTake').addEventListener('click', take);
$('meDrop').addEventListener('click', drop);
$('meHand').addEventListener('click', backToHand);

boot();
