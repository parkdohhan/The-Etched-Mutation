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

// 전이(轉移) MVP — 유령이 접촉 후 물드는 규칙 (docs/귀환_시스템_정합성_재정의-260613.md)
const DRIFT_LATENCY_SCENES = 2;     // 접촉 후 이 수만큼 장면(대화 턴) 지나면 발현
const DRIFT_ALIGN_THRESHOLD = 0.55; // 정렬도 이 아래면 어긋남 → 물듦 큐. 이상이면 안 물듦

export class QuiltDemoState {
  constructor({ memoryId = null, getVisited = noop, getTrajectory = noop } = {}) {
    this._memoryId = memoryId;
    this._getVisited = typeof getVisited === 'function' ? getVisited : noop;
    this._getTrajectory = typeof getTrajectory === 'function' ? getTrajectory : noop;

    this._mode = 'explore';     // 'explore' | 'return' | 'done'
    this._returnIndex = -1;
    this._dialogTurns = [];
    this._mutatedLines = [];

    // 전이 MVP: 접촉 후 잠복 중인 물듦 큐 + 발현된 유령 물듦 상태
    this._pendingDrifts = [];   // [{ sceneId, queuedAt, strength, input }]
    this._ghostDrifts = {};     // sceneId -> { strength, input, firedAt }
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
    this._maybeQueueDrift(turn);   // 어긋난 접촉이면 물듦 예약
    this._fireDueDrifts();         // 잠복 끝난 유령 물듦 발현
    return this.getSnapshot();
  }

  recordMutation(sceneId, before, after) {
    this._mutatedLines.push({ sceneId, before, after, ts: Date.now() });
    return this.getSnapshot();
  }

  // ─── 전이 MVP: 접촉 후 잠복 → 발현 ───
  // 어긋난 접촉(정렬도 낮음)이면 그 유령을 "장면 N개 뒤 물듦"으로 예약.
  _maybeQueueDrift(turn) {
    const sceneId = turn.sceneId ?? turn.scene_id ?? null;
    if (sceneId == null) return;
    const a = typeof turn.alignment === 'number' ? turn.alignment : 1;
    if (a >= DRIFT_ALIGN_THRESHOLD) return;   // 잘 따름 → 안 물듦
    if (this._ghostDrifts[sceneId]) return;    // 이미 물듦
    // 같은 유령 재접촉이면 최신 접촉 기준으로 갱신
    this._pendingDrifts = this._pendingDrifts.filter((p) => p.sceneId !== sceneId);
    this._pendingDrifts.push({
      sceneId,
      queuedAt: this._dialogTurns.length,       // 방금 push 후 길이
      strength: Math.max(0, Math.min(1, 1 - a)),
      input: turn.scene_link_input ?? turn.input ?? '',
    });
  }

  // 잠복(LATENCY)을 채운 예약을 발현시킨다.
  _fireDueDrifts() {
    const now = this._dialogTurns.length;
    const stillPending = [];
    for (const p of this._pendingDrifts) {
      if (now >= p.queuedAt + DRIFT_LATENCY_SCENES) {
        this._ghostDrifts[p.sceneId] = { strength: p.strength, input: p.input, firedAt: now };
        this._mutatedLines.push({ sceneId: p.sceneId, strength: p.strength, ts: Date.now() });
      } else {
        stillPending.push(p);
      }
    }
    this._pendingDrifts = stillPending;
  }

  // 렌더가 묻는다: 이 유령 물들었나? → { strength, input, firedAt } | null
  getGhostDrift(sceneId) {
    return this._ghostDrifts[sceneId] || null;
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
    this._pendingDrifts = [];
    this._ghostDrifts = {};
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
