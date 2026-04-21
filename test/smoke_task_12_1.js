// 작업 12-1 DB 라운드트립 smoke test
// 사용법:
//   1. admin.html에 로그인(admin 권한)
//   2. DevTools Console 열고 이 파일 전체 복붙 후 Enter
//   3. 결과 console.table + PASS/FAIL 로그 확인. test row는 자동 삭제.
// 목적: Lumen 추가 컬럼 (sensory_anchor·original_reason_vector·cont 3축·cont 3stage·terrain_shape)이
//   INSERT → SELECT 라운드트립에 깨지는 필드 없는지, sound_map drop된 상태에서 에러 안 나는지 검증.

(async () => {
  const sb = await window.getSupabaseClient();
  if (!sb) { console.error('[smoke] Supabase client not available. admin.html에서 로그인 후 실행'); return; }

  const code = `SMOKE-${Date.now()}`;
  const payload = {
    code,
    title: 'smoke test 12-1',
    memory_words: ['smoke','test'],
    completed_sentence: 'db roundtrip probe',
    // 12-1 신규 필드
    sensory_anchor: { modality: 'olfactory', content: '소독약', weight: 0.8 },
    original_reason_vector: {
      attribution: [0.3, 0.4, 0.3],           // self / other / fate
      core_fear:   [0.25, 0.25, 0.25, 0.25]   // abandonment / rejection / powerless / loss
    },
    cont_depth: 5,
    cont_divergence:    0.3,
    cont_convergence:   0.2,
    cont_heterogeneity: 0.5,
    cont_stage_1: 0.3,
    cont_stage_2: 0.4,
    cont_stage_3: 0.3,
    terrain_shape: 'circular',
    ghost_condensation_points: [],
    meta: {}
  };

  console.log(`[smoke] INSERT code=${code}`);
  const ins = await sb.from('memories').insert(payload).select().single();
  if (ins.error) { console.error('[smoke] INSERT failed:', ins.error); return; }
  const id = ins.data.id;
  console.log('[smoke] inserted id=', id);

  const sel = await sb.from('memories').select('*').eq('id', id).single();
  if (sel.error) { console.error('[smoke] SELECT failed:', sel.error); await sb.from('memories').delete().eq('id', id); return; }
  const r = sel.data;

  // 필드별 비교
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b, tol=0.001) => Math.abs((a||0)-(b||0)) < tol;
  const contStageSum = (r.cont_stage_1||0) + (r.cont_stage_2||0) + (r.cont_stage_3||0);

  const checks = [
    ['sensory_anchor.modality',                      r.sensory_anchor?.modality === 'olfactory'],
    ['sensory_anchor.content',                       r.sensory_anchor?.content === '소독약'],
    ['sensory_anchor.weight',                        near(r.sensory_anchor?.weight, 0.8)],
    ['original_reason_vector.attribution (3-dim)',   eq(r.original_reason_vector?.attribution, [0.3, 0.4, 0.3])],
    ['original_reason_vector.core_fear (4-dim)',     r.original_reason_vector?.core_fear?.length === 4],
    ['cont_depth (int)',                             r.cont_depth === 5],
    ['cont_divergence (double)',                     near(r.cont_divergence, 0.3)],
    ['cont_convergence (double)',                    near(r.cont_convergence, 0.2)],
    ['cont_heterogeneity (double)',                  near(r.cont_heterogeneity, 0.5)],
    ['cont_stage sum ≈ 1',                           near(contStageSum, 1, 0.01)],
    ['terrain_shape = circular',                     r.terrain_shape === 'circular'],
    ['ghost_condensation_points is array',           Array.isArray(r.ghost_condensation_points)],
    ['meta column (JSONB)',                          typeof r.meta === 'object']
  ];

  const rows = checks.map(([name, pass]) => ({ field: name, pass: pass ? '✅' : '❌' }));
  console.table(rows);
  const failed = checks.filter(([,p]) => !p);
  if (failed.length === 0) console.log(`%c[smoke] ALL ${checks.length} PASS — 12-1 DB 라운드트립 OK`, 'color:#4caf50;font-weight:bold');
  else console.error(`[smoke] ${failed.length}개 FAIL`, failed.map(([n])=>n));

  // sound_map drop 대응 smoke — 방금 insert한 row를 UPDATE 시도 시 에러 없어야 함
  console.log('[smoke] sound_map drop 대응 probe (UPDATE on existing row)');
  const upd = await sb.from('memories').update({ title: 'smoke updated' }).eq('id', id);
  if (upd.error && /sound_map/.test(upd.error.message)) {
    console.error('[smoke] sound_map 잔존 참조 탐지:', upd.error.message);
  } else if (upd.error) {
    console.warn('[smoke] UPDATE 에러 (sound_map 무관):', upd.error.message);
  } else {
    console.log('[smoke] UPDATE OK, sound_map 참조 없음');
  }

  // cleanup
  const del = await sb.from('memories').delete().eq('id', id);
  if (del.error) console.warn('[smoke] cleanup failed, 수동 삭제 필요 id=', id, del.error);
  else console.log('[smoke] cleaned up test row');
})();
