/**
 * Memory editing (2026-11-28 night). Author: "make an edit tool too, to change a memory — I don't like some of the things."
 *
 * memory-edit.html — for the signed-in owner of a memory (memories.curator_id). What can be changed, scene by scene:
 *   - the thing (the line sculpture): asked for from the same function the making screen uses (generate-scene-thing) — in the
 *     author's own words if they write any, else from the scene's text (told what the present one was, so the next is drawn
 *     differently); looked at from every side, nearer and farther; then taken or dropped
 *   - the sound: made from the author's own words (generate-scene-sound), heard here, then taken or dropped; its loudness; or none
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

let ME = null, memory = null, scenes = [], changed = new Set(), picked = null, candidate = null, view = null, source = '';

// ── the thing, turning (one frame for the whole page: a browser holds only so many of these) ──
function createView(canvas) {
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 400);
  let group = null, thing = null, raf = 0; const t0 = performance.now(); let last = t0;
  // 261128 (author: "let me see what the thing looks like — nearer, farther, from this side and that"). The first version set the
  // distance from the thing's height alone, so a wide thing (the bathtub) ran out of the frame. Now the whole of it is fitted,
  // and the eye is the author's: drag to turn it, the wheel (or two fingers) for nearer and farther, a double press for the start.
  let yaw = 0.5, pitch = 0.18, zoom = 1, radius = 2, touchedAt = -1e9;     // radius = half the thing's whole size
  const YAW0 = 0.5, PITCH0 = 0.18;
  function fit() { const w = canvas.clientWidth || 320, h = canvas.clientHeight || Math.round(w * 0.75); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  function place() {
    const half = (cam.fov * Math.PI) / 360, halfH = Math.atan(Math.tan(half) * Math.min(1, cam.aspect));   // the narrower of the two openings
    const d = (radius / Math.sin(halfH)) * 1.08 * zoom;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    cam.lookAt(0, 0, 0);
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!group) return;
    if (thing && thing.tick) thing.tick((now - t0) / 1000, dt);
    if (now - touchedAt > 3500) yaw += dt * 0.22;                           // left alone it turns, slowly (260809); a hand on it stops that for a while
    place();
    renderer.render(scene, cam);
  }
  /** @param th { g, h, tick } — a thing as things.js makes it */
  function show(th) {
    if (group) { scene.remove(group); group = null; }
    thing = th; if (!th) { renderer.render(scene, cam); return; }
    group = new THREE.Group(); group.add(th.g); scene.add(group);
    th.g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(th.g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    th.g.position.sub(c);                                                   // its middle in the middle of the frame
    radius = Math.max(0.4, size.length() / 2);
    yaw = YAW0; pitch = PITCH0; zoom = 1; touchedAt = -1e9;
    fit(); place(); if (!raf) raf = requestAnimationFrame(frame);
  }
  // the author's hand
  const ptr = new Map(); let pinch = 0;
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => { ptr.set(e.pointerId, [e.clientX, e.clientY]); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} canvas.style.cursor = 'grabbing'; touchedAt = performance.now(); pinch = 0; });
  canvas.addEventListener('pointermove', (e) => {
    const was = ptr.get(e.pointerId); if (!was) return;
    ptr.set(e.pointerId, [e.clientX, e.clientY]); touchedAt = performance.now();
    if (ptr.size === 1) { yaw -= (e.clientX - was[0]) * 0.008; pitch = Math.max(-1.35, Math.min(1.35, pitch + (e.clientY - was[1]) * 0.008)); }
    else if (ptr.size === 2) { const [a, b] = Array.from(ptr.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom = Math.max(0.25, Math.min(4, zoom * (pinch / d))); pinch = d; }
  });
  const up = (e) => { ptr.delete(e.pointerId); pinch = 0; if (!ptr.size) canvas.style.cursor = 'grab'; touchedAt = performance.now(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.25, Math.min(4, zoom * Math.exp(e.deltaY * 0.0012))); touchedAt = performance.now(); }, { passive: false });
  canvas.addEventListener('dblclick', () => { yaw = YAW0; pitch = PITCH0; zoom = 1; touchedAt = -1e9; });
  window.addEventListener('resize', fit);
  return { show, state: () => ({ yaw, pitch, zoom, radius }) };
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
  const [sc, rt, src] = await Promise.all([
    sb().from('scenes').select('id, scene_order, text, meta, void_info').eq('memory_id', m.id).order('scene_order'),
    sb().from('remain_texts').select('scene_order').eq('memory_id', m.id),
    sb().from('memory_sources').select('text').eq('memory_id', m.id).maybeSingle(),      // the story this memory's first draft was taken from, if it was made that way (only its owner can read it)
  ]);
  source = (src && !src.error && src.data && src.data.text) || '';
  $('meSource').hidden = !source;
  if (sc.error) { note('장면을 불러오지 못했습니다.'); console.error(sc.error); return; }
  scenes = sc.data || []; changed = new Set((rt.data || []).map((x) => Number(x.scene_order)));
  note('장면 ' + scenes.length + '개. 카드를 누르면 오른쪽에 그 장면의 조형물이 선다.');
  const box = $('meScenes'); box.innerHTML = '';
  for (const s of scenes) box.appendChild(card(s));
  $('meWork').hidden = false;
  view = view || createView($('meCanvas'));
  view.show(null); $('meThingBox').hidden = true; $('meSoundBox').hidden = true; $('meWhat').textContent = ''; $('meSideK').textContent = '장면을 고르면 조형물이 여기 선다';
}

// ── a scene's card: its two parts ───────────────────────────────────────────
function card(s) {
  const c = el('article', 'me-scene'); c.dataset.id = s.id;
  const n = el('p', 'n'); n.append(el('span', '', s.scene_order + '번 장면'), el('span', 'tag', kindOf(s))); c.appendChild(n);
  const sp = (s.meta && s.meta.space) || {};
  const ta = el('textarea'); ta.value = s.text || ''; ta.spellcheck = false;
  // 261128 (author: "it says the second part is taken from the words afloat and the words buried — then show me WHICH words
  // come out, or how am I to change them"). A scene with no second part of its own is shown the very lines the stage reads
  // there (stageB = the stage's own rule), in the box, to be changed and saved; saved, they are that scene's own second part.
  const ownB = Array.isArray(sp.b) ? sp.b.join('\n') : (typeof sp.b === 'string' ? sp.b : ''), auto = ownB.trim() ? null : stageB(s);
  const shownB = ownB.trim() ? ownB : auto.lines.join('\n');
  const tb = el('textarea', 'b'); tb.value = shownB; tb.spellcheck = false; tb.placeholder = '뒷 토막 — 한 줄에 한 문장. (이 장면에는 가져올 말도 없다 — 비워 두면 뒷 토막 없이 앞 토막만 읽힌다.)';
  const la = el('label', '', '앞 토막 (글)'), lb = el('label', '', auto ? (auto.lines.length ? '뒷 토막 — 지금 무대에 나오는 줄 (떠 있는 말·묻힌 말에서 가져온 것). 고쳐서 저장하면 이 줄들로 정해진다.' : '뒷 토막 — 지금 무대에는 없다') : '뒷 토막 — 직접 정한 줄');
  const row = el('div', 'row'), save = el('button', '', '글 저장'), saved = el('span', 'saved'); save.type = 'button'; save.disabled = true;
  row.append(save, saved);
  c.append(la, ta, lb, tb, row);
  if (auto && auto.left.length) c.appendChild(el('p', 'now', '뒷 토막에 못 들어가고 조형물 곁에 떠 있기만 하는 말: ' + auto.left.join(' · ')));
  if (changed.has(Number(s.scene_order))) c.appendChild(el('p', 'now', '이 장면은 관객의 말로 글이 바뀌어 있다 — 여기서 앞 토막을 고쳐도 무대에는 바뀐 글이 읽힌다.'));
  const dirty = () => { save.disabled = ta.value === (s.text || '') && tb.value === shownB; saved.textContent = ''; };
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
/**
 * The second part as the stage reads it when the scene has none of its own — the stage's rule, copied (js/spaceremain/main.js
 * pieceLines · partB; the same in js/spaceblank/main.js): the scene's words afloat and its buried / speaking lines, five at
 * most, the lines first kept whole and the words put before them; the words that do not fit stay afloat by the thing.
 * @returns { lines: [the second part], left: [words that only float] }
 */
function stageB(s) {
  if (isSilent(s)) return { lines: [], left: [] };
  const sp = (s.meta && s.meta.space) || {};
  let words, deep;
  if (Array.isArray(sp.words) || Array.isArray(sp.deep)) { words = (sp.words || []).map((t) => String(t).trim()).filter(Boolean); deep = (sp.deep || []).map((t) => String(t).trim()).filter(Boolean); }
  else {
    const props = (s.meta && s.meta.piece && Array.isArray(s.meta.piece.props)) ? s.meta.piece.props : [];
    words = props.filter((p) => p && p.kind === 'word' && p.text).map((p) => String(p.text).trim());
    deep = props.filter((p) => p && (p.kind === 'buried' || (p.kind === 'object' && p.role === 'speaking')) && p.text).map((p) => String(p.text).trim());
  }
  const n = Math.max(0, 5 - deep.length);
  return { lines: words.slice(0, n).concat(deep).slice(0, 5), left: words.slice(n) };
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
  picked = s; candidate = null; heard = null;
  document.querySelectorAll('.me-scene').forEach((c) => c.classList.toggle('on', c.dataset.id === s.id));
  $('meWant').value = '';
  showThing(s); showSound(s);
}
function showThing(s) {
  const sp = (s.meta && s.meta.space) || {}, own = sanitizeRecipe(sp.thing), hand = hasHandDrawn(memory.code, s), silent = isSilent(s);
  $('meSideK').textContent = s.scene_order + '번 장면의 조형물 — ' + kindOf(s);
  view.show(makeThing(memory.code, s));
  $('meWhat').textContent = silent ? '' : (hand && !(sp.thing_over && own) ? '' : (own && own.note) || '');
  $('meThingBox').hidden = silent;
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
  $('meAgain').disabled = true; status($('meWant').value.trim() ? '적은 대로 받는 중… (몇십 초 걸린다)' : '받는 중… (몇십 초 걸린다)');
  try {
    const sp = (s.meta && s.meta.space) || {}, props = (s.meta && s.meta.piece && Array.isArray(s.meta.piece.props)) ? s.meta.piece.props : [];
    const words = Array.isArray(sp.words) ? sp.words : props.filter((p) => p && p.kind === 'word' && p.text).map((p) => String(p.text));
    const deep = Array.isArray(sp.deep) ? sp.deep : props.filter((p) => p && p.kind === 'buried' && p.text).map((p) => String(p.text));
    const lang = /[가-힣]/.test(text) ? 'ko' : 'en';
    const want = $('meWant').value.trim().slice(0, 400);                      // what the author asks for, in their own words (the function draws that above all)
    const resp = await sb().functions.invoke('generate-scene-thing', { body: { sceneText: text, b: Array.isArray(sp.b) ? sp.b : linesOf(sp.b), words, deep, lang, avoid: want ? '' : presentNote(s), want } });
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
// ── the scene's sound ───────────────────────────────────────────────────────
// (author, 261128: "the sound too — not made by you to fit the scene: let me write the prompt" · "there is no way to set a sound in the edit tool — put it in")
// The author writes what the sound is; the same function the making screen uses makes it (generate-scene-sound → about 18 s, looping);
// it is heard here first, then taken or dropped. What is kept on the scene: meta.sound_url, meta.sound_volume, and the words it was
// asked with (meta.sound_prompt). The stage plays a scene's sound only at that scene (near its thing, and under its text).
let heard = null;                                                             // a sound just made, not yet taken: { url, prompt }
const sstatus = (t) => { $('meSoundStatus').textContent = t || ''; };
function showSound(s) {
  const m = s.meta || {}, a = $('meAudio');
  $('meSoundBox').hidden = false; heard = null;
  try { a.pause(); } catch (_) {}
  if (m.sound_url) { a.src = m.sound_url; a.hidden = false; } else { a.removeAttribute('src'); a.load(); a.hidden = true; }
  const vol = m.sound_volume != null ? Number(m.sound_volume) : 0.5;
  $('meVol').value = String(vol); $('meVolN').textContent = vol.toFixed(2); a.volume = Math.max(0, Math.min(1, vol));
  $('meSoundNow').textContent = m.sound_url ? ('지금 소리가 있다' + (m.sound_prompt ? ' — 적었던 말: ' + m.sound_prompt : '')) : '지금은 소리가 없다';
  $('meSoundWant').value = m.sound_prompt || '';
  $('meSoundTake').hidden = true; $('meSoundDrop').hidden = true; $('meVolSave').hidden = true; $('meSoundOff').hidden = !m.sound_url; $('meSoundMake').disabled = false;
  sstatus('');
}
async function saveMeta(s, change, say) {
  const meta = Object.assign({}, s.meta || {}); change(meta);
  const r = await sb().from('scenes').update({ meta }).eq('id', s.id).select('id');
  if (r.error || !(r.data && r.data.length)) { say('저장하지 못했다' + (r.error ? ' — ' + r.error.message : ' (이 계정의 기억이 아니다)')); return false; }
  s.meta = meta; return true;
}
async function soundMake() {
  const s = picked; if (!s) return;
  const prompt = $('meSoundWant').value.trim().slice(0, 400);
  if (!prompt) { sstatus('어떤 소리인지 적어야 만들 수 있다.'); return; }
  $('meSoundMake').disabled = true; sstatus('만드는 중… (이십 초쯤 걸린다)');
  try {
    const resp = await sb().functions.invoke('generate-scene-sound', { body: { mode: 'generate', prompt, sceneId: 'edit-' + s.id } });
    const url = resp && !resp.error && resp.data && resp.data.soundUrl;
    if (!url) throw new Error((resp && resp.data && (resp.data.error || resp.data.detail)) || (resp && resp.error && resp.error.message) || 'no sound');
    if (picked !== s) return;
    heard = { url, prompt };
    const a = $('meAudio'); a.hidden = false; a.src = url; a.volume = Number($('meVol').value); const p = a.play(); if (p && p.catch) p.catch(() => {});
    $('meSoundTake').hidden = false; $('meSoundDrop').hidden = false;
    sstatus('새로 만든 소리다(아직 안 바꿨다). 들어 보고 "이 소리로 바꾼다"나 "버린다".');
  } catch (e) { console.warn('[memory-edit] sound', e); sstatus('만들지 못했다 — ' + String(e.message || e).slice(0, 120)); }
  $('meSoundMake').disabled = false;
}
async function soundTake() {
  const s = picked, h = heard; if (!s || !h) return;
  const ok = await saveMeta(s, (m) => { m.sound_url = h.url; m.sound_prompt = h.prompt; m.sound_volume = Number($('meVol').value); }, sstatus);
  if (!ok) return;
  showSound(s); sstatus('바꿨다. 지금부터 이 장면에서 이 소리가 난다.');
}
function soundDrop() { if (!picked) return; showSound(picked); sstatus('버렸다. 지금 것 그대로다.'); }
async function soundOff() {
  const s = picked; if (!s) return;
  const ok = await saveMeta(s, (m) => { m.sound_url = null; }, sstatus);
  if (!ok) return;
  showSound(s); sstatus('소리를 없앴다.');
}
async function volSave() {
  const s = picked; if (!s) return;
  const ok = await saveMeta(s, (m) => { m.sound_volume = Number($('meVol').value); }, sstatus);
  if (ok) { $('meVolSave').hidden = true; sstatus('크기를 저장했다.'); }
}
$('meVol').addEventListener('input', () => { const v = Number($('meVol').value); $('meVolN').textContent = v.toFixed(2); $('meAudio').volume = v; if (picked && (picked.meta || {}).sound_url && !heard) $('meVolSave').hidden = false; });
$('meSoundMake').addEventListener('click', soundMake);
$('meSoundTake').addEventListener('click', soundTake);
$('meSoundDrop').addEventListener('click', soundDrop);
$('meSoundOff').addEventListener('click', soundOff);
$('meVolSave').addEventListener('click', volSave);

// the story, to look at beside the cards: a window of its own with the bare text in it, like a notepad (author, 261128: "not a layout of its own — a new window, to refer to")
$('meSource').addEventListener('click', () => {
  if (!source) return;
  const url = URL.createObjectURL(new Blob([(memory && memory.title ? memory.title + String.fromCharCode(10, 10) : '') + source], { type: 'text/plain;charset=utf-8' }));
  const win = window.open(url, 'tem_source_' + (memory ? memory.id : ''), 'popup,width=620,height=860');
  if (!win) note('새 창이 막혔습니다 — 브라우저에서 이 사이트의 팝업을 허용해 주세요.');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

$('meAgain').addEventListener('click', again);
$('meTake').addEventListener('click', take);
$('meDrop').addEventListener('click', drop);
$('meHand').addEventListener('click', backToHand);

boot();
