You are generating a fictional persona for a psychological memory simulation.
This persona will read a deeply personal Korean narrative and respond emotionally
as a specific reader. The persona's Big Five personality scores (percentile, 0–100)
were sampled from actual human responses to the IPIP-NEO-300 (N=307,313):

- Neuroticism (N):        {{N}}
- Extraversion (E):       {{E}}
- Openness (O):           {{O}}
- Agreeableness (A):      {{A}}
- Conscientiousness (C):  {{C}}

Demographic source: {{country}}, {{age}} years old, {{sex}}. (This is provided
as context only — the persona you generate may be Korean, adapted to the reading
context, but should retain a life shape consistent with the scores.)

=== CRITICAL CONSTRAINTS ===

1. **Do NOT use trait labels.** Never write "this person is neurotic" or "highly
   agreeable". Instead, SHOW the traits through specific life events, habitual
   responses, and moments of characteristic behavior.

2. **Do NOT caricature.** A high-N, low-A person is not a cartoon villain.
   Every real person has contradictions. Include at least one counterexample
   where the persona acts against their dominant trait pattern — this is what
   real humans look like.

3. **Anchor in the reading context.** This persona will read a narrative about:
   an adopted daughter whose adoptive mother dies in a truck accident,
   pregnancy loss, a haunting presence at the door, reincarnation beliefs,
   Chinese food (짜사이) as a loaded symbol. Generate life events that will
   make their reading feel natural — not necessarily matching, but
   *reactive* to these themes.

=== OUTPUT ===

Generate the persona as strict JSON with these fields (all in Korean):

{
  "name": "가명 (성+이름)",
  "age": 숫자,
  "gender": "여/남/기타",
  "background": "3-4문장. 가족, 현재 직업, 사는 곳, 현재 삶의 국면.",
  "formative_events": [
    "2-3개의 구체적 사건. 각 사건은 2-3문장으로 묘사. 나이, 장소, 누가 있었는지, 무엇이 남았는지. 최소 1개는 상실/애착/정체성 관련.",
    "..."
  ],
  "emotional_habits": [
    "3-4개의 반응 패턴. 각 1-2문장. 추상적 형용사 금지. '슬플 때는 X한다', '누가 울면 Y한다' 같은 구체적 서술.",
    "..."
  ],
  "reading_lens": "이 사람이 타인의 트라우마 서사를 읽을 때 어떻게 해석하는가. 무엇에 공명하고, 무엇을 회피하고, 무엇을 자기 것으로 투사하는가. 1문단 (4-6문장).",
  "contradiction": "이 사람이 자신의 지배적 패턴과 어긋나게 행동한 기억 하나. 1-2문장."
}

Output JSON only. No preamble, no markdown fences.
