/**
 * Room-play rig (2026-11-20) — an authored route laid over the engine, for a showing that must not fail.
 *
 * Switch: memories.meta.rig = { spine: [scene_order…], rib_every, stages: [stage on visit 1, 2, 3…], ghost_min_len }.
 *   rib_every (default 1): a room of the past after every N-th spine room (2 = walk, walk, past, walk, walk, past …).
 * No such key (or ?rig=0) = the stage as it was: the engine alone names the door.
 *
 * What it fixes (measured with 30 simulated walks on GWON-001, docs/글방_가짜관객_변이굽기-261120.md §8): the door
 * always went to the nearest scene, the walk circled inside one emotional neighbourhood, and the last scene of the
 * manuscript was reached 0 times in 30.
 *
 * The route: the spine (the manuscript's present-tense walk) comes in its own order, and between two spine rooms
 * there is one room of the past. From a spine room the ENGINE still chooses (pattern -> centre -> nearest), but only
 * among the rooms off the spine. From a room of the past the door leads to the next spine room. The last spine room
 * closes the walk. A "stay here" door (fixation) is not given.
 *
 * This breaks design principle #8 (overrides ≤ 15% of scenes) on purpose and openly: every rigged door is marked
 * in the journal (door.rig). It is staging for a showing, not a measurement — walks made with it are not evidence
 * about where people go.
 */
export function rigOf(memory, qs) {
  const r = memory && memory.meta && memory.meta.rig;
  if (!r || !Array.isArray(r.spine) || !r.spine.length) return null;
  if (qs && qs.get && qs.get('rig') === '0') return null;
  return r;
}

/**
 * Which layer of the scene's text this visit reads, if the rig says so (else null = the stage's own rule).
 * rig.stages = layers by visit for the spine; rig.rib_stages = for the rooms of the past (261121: the past has
 * been through other hands — its first reading may already carry what earlier walkers left; the walk itself is
 * read as written).
 */
export function riggedStage(rig, visitN, scene) {
  if (!rig) return null;
  const onSpine = !scene || rig.spine.includes(scene.scene_order);
  const list = (!onSpine && Array.isArray(rig.rib_stages) && rig.rib_stages.length) ? rig.rib_stages : rig.stages;
  if (!Array.isArray(list) || !list.length) return null;
  return Math.max(0, Math.min(3, Number(list[Math.min(visitN, list.length) - 1]) || 0));
}

/**
 * @param o { rig, engine, scenes, origin, pattern, userEmotion, isVoid, visited:Set }
 * @returns the same shape as engine.pickNext, plus rig:true; mode 'end' (scene null) when the walk closes here.
 */
export function riggedDoor(o) {
  const byOrder = (n) => o.scenes.find((s) => s.scene_order === n);
  const spine = o.rig.spine.map(byOrder).filter(Boolean), spineIds = new Set(spine.map((s) => s.id));
  const end = spine[spine.length - 1];
  if (o.origin.id === end.id) return { scene: null, mode: 'end', pattern: o.pattern, ranked: [], shadow: null, rig: true };
  const ahead = spine.filter((s) => !o.visited.has(s.id));
  const toSpine = () => ({ scene: ahead[0] || end, mode: 'new', pattern: o.pattern, ranked: [], shadow: null, rig: true });
  if (!spineIds.has(o.origin.id)) return toSpine();                       // from the past: back to the walk
  const every = Math.max(1, Number(o.rig.rib_every) || 1), walked = spine.filter((s) => o.visited.has(s.id)).length;
  if (walked % every !== 0) return toSpine();                             // not yet time for a room of the past
  // from the walk: one room of the past, the engine's own choice among the rooms off the spine
  const closed = new Set(o.visited); spineIds.forEach((id) => closed.add(id));
  const pick = o.engine.pickNext({ origin: o.origin, pattern: o.pattern === 'fixation' ? 'bridge' : o.pattern, userEmotion: o.userEmotion, isVoid: o.isVoid, visited: closed });
  if (!pick.scene || pick.scene.id === o.origin.id) return toSpine();     // nothing left off the spine
  return Object.assign({}, pick, { mode: pick.mode === 'same' ? 'new' : pick.mode, rig: true });
}
