// tools/author_memory_backup.mjs — one memory's rows as a JSON file, before they are changed (2026-11-28)
//
// Reads with the public key (the same rows the stage reads): the memory, its scenes (every column), its drift pool.
// usage: node tools/author_memory_backup.mjs --memory GWON-001 --out "Tem - gwonyeok/backup/GWON-001_261128.json"
import fs from 'node:fs';
import path from 'node:path';
const URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const KEY = fs.readFileSync(new globalThis.URL('../js/lib/config.js', import.meta.url), 'utf8').match(/VITE_SUPABASE_ANON_KEY \|\| '([^']+)'/)[1];
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const get = async (p) => { const r = await fetch(URL + '/rest/v1/' + p, { headers: H }); if (!r.ok) throw new Error(p + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); return r.json(); };
const code = arg('memory'), out = arg('out');
const [memory] = await get('memories?select=*&code=eq.' + encodeURIComponent(code));
if (!memory) throw new Error('no memory ' + code);
const scenes = await get('scenes?select=*&memory_id=eq.' + memory.id + '&order=scene_order');
let ghosts = []; try { ghosts = await get('ghost_variants?select=*&memory_id=eq.' + memory.id); } catch (e) { console.warn('ghost_variants not read:', e.message); }
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(path.resolve(out), JSON.stringify({ taken_at: new Date().toISOString(), memory, scenes, ghost_variants: ghosts }, null, 1), 'utf8');
console.log(code, 'scenes', scenes.length, 'ghost lines', ghosts.length, '→', out);
