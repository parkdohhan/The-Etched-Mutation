// R1 (2026-07-14) — saveMemoryGraph 파괴 저장 수리 검증
// 핵심: 기존 id 가진 씬 저장 = UPDATE (DELETE 금지 — plays.scene_id CASCADE 로 플레이 기록이 증발하던 버그)
import { describe, it, expect } from 'vitest';
import { saveMemoryGraph } from '../../js/lib/repo.js';

// ─── Supabase 클라이언트 모킹 — 체이닝 쿼리 빌더를 기록해서 assert ───
function createMockClient(existingScenes) {
    const calls = [];
    let insertSeq = 0;

    function respond(q) {
        if (q.table === 'scenes' && q.op === 'select' && q.filters.memory_id !== undefined) {
            return { data: existingScenes, error: null };
        }
        if (q.table === 'scenes' && q.op === 'select' && q.filters.id !== undefined) {
            // INSERT 후 FK 재검증 (maybeSingle)
            return { data: { id: q.filters.id }, error: null };
        }
        if (q.op === 'insert') {
            const row = { id: q.table + '-new-' + (++insertSeq) };
            return { data: q.wantSingle ? row : [row], error: null };
        }
        if (q.op === 'update') {
            return { data: [{ id: q.filters.id || 'updated' }], error: null };
        }
        return { data: null, error: null };
    }

    function from(table) {
        const q = {
            table, op: null, payload: null, filters: {}, wantSingle: false,
            select(cols) { if (!this.op) { this.op = 'select'; this.payload = cols; } return this; },
            insert(p) { this.op = 'insert'; this.payload = p; return this; },
            update(p) { this.op = 'update'; this.payload = p; return this; },
            delete() { this.op = 'delete'; return this; },
            eq(k, v) { this.filters[k] = v; return this; },
            in(k, v) { this.filters[k] = v; return this; },
            order() { return this; },
            single() { this.wantSingle = true; return this; },
            maybeSingle() { this.wantSingle = true; return this; },
            then(resolve) {
                calls.push({ table: this.table, op: this.op, payload: this.payload, filters: this.filters });
                resolve(respond(this));
            },
        };
        return q;
    }

    return { client: { from }, calls };
}

const sceneWithId = (id, extra = {}) => ({
    id,
    text: 'text of ' + id,
    sceneType: 'normal',
    echoWords: [],
    choices: [],
    ...extra,
});

describe('saveMemoryGraph — R1 diff 저장', () => {
    it('R1-1: 기존 id 씬 3개 저장 → scenes DELETE 0회, UPDATE 3회 (plays 보존 경로)', async () => {
        const { client, calls } = createMockClient([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);

        await saveMemoryGraph(client, {
            memoryId: 'm1', code: 'M-1', title: 'T',
            scenes: [sceneWithId('s1'), sceneWithId('s2'), sceneWithId('s3')],
        });

        const sceneDeletes = calls.filter(c => c.table === 'scenes' && c.op === 'delete');
        const sceneUpdates = calls.filter(c => c.table === 'scenes' && c.op === 'update');
        const sceneInserts = calls.filter(c => c.table === 'scenes' && c.op === 'insert');
        const playsTouched = calls.filter(c => c.table === 'plays');

        expect(sceneDeletes).toHaveLength(0);
        expect(sceneUpdates).toHaveLength(3);
        expect(sceneInserts).toHaveLength(0);
        expect(playsTouched).toHaveLength(0); // memoryWaveData 없음 → plays 안 건드림
        // UPDATE 대상 id 가 기존 id 그대로인지
        expect(sceneUpdates.map(c => c.filters.id).sort()).toEqual(['s1', 's2', 's3']);
    });

    it('R1-1: 목록에서 사라진 씬만 DELETE (choices → scenes 순)', async () => {
        const { client, calls } = createMockClient([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);

        await saveMemoryGraph(client, {
            memoryId: 'm1', code: 'M-1', title: 'T',
            scenes: [sceneWithId('s1'), sceneWithId('s2')], // s3 삭제됨
        });

        const choicesDelete = calls.find(c => c.table === 'choices' && c.op === 'delete' && Array.isArray(c.filters.scene_id));
        const sceneDelete = calls.find(c => c.table === 'scenes' && c.op === 'delete');
        expect(choicesDelete.filters.scene_id).toEqual(['s3']);
        expect(sceneDelete.filters.id).toEqual(['s3']);
    });

    it('R1-1: id 없는 새 씬은 INSERT, 기존 씬은 UPDATE (혼합)', async () => {
        const { client, calls } = createMockClient([{ id: 's1' }]);

        await saveMemoryGraph(client, {
            memoryId: 'm1', code: 'M-1', title: 'T',
            scenes: [sceneWithId('s1'), { text: 'new scene', sceneType: 'normal', echoWords: [], choices: [] }],
        });

        const sceneUpdates = calls.filter(c => c.table === 'scenes' && c.op === 'update' && c.payload && c.payload.memory_id);
        const sceneInserts = calls.filter(c => c.table === 'scenes' && c.op === 'insert');
        expect(sceneUpdates).toHaveLength(1);
        expect(sceneInserts).toHaveLength(1);
        expect(sceneInserts[0].payload.scene_order).toBe(1);
        expect(sceneInserts[0].payload.id).toBeUndefined(); // id 는 DB 가 생성
    });

    it('R1-3: choices 0개 씬 UPDATE 는 emotion_dist/emotion_vector 를 안 건드림', async () => {
        const { client, calls } = createMockClient([{ id: 's1' }]);

        await saveMemoryGraph(client, {
            memoryId: 'm1', code: 'M-1', title: 'T',
            scenes: [sceneWithId('s1', { emotionDist: { fear: 60, sadness: 40 } })],
        });

        const sceneUpdates = calls.filter(c => c.table === 'scenes' && c.op === 'update');
        for (const u of sceneUpdates) {
            expect(u.payload).not.toHaveProperty('emotion_dist');
            expect(u.payload).not.toHaveProperty('emotion_vector');
        }
    });

    it('R1-3: choices 있는 씬은 emotion_dist 계산 포함 + choices 씬별 교체', async () => {
        const { client, calls } = createMockClient([{ id: 's1' }]);

        await saveMemoryGraph(client, {
            memoryId: 'm1', code: 'M-1', title: 'T',
            scenes: [sceneWithId('s1', {
                choices: [
                    { text: 'a', emotion: 'fear', intensity: 5 },
                    { text: 'b', emotion: 'sadness', intensity: 5 },
                ],
            })],
        });

        const mainUpdate = calls.find(c => c.table === 'scenes' && c.op === 'update' && c.payload.memory_id);
        expect(mainUpdate.payload.emotion_dist).toEqual(expect.objectContaining({ fear: 50, sadness: 50 }));

        const choicesClear = calls.find(c => c.table === 'choices' && c.op === 'delete' && c.filters.scene_id === 's1');
        const choicesInserts = calls.filter(c => c.table === 'choices' && c.op === 'insert');
        expect(choicesClear).toBeTruthy();
        expect(choicesInserts).toHaveLength(2);
    });

    it('R1-3: 신규 INSERT 씬이 choices 없이 emotionDist 를 들고 오면 그대로 저장', async () => {
        const { client, calls } = createMockClient([]);

        await saveMemoryGraph(client, {
            memoryId: 'm1', code: 'M-1', title: 'T',
            scenes: [{ text: 'record scene', echoWords: [], choices: [], emotionDist: { longing: 70, sadness: 30 } }],
        });

        const insert = calls.find(c => c.table === 'scenes' && c.op === 'insert');
        expect(insert.payload.emotion_dist).toEqual({ longing: 70, sadness: 30 });
    });

    it('R1-4: UPDATE 페이로드에 layers/dilution/is_public 강제 리셋 없음', async () => {
        const { client, calls } = createMockClient([]);

        await saveMemoryGraph(client, {
            memoryId: 'm1', code: 'M-1', title: 'T',
            scenes: [],
        });

        const memUpdate = calls.find(c => c.table === 'memories' && c.op === 'update');
        expect(memUpdate.payload).not.toHaveProperty('layers');
        expect(memUpdate.payload).not.toHaveProperty('dilution');
        expect(memUpdate.payload).not.toHaveProperty('is_public');
        // status/source 미제공 → 키 자체가 없어야 기존 값 보존
        expect(memUpdate.payload).not.toHaveProperty('status');
        expect(memUpdate.payload).not.toHaveProperty('source');
    });

    it('R1-4: 신규 생성(INSERT)은 기본값 유지 (layers 0 / dilution 100 / is_public true)', async () => {
        const { client, calls } = createMockClient([]);

        await saveMemoryGraph(client, {
            memoryId: null, code: 'M-2', title: 'New',
            scenes: [],
        });

        const memInsert = calls.find(c => c.table === 'memories' && c.op === 'insert');
        expect(memInsert.payload.layers).toBe(0);
        expect(memInsert.payload.dilution).toBe(100);
        expect(memInsert.payload.is_public).toBe(true);
    });

    it('R1-2: scene_role 이 있으면 저장 페이로드에 포함, 없으면 키 미포함(덮어쓰기 방지)', async () => {
        const { client, calls } = createMockClient([{ id: 's1' }, { id: 's2' }]);

        await saveMemoryGraph(client, {
            memoryId: 'm1', code: 'M-1', title: 'T',
            scenes: [
                sceneWithId('s1', { scene_role: 'residual' }),
                sceneWithId('s2'), // scene_role 필드 자체가 없음
            ],
        });

        const upd1 = calls.find(c => c.table === 'scenes' && c.op === 'update' && c.filters.id === 's1');
        const upd2 = calls.find(c => c.table === 'scenes' && c.op === 'update' && c.filters.id === 's2');
        expect(upd1.payload.scene_role).toBe('residual');
        expect(upd2.payload).not.toHaveProperty('scene_role');
    });

    it('R1-1: 신규 기억 생성 시 씬은 전부 INSERT (기존 동작 유지)', async () => {
        const { client, calls } = createMockClient([]);

        await saveMemoryGraph(client, {
            memoryId: null, code: 'M-3', title: 'New',
            scenes: [
                { text: 's1', echoWords: [], choices: [] },
                { text: 's2', echoWords: [], choices: [] },
            ],
        });

        const sceneInserts = calls.filter(c => c.table === 'scenes' && c.op === 'insert');
        const sceneDeletes = calls.filter(c => c.table === 'scenes' && c.op === 'delete');
        expect(sceneInserts).toHaveLength(2);
        expect(sceneDeletes).toHaveLength(0);
    });
});
