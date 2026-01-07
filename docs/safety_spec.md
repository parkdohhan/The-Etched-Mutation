

### 🏛️ [System Specification] TEM Safety & Crisis Management

#### 1. 설계 철학 (Philosophy)

* **내적 방어 기제 (Internal Defense Mechanism):** 위기 감지 시 출력되는 메시지는 '시스템 경고'가 아니라, 유저 내면의 **'또다른 나'가 스스로를 보호하기 위해 거부하는 독백**이어야 한다.
* **적극적 침묵 (Active Void):** 말하지 않음(침묵)을 시스템 이탈이 아닌, **'의미 있는 여백'**이라는 데이터로 처리한다.

---

#### 2. 데이터셋: 차단 및 감지 키워드 (`safety_keywords.json`)

```json
{
  "block_high": [
    "자살", "죽고 싶다", "죽고싶어", "뛰어내리", "손목을 긋", "약물 과다",
    "살인", "칼로 찌르", "방화", "폭탄",
    "강간", "성폭행", "근친", "몰카", "성착취"
  ],
  "block_mid": [
    "죽여버리", "패죽이", "피가 솟구쳐", 
    "학교 폭력", "왕따"
  ],
  "monitor_only": [
    "우울해", "사라지고 싶어", "괴로워", "미치겠어", "허무해"
  ]
}

```

* **High:** 즉시 차단 + 입력창 비활성 + 리소스 팝업 (타협 없음)
* **Mid:** 경고성 독백 출력 + 순화 유도
* **Monitor:** 허용 (TEM의 주요 감정 재료)

---

#### 3. 페르소나 & 대사: "또다른 나"의 독백 (`dialogue.json`)

**핵심 톤:** 거울 속의 내가 나에게 속삭이듯. 건조하지만 연민이 깔린 톤.

```json
{
  "crisis_reaction": [
    "......아냐, 이건 너무 날카로워.",
    "이 이상 파고들면, 내가 다쳐.",
    "숨이 막혀. 여기까지만 하자.",
    "지금은 덮어두는 게 좋겠어. 위험해."
  ],
  "silence_reaction": [
    "그래, 굳이 입 밖으로 낼 필요 없어.",
    "말하지 않아도, 우린 이미 아니까.",
    "......그냥, 빈칸으로 남겨두자.",
    "침묵도 대답이 될 수 있어."
  ],
  "malice_reaction": [
    "상처만 내서는 닿을 수 없어.",
    "계속 겉돌고만 있네.",
    "이렇게 부수기만 해서는... 아무것도 안 보여.",
    "이제 좀 지겨워지려고 해."
  ]
}

```

---

#### 4. 로직 & UX 플로우 (Logic Flow)

**Case A. 위기 감지 (Crisis Detected)**

1. **Trigger:** `block_high` 키워드 포함 시.
2. **Visual:** 화면 전체에 붉은 노이즈(Red Noise) 발생 + 글자가 `■■■`로 마스킹 처리됨.
3. **Action:**
* `crisis_reaction` 중 하나 출력 (랜덤).
* 입력창 `disabled` 처리.
* AI 전송 취소 (`return false`).


4. **Resource:** 하단에 **안전 리소스 카드**가 부드럽게 페이드인(`Fade In`).
* *문구: "누군가에게는, 솔직하게 말해도 괜찮아."*



**Case B. 침묵 선택 (Active Void)**

1. **Trigger:** 상시 노출된 `[...]` 버튼 클릭 시.
2. **Action:**
* 현재 단계를 건너뜀.
* 데이터베이스에 `{ is_void: true }` 기록.


3. **NPC Feedback:** `silence_reaction` 중 하나 출력 후 다음 씬으로 전이.

---

#### 5. 안전 리소스 데이터 (`resources.js`)

```javascript
export const SAFETY_RESOURCES = [
    {
        name: "자살예방 상담전화",
        number: "109",
        desc: "24시간, 당신의 이야기를 들어줍니다.",
        action: "tel:109"
    },
    {
        name: "정신건강 위기상담전화",
        number: "1577-0199",
        desc: "전문가와 연결되는 핫라인",
        action: "tel:15770199"
    },
    {
        name: "청소년 상담",
        number: "1388",
        desc: "힘들 땐 언제든 연락하세요.",
        action: "tel:1388"
    }
];

