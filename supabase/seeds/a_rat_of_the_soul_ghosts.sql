-- ════════════════════════════════════════════════════════════════════
--  A Rat of the Soul — ghost_variants 시드 (anchor 1 + 페르소나 12)
--
--  목적: 파일럿 때 메모리가 "여러 사람이 이미 거쳐간" 상태로 보이게.
--        대화 시스템(dialog-turn / _loadAndInjectGhostPools)이 이 변주들을
--        유령의 자기 자료로 끌어다 씀 → 유령이 누적된 결로 말함.
--
--  kind = 'drift'  (같은 유령의 발화 변주)
--  is_seed = true  (작가 시드 — 진짜 플레이어 drift(is_seed=false)와 구분.
--                   연구용 plays 데이터는 건드리지 않음.)
--  anchor(parent=null) + 12 personas(parent=anchor). 엔진이 emotion_vec
--  코사인 유사도로 resonance/vague/dissonance 풀 자동 분류.
--
--  실행: Supabase 대시보드 SQL Editor 에 붙여넣고 Run. 1회.
--  ⚠ 재실행하려면 먼저:
--    delete from ghost_variants where memory_id = '7a700000-0000-4000-8000-000000000000';
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── Anchor — 중심 해석 (다른 변주들이 이것과 비교돼 풀로 분류됨) ──────
insert into ghost_variants (id, memory_id, kind, parent_variant_id, emotion_vec, attribution, core_fear, modality, role, motif_tags, utterance, is_seed)
values (
  '7a700000-0001-4000-8000-000000000000',
  '7a700000-0000-4000-8000-000000000000',
  'drift', null,
  '{"fear":0.2,"sadness":0.4,"anger":0.1,"guilt":0.4,"shame":0.7,"longing":0.2,"numbness":0.6,"isolation":0.55}',
  'self_blame', 'none', 'narrative', 'observer',
  ARRAY['rat','clinic','identity'],
  $u$I was told, in a clinic, that I had always been a rat. I did not argue. The worst of it was how easily it made sense.$u$,
  true
);

-- ── 12 personas — 쥐 이야기의 12가지 독해 ────────────────────────────
insert into ghost_variants (id, memory_id, kind, parent_variant_id, emotion_vec, attribution, core_fear, modality, role, motif_tags, utterance, is_seed)
values

('7a700000-0001-4000-8000-000000000001','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.15,"sadness":0.45,"anger":0.15,"guilt":0.5,"shame":0.65,"longing":0.3,"numbness":0.45,"isolation":0.4}',
 'self_blame','failure','somatic','victim',ARRAY['taxidermy','father','brain'],
 $u$My father scooped the brain from the deer with a small spoon. A stuffed thing needs no brain, he said. I think I was emptied the same way — kept, not living.$u$, true),

('7a700000-0001-4000-8000-000000000002','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.3,"sadness":0.3,"anger":0.1,"guilt":0.55,"shame":0.7,"longing":0.1,"numbness":0.5,"isolation":0.45}',
 'self_blame','failure','narrative','actor',ARRAY['flight','shame','apology'],
 $u$I left every workplace with a single apologetic message. I called it fear. It was only ever easier to be a thing that flees.$u$, true),

('7a700000-0001-4000-8000-000000000003','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.2,"sadness":0.6,"anger":0.05,"guilt":0.2,"shame":0.25,"longing":0.4,"numbness":0.5,"isolation":0.65}',
 'fate_blame','abandonment','visual','observer',ARRAY['unclaimed','urn','name'],
 $u$The nameless urns were given names that day. Mine kept only the scratch I had made with a pebble. I was not sorry no one came.$u$, true),

('7a700000-0001-4000-8000-000000000004','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.1,"sadness":0.3,"anger":0.05,"guilt":0.15,"shame":0.25,"longing":0.35,"numbness":0.6,"isolation":0.4}',
 'unknown','none','somatic','actor',ARRAY['rat','acceptance','clinic'],
 $u$When I stopped refusing what I was, the ache in my body eased. I only had to eat what a rat eats. That was all it asked.$u$, true),

('7a700000-0001-4000-8000-000000000005','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.85,"sadness":0.15,"anger":0.1,"guilt":0.05,"shame":0.1,"longing":0.05,"numbness":0.2,"isolation":0.4}',
 'other_blame','death','visual','victim',ARRAY['door','swarm','dread'],
 $u$It knocked at the door at the height of my own head. The lightning fell, and I saw the visitor was rats — many of them, gathered into one body.$u$, true),

('7a700000-0001-4000-8000-000000000006','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.5,"sadness":0.2,"anger":0.05,"guilt":0.1,"shame":0.2,"longing":0.15,"numbness":0.45,"isolation":0.4}',
 'unknown','none','somatic','actor',ARRAY['nails','body','tail'],
 $u$I clip my nails and I do not put them in my mouth. But they grow back longer than they should. At night I still reach for a tail that is not there.$u$, true),

('7a700000-0001-4000-8000-000000000007','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.2,"sadness":0.2,"anger":0.6,"guilt":0.4,"shame":0.3,"longing":0.05,"numbness":0.2,"isolation":0.2}',
 'self_blame','failure','narrative','observer',ARRAY['rat','rejection','clinic'],
 $u$I do not believe the doctor. A man who runs is still a man who chose to run. 'Rat' is only a kinder word for never having tried.$u$, true),

('7a700000-0001-4000-8000-000000000008','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.2,"sadness":0.7,"anger":0.05,"guilt":0.2,"shame":0.2,"longing":0.45,"numbness":0.45,"isolation":0.5}',
 'fate_blame','death','somatic','observer',ARRAY['flood','ash','release'],
 $u$The flood took the columbarium and I did not reach for the urn. I let the ash sink. It was the first quiet thing in a long while.$u$, true),

('7a700000-0001-4000-8000-000000000009','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.15,"sadness":0.3,"anger":0.05,"guilt":0.2,"shame":0.3,"longing":0.2,"numbness":0.6,"isolation":0.5}',
 'unknown','none','visual','observer',ARRAY['photograph','recognition','memory'],
 $u$I held the photograph beside my own face until the memory returned. I was not surprised. Somewhere I had always half-known.$u$, true),

('7a700000-0001-4000-8000-00000000000a','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.45,"sadness":0.25,"anger":0.05,"guilt":0.1,"shame":0.15,"longing":0.1,"numbness":0.4,"isolation":0.45}',
 'fate_blame','none','narrative','observer',ARRAY['contamination','water','pipes'],
 $u$If the ash dissolved into the rain, it travels the pipes. It reaches the water. It reaches whoever next fills a glass.$u$, true),

('7a700000-0001-4000-8000-00000000000b','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.25,"sadness":0.3,"anger":0.15,"guilt":0.75,"shame":0.6,"longing":0.05,"numbness":0.4,"isolation":0.5}',
 'self_blame','rejection','narrative','actor',ARRAY['prison','guilt','torturer'],
 $u$Everyone knew, without being told, what I had done in that room. I never said it aloud. I only found I could not hold to anything afterward.$u$, true),

('7a700000-0001-4000-8000-00000000000c','7a700000-0000-4000-8000-000000000000','drift','7a700000-0001-4000-8000-000000000000',
 '{"fear":0.15,"sadness":0.5,"anger":0.1,"guilt":0.3,"shame":0.65,"longing":0.25,"numbness":0.45,"isolation":0.45}',
 'other_blame','rejection','visual','observer',ARRAY['living-room','shame','beautification'],
 $u$There are postures a living room wants on its wall, and postures it keeps in a box under the bed. I learned early which list held me.$u$, true);

commit;
