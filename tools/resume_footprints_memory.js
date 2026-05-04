/**
 * 발자국 메모리 이어 박기 (resume) 콘솔 스크립트
 *
 * 첫 INSERT 가 새로고침으로 끊긴 자리 이어서 박음.
 * 멱등(idempotent) — 이미 박힌 행은 utterance 매칭으로 건너뜀.
 *
 * 어떻게 쓰나:
 *   1. admin.html 열고 admin 로그인
 *   2. F12 콘솔
 *   3. 본 파일 통째 복사 → 붙여넣고 엔터
 *   4. 약 30~60초 기다림 (남은 변주 호출만)
 *
 * 안전망:
 *   - 메모리 자동 찾음 (code='footprints' 로 lookup)
 *   - 이미 박힌 변주 (utterance 매칭) 는 건너뜀
 *   - 없는 변주만 INSERT
 *   - speciation parent = drift 7 (이미 박혀있을 것)
 */

(async () => {
  const sbMod = await import('./js/lib/supabaseClient.js');
  const extMod = await import('./js/admin/emotion_extract_helper.js');
  const sb = sbMod.getSupabaseClient();
  const { extractEmotionVec } = extMod;

  if (!sb) { console.error('[발자국 resume] No supabase client'); return; }

  const log = (...a) => console.log('[발자국 resume]', ...a);

  // ── 메모리 lookup ─────────────────────────────────
  const { data: mem, error: memErr } = await sb.from('memories').select('id, title').eq('code', 'footprints').maybeSingle();
  if (memErr || !mem) { console.error('[발자국 resume] code=footprints 메모리 없음:', memErr); return; }
  const memoryId = mem.id;
  log('memory_id =', memoryId);

  // ── 이미 박힌 변주 ─────────────────────────────────
  const { data: existing, error: exErr } = await sb.from('ghost_variants')
    .select('id, kind, utterance').eq('memory_id', memoryId);
  if (exErr) { console.error('[발자국 resume] 기존 변주 조회 실패:', exErr); return; }
  log(`기존 변주: ${existing.length}행`);

  const existingUtterances = new Set(existing.map(r => r.utterance));

  // 변주 풀 정의 (insert_footprints_memory.js 와 동일 — speciation 까지)
  const ALL_VARIANTS = [
    {
      label: '본 발화', kind: 'drift', is_seed: true, parent_label: null,
      utterance: '발자국이 잘 남는 땅이었어. 슬리퍼 자국이 도장처럼 찍힐 때마다 나는 그들의 일원이 됐어. 말 안 해도 됐어. 땅이 알아봐 줬으니까.',
      attribution: 'unknown', core_fear: 'abandonment', modality: 'somatic', role: 'actor',
      motif_tags: ['발자국', '슬리퍼', '마을'], pose: '등 굽음, 땅을 봄',
    },
    {
      label: 'drift 1 슬리퍼/곰팡이', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '여름만 되면 발에 습기가 찼어. 보통 신발 신으면 발에 곰팡이가 났거든. 그래서 슬리퍼만 신었어. 그게 다행이었어. 슬리퍼 자국이 더 잘 남았으니까.',
      attribution: 'unknown', core_fear: 'none', modality: 'somatic', role: 'actor',
      motif_tags: ['슬리퍼', '습기', '발'], pose: '발끝을 봄',
    },
    {
      label: 'drift 2 떡집 아줌마', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '오늘은 떡집 아줌마가 시내에 나갔구나, 했어. 캔버스화 자국이 정류장 쪽으로 멀어져 있었거든. 좋겠다, 했어. 시내 가는 거.',
      attribution: 'unknown', core_fear: 'none', modality: 'visual', role: 'observer',
      motif_tags: ['발자국', '떡집', '정류장'], pose: '쪼그려 앉음',
    },
    {
      label: 'drift 3 어둑한 곳에서 멈춘 발자국', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '여고생 운동화 옆에 누군가 발자국이 딱 붙어 있었어. 따라가 봤어. 어둑한 곳에서 멈춰 있더라. 두 사람이 같이 멈춰 있었어. 한참을.',
      attribution: 'unknown', core_fear: 'none', modality: 'visual', role: 'observer',
      motif_tags: ['발자국', '여고생', '어둑함'], pose: '등 굽음, 따라감',
    },
    {
      label: 'drift 4 샤넬 구두', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '샤넬 구두가 와서 그랬어. 여기 땅이 참 건축하기 좋다고. 마른 평평한 땅이 최고라고. 나는 발자국이 안 남는 땅이 왜 좋은 건지 몰랐어.',
      attribution: 'other_blame', core_fear: 'rejection', modality: 'visual', role: 'observer',
      motif_tags: ['샤넬 구두', '마른 땅', '외지인'], pose: '고개 듦',
    },
    {
      label: 'drift 5 똑같은 부츠/받아들여짐', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '공사장 사람들은 다 똑같은 부츠를 신었어. 화투 칠 때도, 일할 때도. 나도 그 안에 있으면 받아들여지는 것 같았어. 말을 안 해도 됐어. 거기는 그랬어.',
      attribution: 'unknown', core_fear: 'none', modality: 'somatic', role: 'actor',
      motif_tags: ['공사장', '부츠', '화투', '소속'], pose: '쪼그려 앉음, 무리 옆',
    },
    {
      label: 'drift 6 200원짜리 핫초코', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '그가 내 손을 꼭 붙잡았어. 사진을 주워줘서 고맙다고. 200원짜리 자판기 핫초코를 사줬어. 손이 따뜻했어. 그 성의가, 공사장으로 돌아가는 그의 발자국이 마음에 들었어.',
      attribution: 'unknown', core_fear: 'none', modality: 'somatic', role: 'actor',
      motif_tags: ['핫초코', '인력', '손'], pose: '손을 잡힘',
    },
    {
      label: 'drift 7 사진의 주인', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '그 사진의 주인은 누구였을까. 여동생일까, 부인일까. 사진 돌려주고 와서 한참을 생각했어. 다음 날도, 그 다음 날도.',
      attribution: 'unknown', core_fear: 'rejection', modality: 'narrative', role: 'observer',
      motif_tags: ['사진', '인력', '의문'], pose: '사진을 듦',
    },
    {
      label: 'drift 8 똑같은 부츠/따라가지 못함', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '공사장 부츠는 다 똑같았어. 그래서 그 사람만큼은 따라갈 수 없었어. 발자국으로 사람을 알아보던 나도, 같은 부츠 앞에서는 멈췄어.',
      attribution: 'fate_blame', core_fear: 'failure', modality: 'visual', role: 'observer',
      motif_tags: ['부츠', '공사장', '한계'], pose: '멈춤',
    },
    {
      label: 'drift 9 노란 장화가 우리 집에', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '집에 돌아왔는데 노란 장화가 현관에 있었어. 우리 집 슬리퍼 옆에. 침실 문은 잠겨 있었어. 그게 무슨 뜻인지 나는 알았어.',
      attribution: 'unknown', core_fear: 'abandonment', modality: 'visual', role: 'observer',
      motif_tags: ['노란 장화', '집', '침실', '슬리퍼'], pose: '현관에 멈춤',
    },
    {
      label: 'drift 10 칼로 표식', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '장화 밑창을 뒤집어서 칼로 표식을 새겼어. 작게, 안 보이게. 이제 그가 어디로 가는지 알 수 있을 거라고 생각했어. 알아서 뭐 할 건지는 안 정했어.',
      attribution: 'self_blame', core_fear: 'rejection', modality: 'somatic', role: 'actor',
      motif_tags: ['장화', '표식', '칼'], pose: '쪼그려 앉음, 신발장 앞',
    },
    {
      label: 'drift 11 사진 뒷면', kind: 'drift', is_seed: false, parent_label: null,
      utterance: "신발장 위에 사진을 올려뒀어. 사진 뒷면에 '사랑하는 나의 아내'라고 적혀 있었어. 엄마는 못 봤을 거야. 봤어도 모른 척했을 거고.",
      attribution: 'other_blame', core_fear: 'abandonment', modality: 'visual', role: 'observer',
      motif_tags: ['사진', '아내', '신발장', '엄마'], pose: '사진을 듦, 등 돌림',
    },
    {
      label: 'drift 12 엄마와 유대감 끊김', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '엄마에게서 더는 유대감을 못 느낄 것 같았어. 같은 슬리퍼를 신고 있어도 우리는 다른 발자국이었어.',
      attribution: 'other_blame', core_fear: 'abandonment', modality: 'narrative', role: 'observer',
      motif_tags: ['엄마', '유대감', '슬리퍼'], pose: '등 돌림',
    },
    {
      label: 'drift 13 아스팔트', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '아스팔트가 깔렸어. 손으로 짚어도 자국이 안 남았어. 그 위에서는 누가 누군지 알 수 없었어.',
      attribution: 'fate_blame', core_fear: 'failure', modality: 'somatic', role: 'victim',
      motif_tags: ['아스팔트', '도로', '손'], pose: '쪼그려 앉음, 손으로 짚음',
    },
    {
      label: 'drift 14 속하지 못함', kind: 'drift', is_seed: false, parent_label: null,
      utterance: '주택에 사람들이 들어왔어. 알 수 없는 발자국들이 끊임없이 생겼어. 이제 나는 아무 곳에도 속하지 못할 거야. 슬리퍼 자국으로 들어가던 자리가 사라졌어.',
      attribution: 'fate_blame', core_fear: 'abandonment', modality: 'narrative', role: 'victim',
      motif_tags: ['주택', '발자국', '속함', '슬리퍼'], pose: '등 굽음, 멀리 봄',
    },
    {
      label: 'speciation 1 사진 속 여인', kind: 'speciation', is_seed: true,
      parent_label: 'drift 7 사진의 주인',
      // 부모 변주 utterance — lookup 키
      parent_utterance: '그 사진의 주인은 누구였을까. 여동생일까, 부인일까. 사진 돌려주고 와서 한참을 생각했어. 다음 날도, 그 다음 날도.',
      utterance: '내 사진이 그의 작업복 뒷주머니에 있었어. 사랑하는 나의 아내, 라고 그가 적어둔 거. 그는 노란 장화를 신고 우리 집을 나가서, 다른 집으로 들어갔어. 한 번도 돌아본 적 없어. 그게 아직도 이상해.',
      attribution: 'other_blame', core_fear: 'abandonment', modality: 'narrative', role: 'victim',
      motif_tags: ['사진', '아내', '노란 장화', '집'], pose: '서서 사진을 듦, 거울 앞',
    },
  ];

  // ── 박을 자리 / 건너뛸 자리 분리 ──────────────────
  const toInsert = [];
  const skipped = [];
  for (const v of ALL_VARIANTS) {
    if (existingUtterances.has(v.utterance)) {
      skipped.push(v.label);
    } else {
      toInsert.push(v);
    }
  }
  log(`건너뜀: ${skipped.length}개 (${skipped.join(', ')})`);
  log(`박을 자리: ${toInsert.length}개`);

  if (toInsert.length === 0) {
    log('이미 다 박혀있음. 끝.');
    return;
  }

  // ── 부모 utterance → id 맵 (speciation parent lookup) ──
  const utteranceToId = new Map(existing.map(r => [r.utterance, r.id]));

  // ── 박기 ─────────────────────────────────────────
  let okCount = 0;
  for (const v of toInsert) {
    log(`  ${v.label} extract...`);
    let emotion_vec, extractor_version;
    try {
      const r = await extractEmotionVec(v.utterance, { attribution: v.attribution, core_fear: v.core_fear });
      emotion_vec = r.emotion_vec;
      extractor_version = r.extractor_version;
    } catch (e) {
      console.error(`[발자국 resume] ${v.label} extract 실패:`, e);
      console.error('[발자국 resume] 중단. 본 스크립트 다시 돌려서 이어 박을 수 있음.');
      return;
    }

    let parent_variant_id = null;
    if (v.kind === 'speciation' && v.parent_utterance) {
      parent_variant_id = utteranceToId.get(v.parent_utterance) || null;
      if (!parent_variant_id) {
        console.warn(`[발자국 resume] ${v.label} parent (${v.parent_label}) 못 찾음. parent_variant_id=null 으로 박음.`);
      }
    }

    const { data: row, error: gvErr } = await sb.from('ghost_variants').insert({
      memory_id: memoryId,
      kind: v.kind,
      is_seed: v.is_seed,
      parent_variant_id,
      utterance: v.utterance,
      attribution: v.attribution,
      core_fear: v.core_fear,
      modality: v.modality,
      role: v.role,
      motif_tags: v.motif_tags,
      pose: v.pose,
      emotion_vec,
      extractor_version,
    }).select('id').single();

    if (gvErr) {
      console.error(`[발자국 resume] ${v.label} INSERT 실패:`, gvErr);
      console.error('[발자국 resume] 중단. 본 스크립트 다시 돌려서 이어 박을 수 있음.');
      return;
    }

    utteranceToId.set(v.utterance, row.id);
    okCount++;
    log(`  ${v.label} ✓ (id=${row.id.slice(0, 8)}…, ver=${extractor_version}${parent_variant_id ? ', parent=' + parent_variant_id.slice(0, 8) + '…' : ''})`);
  }

  // ── 끝 ────────────────────────────────────────────
  const { count: finalCount } = await sb.from('ghost_variants').select('*', { count: 'exact', head: true }).eq('memory_id', memoryId);
  console.log('═══════════════════════════════════════════');
  console.log('[발자국 resume] 완료.');
  console.log(`  새로 박은 자리: ${okCount}개`);
  console.log(`  건너뛴 자리: ${skipped.length}개`);
  console.log(`  최종 ghost_variants: ${finalCount}행 (기대값: 16)`);
  console.log('═══════════════════════════════════════════');
})();
