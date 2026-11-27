// tools/author_memory_things.mjs — a line sculpture (drawing recipe) for every scene of an authored memory (2026-11-28)
//
// The space stage draws a scene's thing from scenes.meta.space.thing (js/spaceplay/things.js fromRecipe); a memory
// made in record-space.html gets its recipes from the generate-scene-thing function, one scene at a time, in the
// browser. This does the same for a memory authored outside that screen (GWON-001, DANG-001, JANG-001): the same
// function, the same input (the scene's text, its second part, the words afloat, the words buried).
//
// Storing needs a writer. This script has only the public key, so it calls a one-time database function
// (--rpc <name> --token <t>) that somebody with database rights made for the run and drops afterwards; without
// --rpc it only writes the recipes to --out (a JSON file) for someone to store.
//
// usage: node tools/author_memory_things.mjs --memory JANG-001 [--only 3,7] [--force] [--out file.json] [--rpc _tmp_author_thing --token …]
import fs from 'node:fs';
const URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const KEY = fs.readFileSync(new globalThis.URL('../js/lib/config.js', import.meta.url), 'utf8').match(/VITE_SUPABASE_ANON_KEY \|\| '([^']+)'/)[1];
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const get = async (p) => { const r = await fetch(URL + '/rest/v1/' + p, { headers: H }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };

const code = arg('memory'), only = arg('only') ? new Set(arg('only').split(',').map(Number)) : null, force = process.argv.includes('--force');
const rpc = arg('rpc'), token = arg('token'), out = arg('out');
const [memory] = await get('memories?select=id,code,title&code=eq.' + encodeURIComponent(code));
if (!memory) throw new Error('no memory ' + code);
const scenes = await get('scenes?select=id,scene_order,text,void_info,meta&memory_id=eq.' + memory.id + '&order=scene_order');
const silent = (s) => !!(s.void_info && s.void_info.sceneVoid) || /^[…\s.]*$/.test(s.text || '');
// = js/spaceblank/main.js pieceLines / partB
function linesOf(s) {
  const sp = s.meta && s.meta.space;
  let words, deep;
  if (sp && (Array.isArray(sp.words) || Array.isArray(sp.deep))) { words = (sp.words || []).map(String); deep = (sp.deep || []).map(String); }
  else { const props = (s.meta && s.meta.piece && Array.isArray(s.meta.piece.props)) ? s.meta.piece.props : []; words = props.filter((p) => p && p.kind === 'word' && p.text).map((p) => String(p.text).trim()); deep = props.filter((p) => p && (p.kind === 'buried' || (p.kind === 'object' && p.role === 'speaking')) && p.text).map((p) => String(p.text).trim()); }
  const b = (sp && Array.isArray(sp.b) && sp.b.length) ? sp.b.map(String) : words.slice(0, Math.max(0, 5 - deep.length)).concat(deep).slice(0, 5);
  return { b, words: words.slice(0, 8), deep: deep.slice(0, 6) };
}
async function one(s) {
  const l = linesOf(s);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(URL + '/functions/v1/generate-scene-thing', { method: 'POST', headers: H, body: JSON.stringify({ sceneText: s.text, b: l.b, words: l.words, deep: l.deep, lang: 'ko' }) });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.ok && d.recipe) return d.recipe;
      console.warn(`  #${s.scene_order} attempt ${attempt}: ${r.status} ${(d && d.error) || ''}`);
    } catch (e) { console.warn(`  #${s.scene_order} attempt ${attempt}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 2500 * attempt));
  }
  return null;
}
const todo = scenes.filter((s) => !silent(s) && (!only || only.has(s.scene_order)) && (force || !(s.meta && s.meta.space && s.meta.space.thing)));
console.log(`${code} 「${memory.title}」 — ${todo.length} of ${scenes.length} scenes to draw`);
const made = {}; let done = 0, stored = 0, failed = [];
const queue = todo.slice();
async function worker() {
  for (;;) {
    const s = queue.shift(); if (!s) return;
    const recipe = await one(s);
    done++;
    if (!recipe) { failed.push(s.scene_order); console.log(`  #${s.scene_order} — no recipe`); continue; }
    made[s.scene_order] = { scene_id: s.id, recipe };
    let kept = '';
    if (rpc && token) {
      const r = await fetch(URL + '/rest/v1/rpc/' + rpc, { method: 'POST', headers: H, body: JSON.stringify({ p_token: token, p_scene: s.id, p_thing: recipe }) });
      const ok = r.ok && (await r.json()) === true; if (ok) stored++; kept = ok ? ' · stored' : ' · NOT stored (' + r.status + ')';
    }
    console.log(`  #${s.scene_order} (${done}/${todo.length}) ${recipe.parts.length} parts · ${recipe.note || ''}${kept}`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
if (out) fs.writeFileSync(out, JSON.stringify({ code, made_at: new Date().toISOString(), made }, null, 1), 'utf8');
console.log(`done: ${Object.keys(made).length} recipes, ${stored} stored, failed: ${failed.join(',') || 'none'}`);
