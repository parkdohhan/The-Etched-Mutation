/**
 * QuiltDemoState — Quilt 데모용 상태 어댑터
 * --------------------------------------------------
 * 흩어진 세 군데 상태를 한 손잡이로 묶는다. 신규 판단 로직 없음.
 *
 *   visited     ← appStore.visitedScenes (콜백 pull)
 *   trajectory  ← lumen_terrain_adapter.getTrajectory() (콜백 pull)
 *   dialogTurns ← lumen_dialog_phase1 onSceneEnd 콜백 (push)
 *   mode/returnIndex/mutatedLines ← 자체 보관 (Quilt 전용 상태)
 *
 * 사용 예:
 *   const quilt = new QuiltDemoState({
 *     memoryId: 'xxxx',
 *     getVisited:    () => appStore.getState().visitedScenes,
 *     getTrajectory: () => runtime.__lumenAdapter?.getTrajectory() || [],
 *   });
 *
 *   // dialog_phase1 onSceneEnd 콜백에서
 *   quilt.recordDialogTurn({ sceneId, scene_link_input, alignment, resonance });
 *
 *   // 결과 화면/overlay에서
 *   const snap = quilt.getSnapshot();
 *   // → { mode, visited, trajectory, dialogTurns, returnIndex, mutatedLines, memoryId }
 */

const noop = () => [];

export class QuiltDemoState {
  constructor({ memoryId = null, getVisited = noop, getTrajectory = noop } = {}) {
    this._memoryId = memoryId;
    this._getVisited = typeof getVisited === 'function' ? getVisited : noop;
    this._getTrajectory = typeof getTrajectory === 'function' ? getTrajectory : noop;

    this._mode = 'explore';     // 'explore' | 'return' | 'done'
    this._returnIndex = -1;
    this._dialogTurns = [];
    this._mutatedLines = [];
  }

  // ─── push: 외부가 알려주는 정보 ───

  recordDialogTurn(turn) {
    if (!turn) return this.getSnapshot();
    this._dialogTurns.push({
      sceneId: turn.sceneId ?? turn.scene_id ?? null,
      sceneOrder: turn.sceneOrder ?? null,
      input: turn.scene_link_input ?? turn.input ?? '',
      alignment: typeof turn.alignment === 'number' ? turn.alignment : null,
      resonance: turn.resonance ?? null,
      ts: turn.ts ?? Date.now(),
    });
    return this.getSnapshot();
  }

  recordMutation(sceneId, before, after) {
    this._mutatedLines.push({ sceneId, before, after, ts: Date.now() });
    return this.getSnapshot();
  }

  // ─── mode 전환 ───

  startReturn() {
    if (this._mode !== 'explore') return this.getSnapshot();
    const visited = this._getVisited() || [];
    this._mode = 'return';
    this._returnIndex = visited.length - 1;
    return this.getSnapshot();
  }

  completeReturnStep(sceneId) {
    if (this._mode !== 'return') return { ok: false, reason: 'not_returning' };
    const visited = this._getVisited() || [];
    const expected = visited[this._returnIndex];
    if (sceneId !== expected) return { ok: false, expected };
    this._returnIndex -= 1;
    if (this._returnIndex < 0) this._mode = 'done';
    return { ok: true, done: this._mode === 'done', snapshot: this.getSnapshot() };
  }

  endReturn() {
    this._mode = 'done';
    return this.getSnapshot();
  }

  reset() {
    this._mode = 'explore';
    this._returnIndex = -1;
    this._dialogTurns = [];
    this._mutatedLines = [];
    return this.getSnapshot();
  }

  // ─── pull: 외부가 묻는 한 손잡이 ───

  getSnapshot() {
    return {
      memoryId: this._memoryId,
      mode: this._mode,
      returnIndex: this._returnIndex,
      visited: (this._getVisited() || []).slice(),
      trajectory: (this._getTrajectory() || []).slice(),
      dialogTurns: this._dialogTurns.slice(),
      mutatedLines: this._mutatedLines.slice(),
    };
  }
}
