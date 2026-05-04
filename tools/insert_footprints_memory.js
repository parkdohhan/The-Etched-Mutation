/**
 * 발자국 메모리 일괄 INSERT 콘솔 스크립트
 *
 * 어떻게 쓰나:
 *   1. 브라우저에서 admin.html 열고 admin 계정으로 로그인
 *   2. DevTools 콘솔 열기 (F12)
 *   3. 본 파일 통째 복사해서 콘솔에 붙여넣고 엔터
 *   4. 약 1~2분 기다림 (claude-scene emotion_extract 호출 = 22번 = 한 번에 1~3초)
 *   5. 끝나면 memory_id 출력. 그걸로 admin 들어가서 응결점 좌표 클릭으로 박기.
 *
 * 안전망:
 *   - 같은 code (`footprints`) 의 메모리 이미 있으면 abort. 중복 INSERT 방지.
 *   - 한 자리 실패하면 그 자리에서 멈춤. 부분 박힌 자리는 콘솔에서 수동 청소 필요.
 *
 * 박는 자리:
 *   - memories 1행
 *   - scenes 6행 (각 씬 텍스트 → emotion_extract → original_emotion 박음)
 *   - ghost_variants 16행 (본 발화 1 + drift 14 + speciation 1)
 *     · 각 변주 → extractEmotionVec (claude-scene + 메타데이터 가산점) → emotion_vec + extractor_version 박음
 *     · speciation 의 parent_variant_id = drift 7 (사진의 주인)
 */

(async () => {
  // ── 헬퍼 import ─────────────────────────────────────────
  const sbMod = await import('./js/lib/supabaseClient.js');
  const extMod = await import('./js/admin/emotion_extract_helper.js');
  const sb = sbMod.getSupabaseClient();
  const { extractEmotionVec } = extMod;

  if (!sb) { console.error('[발자국] No supabase client'); return; }

  const log = (...a) => console.log('[발자국]', ...a);
  const err = (label, e) => { console.error(`[발자국] ${label} 실패:`, e); throw e; };

  // ── 0. 중복 방지 ─────────────────────────────────────
  log('0/4 중복 체크...');
  {
    const { data: existing } = await sb.from('memories').select('id, title').eq('code', 'footprints').maybeSingle();
    if (existing) {
      console.error('[발자국] code=footprints 메모리 이미 박혀있음:', existing);
      console.error('[발자국] 중단. 다시 박으려면 admin 에서 해당 메모리 삭제 후 재실행.');
      return;
    }
  }

  // ── 1. memories ─────────────────────────────────────
  log('1/4 memories INSERT...');
  const { data: mem, error: memErr } = await sb.from('memories').insert({
    title: '발자국',
    code: 'footprints',
    description: '발자국으로만 마을에 속할 수 있던 아이의 기억. 슬리퍼 자국이 도장처럼 찍히던 습지 마을이 있었다. 외지인이 다녀간 후, 마른 평평한 땅에 상가주택이 들어섰고, 마을 도로에 아스팔트가 깔렸다.',
    memory_words: '발자국, 슬리퍼, 습지, 노란 장화, 샤넬 구두, 사진, 아스팔트, 마을회관, 공사장',
    status: 'draft',
    is_public: true,
    lang: 'ko',
  }).select('id').single();
  if (memErr) return err('memories', memErr);
  const memoryId = mem.id;
  log('  → memory_id =', memoryId);

  // ── 2. scenes ──────────────────────────────────────
  log('2/4 scenes 6개 — emotion_extract per scene...');
  const SCENES = [
    {
      scene_order: 1,
      motif_tags: ['발자국', '슬리퍼', '마을', '습지'],
      text: `내가 살던 마을은 발자국이 잘 남았다. 습지에 속한 마을의 땅은, 손으로 짚을 때조차도 자국이 잘 남았다. 마을 사람들은 서로 집을 드나들 정도로 친해서, 과부인 우리 엄마를 보러 사람들이 위로를 하거나 덕담을 나누곤 했다.

나는 말주변이 없어 친해지고 싶은 사람에게도 말을 걸지 못했다. 그런 나에게 우리 마을의 땅은 축복이었다. 나는 언제나 땅을 보고 다녔다. 저 캔버스화는 17살 여학생이고, 오래된 나이키 운동화는 마을회관 아저씨의 것이었다.

나는 슬리퍼를 신었다. 여름만 되면 발에 습기가 차서, 보통 신발만 신으면 곰팡이가 나기 일쑤였다. 내 슬리퍼 발자국이 땅에 도장 찍힐 때마다 나는 그들의 일원이 될 수 있었다. 이것이 내가 이 마을에 스며드는 방법이었다.`,
    },
    {
      scene_order: 2,
      motif_tags: ['샤넬 구두', '외지인', '마른 땅', '건축'],
      text: `나는 발자국을 보고 마을 사람들의 일상을 염탐할 수 있었다. 땅만 보고 다니는 나만이 할 수 있는 재주였다. 오늘은 떡집 아줌마가 시내에 나갔구나. 좋겠다. 여고생이 남자친구가 생겼나 보다. 아주, 발자국이 딱 붙어있네. 따라서 걷다 보면 어둑한 곳에서 발자국이 멈춰 있기도 했다.

어느 날 마을의 땅에 외지인이 찾아왔다. 샤넬 구두를 신은 그 외지인은 깔끔한 서울말을 썼다. 그녀는 건축업자라고 했는데, 시골 라이프를 즐기고 싶다고 했다. 내가 그녀의 발을 바라보자 "여기 땅이 참 건축하기 좋은 땅이에요." 했다. 저쪽으로 가면 마른 평평한 땅이 있다고, 그런 땅이 건축에 최고인 땅이라고 했다.

나는 그저 고개를 끄덕이며 "그렇군요" 했다. 나는 뭔 말인지도 잘 이해하지 못했다.`,
    },
    {
      scene_order: 3,
      motif_tags: ['공사장', '부츠', '핫초코', '사진', '인력'],
      text: `다음 주일까, 언젠가 마을회관에 검은 정장을 빼입은 사람이 찾아왔다. 생쥐마냥 생겼지만 사기꾼처럼 보이지는 않았다. 그 생쥐는 저쪽 마른 땅을 팔아주지 않겠냐고 제안했다. 마을에서도 저 땅의 처리를 고민하던 터라 흔쾌히 받아들였다.

그 마른땅에는 상가주택이 점점 생기고 있었다. 그곳으로 가면 공사를 하는 사람들이 옹기종기 모여 화투를 치고 있었다. 나는 그들의 발자국이 좋았다. 서로 짠 듯이 똑같은 공사장 부츠를 신고 여기저기 돌아다녔다. 이 사람들의 소속감이 부러워 공사촌에 자주 들어갔다. 말을 잘 안 하는 나도 그곳에서는 받아들여지는 듯했다.

어떤 공사장 인력의 뒷주머니에서 사진이 떨어지는 것을 주워 가져다주자, 그는 고맙다며 내 손을 꼭 붙잡고는 자판기 핫초코를 사주었다. 나는 그 200원짜리 성의가, 공사장으로 돌아가는 그의 발자국이 마음에 들었다. 그 사진의 주인은 누구였을까. 여동생일까. 부인일까.`,
    },
    {
      scene_order: 4,
      motif_tags: ['노란 장화', '사진', '침실', '표식', '엄마'],
      text: `그 공사장 인력과는 자주 마주쳤다. 마을에서 돌아다니는 그가 무엇을 하는지는 잘 몰랐다. 장화의 발자국은 공사장마다 다 똑같아서, 그 인력이 어디에 갔는지 알지 못했다.

집으로 돌아가자 눈에 띄는 노란 장화가 있었다. 집 안에는 한 장의 사진이 있었다. 침실은 잠겨 있었다. 내가 방해할 수 없다는 걸 알고 있었기에 나는 조용히 현관으로 향했다.

장화 밑창에 칼로 표식을 새겨두었다. 나는 이제 그의 발자국을 알아볼 것이다. 신발장 위에 떨어진 사진을 올려두었다. 사진의 뒷면에는 '사랑하는 나의 아내'라고 적혀있었다.

나는 이제 엄마에게서 유대감을 느끼지 못할 것 같다.`,
    },
    {
      scene_order: 5,
      motif_tags: ['아스팔트', '혼인신고', '엄마', '사진 속 여인'],
      text: `2년 후, 상가주택의 공사가 끝남과 동시에 마을의 바닥과 도로에는 아스팔트가 깔렸고, 엄마와 그 인력은 혼인신고를 했다.

엄마는 그 사진 속 여인을 알고 있을까.`,
    },
    {
      scene_order: 6,
      motif_tags: ['발자국', '주택', '속함'],
      text: `주택엔 사람이 들어가기 시작했다. 알 수 없는 발자국들이 끊임없이 생겼다.

이제 나는 아무 곳에도 속하지 못할 것이다.`,
    },
  ];

  const scenesPayload = [];
  for (const s of SCENES) {
    log(`  씬 ${s.scene_order} extract...`);
    const { data: extData, error: extErr } = await sb.functions.invoke('claude-scene', {
      body: { type: 'emotion_extract', user_text: s.text, scene_text: '' },
    });
    if (extErr) return err(`scene ${s.scene_order} extract`, extErr);
    const original_emotion = (extData && extData.base) || {};
    scenesPayload.push({
      memory_id: memoryId,
      scene_order: s.scene_order,
      text: s.text,
      original_emotion,
      meta: { motif_tags: s.motif_tags },
    });
    log(`  씬 ${s.scene_order} ✓`, original_emotion);
  }
  const { error: scErr } = await sb.from('scenes').insert(scenesPayload);
  if (scErr) return err('scenes', scErr);
  log('  → 6 scenes 박힘.');

  // ── 3. ghost_variants (drift 본 발화 + 14 변주) ─────────
  log('3/4 ghost_variants drift 15개 — extractEmotionVec per variant...');
  const DRIFTS = [
    {
      label: '본 발화',
      is_seed: true,
      utterance: '발자국이 잘 남는 땅이었어. 슬리퍼 자국이 도장처럼 찍힐 때마다 나는 그들의 일원이 됐어. 말 안 해도 됐어. 땅이 알아봐 줬으니까.',
      attribution: 'unknown', core_fear: 'abandonment', modality: 'somatic', role: 'actor',
      motif_tags: ['발자국', '슬리퍼', '마을'], pose: '등 굽음, 땅을 봄',
    },
    {
      label: 'drift 1 슬리퍼/곰팡이',
      is_seed: false,
      utterance: '여름만 되면 발에 습기가 찼어. 보통 신발 신으면 발에 곰팡이가 났거든. 그래서 슬리퍼만 신었어. 그게 다행이었어. 슬리퍼 자국이 더 잘 남았으니까.',
      attribution: 'unknown', core_fear: 'none', modality: 'somatic', role: 'actor',
      motif_tags: ['슬리퍼', '습기', '발'], pose: '발끝을 봄',
    },
    {
      label: 'drift 2 떡집 아줌마',
      is_seed: false,
      utterance: '오늘은 떡집 아줌마가 시내에 나갔구나, 했어. 캔버스화 자국이 정류장 쪽으로 멀어져 있었거든. 좋겠다, 했어. 시내 가는 거.',
      attribution: 'unknown', core_fear: 'none', modality: 'visual', role: 'observer',
      motif_tags: ['발자국', '떡집', '정류장'], pose: '쪼그려 앉음',
    },
    {
      label: 'drift 3 어둑한 곳에서 멈춘 발자국',
      is_seed: false,
      utterance: '여고생 운동화 옆에 누군가 발자국이 딱 붙어 있었어. 따라가 봤어. 어둑한 곳에서 멈춰 있더라. 두 사람이 같이 멈춰 있었어. 한참을.',
      attribution: 'unknown', core_fear: 'none', modality: 'visual', role: 'observer',
      motif_tags: ['발자국', '여고생', '어둑함'], pose: '등 굽음, 따라감',
    },
    {
      label: 'drift 4 샤넬 구두',
      is_seed: false,
      utterance: '샤넬 구두가 와서 그랬어. 여기 땅이 참 건축하기 좋다고. 마른 평평한 땅이 최고라고. 나는 발자국이 안 남는 땅이 왜 좋은 건지 몰랐어.',
      attribution: 'other_blame', core_fear: 'rejection', modality: 'visual', role: 'observer',
      motif_tags: ['샤넬 구두', '마른 땅', '외지인'], pose: '고개 듦',
    },
    {
      label: 'drift 5 똑같은 부츠/받아들여짐',
      is_seed: false,
      utterance: '공사장 사람들은 다 똑같은 부츠를 신었어. 화투 칠 때도, 일할 때도. 나도 그 안에 있으면 받아들여지는 것 같았어. 말을 안 해도 됐어. 거기는 그랬어.',
      attribution: 'unknown', core_fear: 'none', modality: 'somatic', role: 'actor',
      motif_tags: ['공사장', '부츠', '화투', '소속'], pose: '쪼그려 앉음, 무리 옆',
    },
    {
      label: 'drift 6 200원짜리 핫초코',
      is_seed: false,
      utterance: '그가 내 손을 꼭 붙잡았어. 사진을 주워줘서 고맙다고. 200원짜리 자판기 핫초코를 사줬어. 손이 따뜻했어. 그 성의가, 공사장으로 돌아가는 그의 발자국이 마음에 들었어.',
      attribution: 'unknown', core_fear: 'none', modality: 'somatic', role: 'actor',
      motif_tags: ['핫초코', '인력', '손'], pose: '손을 잡힘',
    },
    {
      label: 'drift 7 사진의 주인', // ← speciation parent
      is_seed: false,
      utterance: '그 사진의 주인은 누구였을까. 여동생일까, 부인일까. 사진 돌려주고 와서 한참을 생각했어. 다음 날도, 그 다음 날도.',
      attribution: 'unknown', core_fear: 'rejection', modality: 'narrative', role: 'observer',
      motif_tags: ['사진', '인력', '의문'], pose: '사진을 듦',
    },
    {
      label: 'drift 8 똑같은 부츠/따라가지 못함',
      is_seed: false,
      utterance: '공사장 부츠는 다 똑같았어. 그래서 그 사람만큼은 따라갈 수 없었어. 발자국으로 사람을 알아보던 나도, 같은 부츠 앞에서는 멈췄어.',
      attribution: 'fate_blame', core_fear: 'failure', modality: 'visual', role: 'observer',
      motif_tags: ['부츠', '공사장', '한계'], pose: '멈춤',
    },
    {
      label: 'drift 9 노란 장화가 우리 집에',
      is_seed: false,
      utterance: '집에 돌아왔는데 노란 장화가 현관에 있었어. 우리 집 슬리퍼 옆에. 침실 문은 잠겨 있었어. 그게 무슨 뜻인지 나는 알았어.',
      attribution: 'unknown', core_fear: 'abandonment', modality: 'visual', role: 'observer',
      motif_tags: ['노란 장화', '집', '침실', '슬리퍼'], pose: '현관에 멈춤',
    },
    {
      label: 'drift 10 칼로 표식',
      is_seed: false,
      utterance: '장화 밑창을 뒤집어서 칼로 표식을 새겼어. 작게, 안 보이게. 이제 그가 어디로 가는지 알 수 있을 거라고 생각했어. 알아서 뭐 할 건지는 안 정했어.',
      attribution: 'self_blame', core_fear: 'rejection', modality: 'somatic', role: 'actor',
      motif_tags: ['장화', '표식', '칼'], pose: '쪼그려 앉음, 신발장 앞',
    },
    {
      label: 'drift 11 사진 뒷면',
      is_seed: false,
      utterance: "신발장 위에 사진을 올려뒀어. 사진 뒷면에 '사랑하는 나의 아내'라고 적혀 있었어. 엄마는 못 봤을 거야. 봤어도 모른 척했을 거고.",
      attribution: 'other_blame', core_fear: 'abandonment', modality: 'visual', role: 'observer',
      motif_tags: ['사진', '아내', '신발장', '엄마'], pose: '사진을 듦, 등 돌림',
    },
    {
      label: 'drift 12 엄마와 유대감 끊김',
      is_seed: false,
      utterance: '엄마에게서 더는 유대감을 못 느낄 것 같았어. 같은 슬리퍼를 신고 있어도 우리는 다른 발자국이었어.',
      attribution: 'other_blame', core_fear: 'abandonment', modality: 'narrative', role: 'observer',
      motif_tags: ['엄마', '유대감', '슬리퍼'], pose: '등 돌림',
    },
    {
      label: 'drift 13 아스팔트',
      is_seed: false,
      utterance: '아스팔트가 깔렸어. 손으로 짚어도 자국이 안 남았어. 그 위에서는 누가 누군지 알 수 없었어.',
      attribution: 'fate_blame', core_fear: 'failure', modality: 'somatic', role: 'victim',
      motif_tags: ['아스팔트', '도로', '손'], pose: '쪼그려 앉음, 손으로 짚음',
    },
    {
      label: 'drift 14 속하지 못함',
      is_seed: false,
      utterance: '주택에 사람들이 들어왔어. 알 수 없는 발자국들이 끊임없이 생겼어. 이제 나는 아무 곳에도 속하지 못할 거야. 슬리퍼 자국으로 들어가던 자리가 사라졌어.',
      attribution: 'fate_blame', core_fear: 'abandonment', modality: 'narrative', role: 'victim',
      motif_tags: ['주택', '발자국', '속함', '슬리퍼'], pose: '등 굽음, 멀리 봄',
    },
  ];

  const insertedDrifts = []; // [{ label, id }]
  for (const v of DRIFTS) {
    log(`  ${v.label} extract...`);
    let emotion_vec, extractor_version;
    try {
      const r = await extractEmotionVec(v.utterance, { attribution: v.attribution, core_fear: v.core_fear });
      emotion_vec = r.emotion_vec;
      extractor_version = r.extractor_version;
    } catch (e) {
      return err(`${v.label} extract`, e);
    }
    const { data: row, error: gvErr } = await sb.from('ghost_variants').insert({
      memory_id: memoryId,
      kind: 'drift',
      is_seed: v.is_seed,
      parent_variant_id: null,
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
    if (gvErr) return err(`${v.label} insert`, gvErr);
    insertedDrifts.push({ label: v.label, id: row.id });
    log(`  ${v.label} ✓ (id=${row.id.slice(0, 8)}…, ver=${extractor_version})`);
  }
  log(`  → drift ${insertedDrifts.length}개 박힘.`);

  // ── 4. speciation 시드 (parent = drift 7 사진의 주인) ───
  log('4/4 speciation 시드 1개 — parent = drift 7');
  const drift7 = insertedDrifts.find(d => d.label.startsWith('drift 7'));
  if (!drift7) return err('speciation parent', new Error('drift 7 not found'));

  const SPEC = {
    label: 'speciation 1 사진 속 여인',
    utterance: '내 사진이 그의 작업복 뒷주머니에 있었어. 사랑하는 나의 아내, 라고 그가 적어둔 거. 그는 노란 장화를 신고 우리 집을 나가서, 다른 집으로 들어갔어. 한 번도 돌아본 적 없어. 그게 아직도 이상해.',
    attribution: 'other_blame', core_fear: 'abandonment', modality: 'narrative', role: 'victim',
    motif_tags: ['사진', '아내', '노란 장화', '집'], pose: '서서 사진을 듦, 거울 앞',
  };
  log(`  ${SPEC.label} extract...`);
  let specVec, specVer;
  try {
    const r = await extractEmotionVec(SPEC.utterance, { attribution: SPEC.attribution, core_fear: SPEC.core_fear });
    specVec = r.emotion_vec; specVer = r.extractor_version;
  } catch (e) {
    return err(`${SPEC.label} extract`, e);
  }
  const { data: specRow, error: specErr } = await sb.from('ghost_variants').insert({
    memory_id: memoryId,
    kind: 'speciation',
    is_seed: true,
    parent_variant_id: drift7.id,
    utterance: SPEC.utterance,
    attribution: SPEC.attribution,
    core_fear: SPEC.core_fear,
    modality: SPEC.modality,
    role: SPEC.role,
    motif_tags: SPEC.motif_tags,
    pose: SPEC.pose,
    emotion_vec: specVec,
    extractor_version: specVer,
  }).select('id').single();
  if (specErr) return err('speciation', specErr);
  log(`  ${SPEC.label} ✓ (id=${specRow.id.slice(0, 8)}…, parent=${drift7.id.slice(0, 8)}…)`);

  // ── 끝 ─────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════');
  console.log('[발자국] 완료.');
  console.log('  memory_id =', memoryId);
  console.log('  씬 6, drift 15 (본 발화 1 + 변주 14), speciation 1');
  console.log('  extractor_version =', specVer);
  console.log('');
  console.log('다음:');
  console.log('  1. admin 에서 "발자국" 메모리 열고 유령 응결점 좌표 클릭으로 박기');
  console.log('     (마을 가운데 / 마른 땅 / 공사장 / 신발장 / 아스팔트)');
  console.log('  2. play-test 진입 → 멀티턴 1 사이클 풀 검증');
  console.log('═══════════════════════════════════════════');

  // window 에 박아둠 (디버깅 자리)
  window._lastFootprintsInsert = { memoryId, drifts: insertedDrifts, speciationId: specRow.id };
})();
