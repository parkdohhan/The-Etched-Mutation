-- ════════════════════════════════════════════════════════════════════
--  A Rat of the Soul  —  TEM memory seed
--  원작: <쥐> (한국어 단편).  영문 각색 10 씬.
--
--  실행: Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 Run.
--  ⚠ 한 번만 실행. 고정 UUID 라서 재실행하면 중복키 에러 → 다시 하려면
--    먼저:  delete from memories where id = '7a700000-0000-4000-8000-000000000000';
--    (scenes·choices 는 FK cascade 로 같이 삭제됨)
--
--  감정 8축: fear / sadness / anger / guilt / shame / longing / numbness / isolation
--  값 범위 0~1. 작가가 admin 에서 각 씬 열어 슬라이더로 미세조정 권장.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── Memory ──────────────────────────────────────────────────────────
insert into memories (id, code, title, description, memory_words, completed_sentence, status, source, is_public)
values (
  '7a700000-0000-4000-8000-000000000000',
  'RAT-SOUL-01',
  'A Rat of the Soul',
  $d$A spirit traces the memory of a dead man who was told, in a plain clinic, that he had always been a rat — through his taxidermist father, his fled and shameful life, a flood that drowns a columbarium, and the ash that returns to the drain. A memory about what a living room cannot hold.$d$,
  'rat, folded, rain, down, you',
  $cs$The rat was always folded inside, and the rain carries it down to you.$cs$,
  'Fetus',
  'beginner',
  true
);

-- ── Scenes (10) ─────────────────────────────────────────────────────
insert into scenes (id, memory_id, scene_order, text, echo_words, emotion_dist, emotion_vector, original_emotion, anchor_emotions, scene_type, scene_role, meta)
values

('7a700000-0000-4000-8000-0000000000a0','7a700000-0000-4000-8000-000000000000',0,
$s$There was a body here, once. The thatched house had given itself back to the field — moss fattening on the rain, beetles in the timber, a bird nesting in the failing roof. In the yard stood a small hill: forty centimeters high, fifty wide, one hundred seventy-three long. Grass and moss had grown over it until it belonged to the landscape, and nothing was troubled by it. Rabbits slept on it. Boars and hawks took their small meals from it. Animals drank the clear water pooled in the cracked skull and thought nothing at all. Everything dies the moment it is born — this is known not by the brain but by the body. So the house, and the small hill in its yard, were no trouble to anyone.$s$,
ARRAY['"hill"','"moss"','"skull"','"landscape"','"ordinary"']::json[],
'{"fear":0.15,"sadness":0.3,"anger":0.05,"guilt":0.05,"shame":0.1,"longing":0.15,"numbness":0.7,"isolation":0.5}',
'{"fear":0.15,"sadness":0.3,"anger":0.05,"guilt":0.05,"shame":0.1,"longing":0.15,"numbness":0.7,"isolation":0.5}',
'{"fear":0.15,"sadness":0.3,"anger":0.05,"guilt":0.05,"shame":0.1,"longing":0.15,"numbness":0.7,"isolation":0.5}',
'["numbness","isolation"]','normal','anchor',
'{"scene_code":"A","motif_tags":["death","landscape","indifference","body"]}'),

('7a700000-0000-4000-8000-0000000000a1','7a700000-0000-4000-8000-000000000000',1,
$s$Something shaped like a person walked out of the shade of the twin trees and into the light. I stepped into the yard. The valuables were long stolen, the grain long eaten by small animals — and still I was looking for something. The hill caught my foot. I fell with an ugly sound, and something broke beneath me. Bone is a weak thing. When I understood what the pale scattered pieces were, my body convulsed. A swarm of flies that had been kept inside him rose and went up into the sky. Can what fed on a part of him be called a part of him? In his wallet was an ID photograph. I held it beside my own face, and memory began to come back. I already half-knew I was a formless thing, so I was not surprised.$s$,
ARRAY['"bone"','"flies"','"photograph"','"formless"','"fall"']::json[],
'{"fear":0.5,"sadness":0.3,"anger":0.05,"guilt":0.15,"shame":0.45,"longing":0.1,"numbness":0.4,"isolation":0.5}',
'{"fear":0.5,"sadness":0.3,"anger":0.05,"guilt":0.15,"shame":0.45,"longing":0.1,"numbness":0.4,"isolation":0.5}',
'{"fear":0.5,"sadness":0.3,"anger":0.05,"guilt":0.15,"shame":0.45,"longing":0.1,"numbness":0.4,"isolation":0.5}',
'["fear","isolation"]','normal','anchor',
'{"scene_code":"B","motif_tags":["ghost","recognition","bone","memory"]}'),

('7a700000-0000-4000-8000-0000000000a2','7a700000-0000-4000-8000-000000000000',2,
$s$Weeks before he died, he went looking for a clinic. His own was closed, so he climbed to a third floor where a sign said only CLINIC. Inside, a doctor turned a monitor toward him — not a scan, only white stains on a black field. There, the doctor said, pointing to the center. He found a rat. Be a rat, the doctor said. You were born one and raised as a man — that is why you are sick. Sometimes you have to go back, like a whale surfacing to breathe. How? Eat anything of a rat. Fur, claw, tail. It doesn''t matter. The doctor''s eyes held no will of any kind. Leaving, he looked back through the window: the doctor was eating a snake''s shed skin with a long tongue. It makes sense, he murmured. That is why.$s$,
ARRAY['"clinic"','"rat"','"stain"','"shed-skin"','"constitution"']::json[],
'{"fear":0.45,"sadness":0.25,"anger":0.05,"guilt":0.1,"shame":0.3,"longing":0.1,"numbness":0.55,"isolation":0.4}',
'{"fear":0.45,"sadness":0.25,"anger":0.05,"guilt":0.1,"shame":0.3,"longing":0.1,"numbness":0.55,"isolation":0.4}',
'{"fear":0.45,"sadness":0.25,"anger":0.05,"guilt":0.1,"shame":0.3,"longing":0.1,"numbness":0.55,"isolation":0.4}',
'["numbness","fear"]','normal','anchor',
'{"scene_code":"C","motif_tags":["clinic","rat","diagnosis","absurd"]}'),

('7a700000-0000-4000-8000-0000000000a3','7a700000-0000-4000-8000-000000000000',3,
$s$I woke as the sun was going down. A crow stood on the small hill, working at the white bone. Shoo, I said — get off, you — but my hand passed straight through it. I looked at my own hand: a little transparent, the moon faintly showing through it, and yet with enough form that I felt I could still hold something. Inside the ribcage something had been left. Without thinking I reached in, and something met my fingers. I startled, shook my hand hard — then bore the wrongness of the touch and drew it out. It was his stomach. Inside the stomach was a wad: fur, fur, a thing like a cable, fur, the head of a small animal. I looked closely at the head, and knew it for a rat.$s$,
ARRAY['"crow"','"ribcage"','"stomach"','"wad"','"rat-head"']::json[],
'{"fear":0.4,"sadness":0.3,"anger":0.05,"guilt":0.15,"shame":0.2,"longing":0.1,"numbness":0.5,"isolation":0.45}',
'{"fear":0.4,"sadness":0.3,"anger":0.05,"guilt":0.15,"shame":0.2,"longing":0.1,"numbness":0.5,"isolation":0.45}',
'{"fear":0.4,"sadness":0.3,"anger":0.05,"guilt":0.15,"shame":0.2,"longing":0.1,"numbness":0.5,"isolation":0.45}',
'["numbness","isolation"]','normal','anchor',
'{"scene_code":"D","motif_tags":["ghost","viscera","rat","evidence"]}'),

('7a700000-0000-4000-8000-0000000000a4','7a700000-0000-4000-8000-000000000000',4,
$s$His father was a taxidermist. The workshop was a basement where chemical and flesh pooled at the ceiling. A deer is only deer-like after it dies — alive it flees and groans; stuffed, it is calm, and worth hanging in a living room. The boy learned that taxidermy does not preserve the dead as living. It makes what was ugly in life look good in death. It is beautification. His task was the brain: a small spoon, the gray-white softness into a bucket. A stuffed deer has no brain. Under his bed he kept his own work — cockroaches pinned to plywood, labeled by date and the place beneath the sink. His father found the shoebox and crushed it underfoot. Don''t call that taxidermy. There were animals his father would never stuff — rats, roaches, pigeons, strays. The things a living room cannot hold. The boy learned the list.$s$,
ARRAY['"taxidermy"','"basement"','"beautification"','"brain"','"living-room"']::json[],
'{"fear":0.2,"sadness":0.45,"anger":0.25,"guilt":0.4,"shame":0.55,"longing":0.35,"numbness":0.4,"isolation":0.4}',
'{"fear":0.2,"sadness":0.45,"anger":0.25,"guilt":0.4,"shame":0.55,"longing":0.35,"numbness":0.4,"isolation":0.4}',
'{"fear":0.2,"sadness":0.45,"anger":0.25,"guilt":0.4,"shame":0.55,"longing":0.35,"numbness":0.4,"isolation":0.4}',
'["shame","sadness"]','normal','anchor',
'{"scene_code":"E","motif_tags":["father","taxidermy","childhood","shame"]}'),

('7a700000-0000-4000-8000-0000000000a5','7a700000-0000-4000-8000-000000000000',5,
$s$After prison he took factory work — the only thing left to him. His hands were good and we thought he would be an ace, but he was shy, and when it spread that he was an ex-convict he had to leave. Everyone knew, without being told, that he had been a torturer. I looked for proof that he was a rat — that he had said the word, or vanished and returned, or gnawed through wire. I found none. Only that he could hold to nothing, that after any ordinary mistake he was too afraid of the cleaning-up, and left with a single apologetic text. He could not understand why his father took him back. A man is human because he goes out and does what must be done. One who finds it so easy to flee that — surely that one is no child of men.$s$,
ARRAY['"prison"','"factory"','"torturer"','"apology"','"fleeing"']::json[],
'{"fear":0.3,"sadness":0.35,"anger":0.15,"guilt":0.55,"shame":0.65,"longing":0.15,"numbness":0.45,"isolation":0.5}',
'{"fear":0.3,"sadness":0.35,"anger":0.15,"guilt":0.55,"shame":0.65,"longing":0.15,"numbness":0.45,"isolation":0.5}',
'{"fear":0.3,"sadness":0.35,"anger":0.15,"guilt":0.55,"shame":0.65,"longing":0.15,"numbness":0.45,"isolation":0.5}',
'["shame","guilt"]','normal','anchor',
'{"scene_code":"F","motif_tags":["prison","failure","shame","flight"]}'),

('7a700000-0000-4000-8000-0000000000a6','7a700000-0000-4000-8000-000000000000',6,
$s$A shallow sleep flees at a small sound. You wake — the monitor lighting the room, December rain at the glass, your breath fogging. The sound that woke you comes again, from the front door. You step onto the frozen floor. As you leave the room the door locks behind you with a bang; you are not surprised, because this is a dream. You feel along the dark hallway. Lightning shows the kitchen window, and you are already at the iron door, its cold on your nose. Rat sounds — from outside, at the height of your head. A chime. An unfamiliar voice: could you open the door for me? Don''t, you say inside — but in dreams you were never the one who moved. The door creaks. Lightning falls between you and the visitor: a lump, two meters, barely a person, the whole of it crawling. The crawling is rats. Rats gathered into one body.$s$,
ARRAY['"door"','"winter-rain"','"lightning"','"visitor"','"swarm"']::json[],
'{"fear":0.8,"sadness":0.2,"anger":0.05,"guilt":0.05,"shame":0.1,"longing":0.05,"numbness":0.25,"isolation":0.5}',
'{"fear":0.8,"sadness":0.2,"anger":0.05,"guilt":0.05,"shame":0.1,"longing":0.05,"numbness":0.25,"isolation":0.5}',
'{"fear":0.8,"sadness":0.2,"anger":0.05,"guilt":0.05,"shame":0.1,"longing":0.05,"numbness":0.25,"isolation":0.5}',
'["fear","isolation"]','normal','anchor',
'{"scene_code":"G","motif_tags":["dream","door","rats","dread"]}'),

('7a700000-0000-4000-8000-0000000000a7','7a700000-0000-4000-8000-000000000000',7,
$s$A banner said JOINT MEMORIAL. The urns were wheeled out into the sun. He had scratched his own with a pebble, and still he lost it among the others. People in blue windbreakers gathered; no one wept, of course, and so it looked like a kind of show, though they seemed drunk on some duty. While the prayer was read he searched dozens of urns and found his — nameless, but for the scratch. The others had names cut into them. The unclaimed are given names; that is not strange. Then the rain came. They rushed the urns onto carts, and ours, farthest from the door, waited its turn in the rain. The river swelled. The water barrier bent, and broke with the thunder, and the flood came in. The urns began to go under. The ash sank into the muddy water. I opened my mouth, and put it in, and chewed.$s$,
ARRAY['"urn"','"scratch"','"unclaimed"','"flood"','"ash"']::json[],
'{"fear":0.25,"sadness":0.65,"anger":0.05,"guilt":0.2,"shame":0.2,"longing":0.4,"numbness":0.45,"isolation":0.55}',
'{"fear":0.25,"sadness":0.65,"anger":0.05,"guilt":0.2,"shame":0.2,"longing":0.4,"numbness":0.45,"isolation":0.55}',
'{"fear":0.25,"sadness":0.65,"anger":0.05,"guilt":0.2,"shame":0.2,"longing":0.4,"numbness":0.45,"isolation":0.55}',
'["sadness","isolation"]','normal','anchor',
'{"scene_code":"H","motif_tags":["columbarium","flood","ash","memorial"]}'),

('7a700000-0000-4000-8000-0000000000a8','7a700000-0000-4000-8000-000000000000',8,
$s$At first nothing. Then a single hair pricked my tongue, and along that sensation I began to shrink — not by degrees but all at once. Fingers became toes and toes became fingers and both became hooks. The spine lengthened. To say a tail grew is not right; the tail had always been there, folded inside the human taxidermy. I was a rat. A rat of the soul. I went down through the muddy water to his urn and pushed it from its stand, and gnawed the acrylic lid — a rat''s teeth can gnaw anything, that is the instinct, the original self the doctor meant. The ash bloomed gray into the water and scattered toward the drain, and the drain to the sewer. I followed. It was dark and narrow and warm, and other rats were there. They did not look at me. But they were there, and I had arrived. Everything I had lived was the deviation. I gave my body to the current.$s$,
ARRAY['"shrink"','"tail"','"soul"','"sewer"','"current"']::json[],
'{"fear":0.15,"sadness":0.35,"anger":0.05,"guilt":0.15,"shame":0.2,"longing":0.3,"numbness":0.6,"isolation":0.45}',
'{"fear":0.15,"sadness":0.35,"anger":0.05,"guilt":0.15,"shame":0.2,"longing":0.3,"numbness":0.6,"isolation":0.45}',
'{"fear":0.15,"sadness":0.35,"anger":0.05,"guilt":0.15,"shame":0.2,"longing":0.3,"numbness":0.6,"isolation":0.45}',
'["numbness","isolation"]','normal','anchor',
'{"scene_code":"I","motif_tags":["transformation","rat","sewer","release"]}'),

('7a700000-0000-4000-8000-0000000000a9','7a700000-0000-4000-8000-000000000000',9,
$s$That morning you remember only that you dreamed something unpleasant. You think of a strange supposition: that ash dissolved in rain would travel the pipes, and the pipes, and reach the water mains. You clip your nails. The clippings fall to the basin, and you look at them a long while. You do not put them in your mouth. But you see that your nails have grown longer than usual.$s$,
ARRAY['"dream"','"pipes"','"nails"','"water"','"longer"']::json[],
'{"fear":0.4,"sadness":0.2,"anger":0.05,"guilt":0.1,"shame":0.15,"longing":0.15,"numbness":0.4,"isolation":0.4}',
'{"fear":0.4,"sadness":0.2,"anger":0.05,"guilt":0.1,"shame":0.15,"longing":0.15,"numbness":0.4,"isolation":0.4}',
'{"fear":0.4,"sadness":0.2,"anger":0.05,"guilt":0.1,"shame":0.15,"longing":0.15,"numbness":0.4,"isolation":0.4}',
'["fear","numbness"]','normal','anchor',
'{"scene_code":"J","motif_tags":["coda","contamination","nails","inheritance"]}');

-- ── Choices (감정 결만 기록 — next_scene 없음) ──────────────────────
insert into choices (scene_id, choice_order, text, emotion, intensity)
values
('7a700000-0000-4000-8000-0000000000a0',0,'Let it be landscape. Nothing here asks to be mourned.','numbness',7),
('7a700000-0000-4000-8000-0000000000a0',1,'A body should not be this quiet.','sadness',6),

('7a700000-0000-4000-8000-0000000000a1',0,'Pick up the photograph. Look until the face is yours.','fear',7),
('7a700000-0000-4000-8000-0000000000a1',1,'Step back from the bone. Pretend the fall never happened.','shame',6),

('7a700000-0000-4000-8000-0000000000a2',0,'Believe the doctor. It is easier than arguing.','numbness',8),
('7a700000-0000-4000-8000-0000000000a2',1,'Something is wrong with this clinic. Leave.','fear',6),

('7a700000-0000-4000-8000-0000000000a3',0,'Hold the wad. Do not look away from what he ate.','fear',7),
('7a700000-0000-4000-8000-0000000000a3',1,'Drop it. Some things should stay inside the body.','isolation',6),

('7a700000-0000-4000-8000-0000000000a4',0,'I was the brain in the bucket — kept for nothing.','shame',8),
('7a700000-0000-4000-8000-0000000000a4',1,'I wanted to open my father and see what made him human.','anger',6),

('7a700000-0000-4000-8000-0000000000a5',0,'I flee because I was never a child of men.','shame',8),
('7a700000-0000-4000-8000-0000000000a5',1,'I only made the mistakes anyone makes.','guilt',6),

('7a700000-0000-4000-8000-0000000000a6',0,'Do not open it. Hold your mouth shut.','fear',9),
('7a700000-0000-4000-8000-0000000000a6',1,'Open it. You were never the one who moved.','numbness',6),

('7a700000-0000-4000-8000-0000000000a7',0,'Let the ash go under. Names were never given to us.','isolation',7),
('7a700000-0000-4000-8000-0000000000a7',1,'Reach for the urn before the water takes it.','longing',6),

('7a700000-0000-4000-8000-0000000000a8',0,'Give the body to the current. This was always the shape.','numbness',7),
('7a700000-0000-4000-8000-0000000000a8',1,'The other rats do not see me. I have still arrived.','isolation',6),

('7a700000-0000-4000-8000-0000000000a9',0,'Do not put them in your mouth.','fear',7),
('7a700000-0000-4000-8000-0000000000a9',1,'Look at how long they have grown.','numbness',6);

commit;
