# 2D Sidescroll Map Portfolio

**2D 횡스크롤 맵 내비게이션 포트폴리오** - 포트폴리오가 작품의 입구가 되는 경험

## 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

브라우저에서 `http://localhost:3000` 접속

---

## 핵심 기능

### 🎮 2D 사이드스크롤 맵
- **키보드 조작**: ← → 또는 A D 로 이동, Shift로 달리기
- **포탈 진입**: ↑ 또는 Enter로 포탈 진입
- **도움말**: ? 클릭 또는 ESC로 도움말 토글
- **모바일**: 화면 좌우 터치 영역으로 이동

### 🔄 루프 시스템
- 맵 끝에 도달하면 자연스럽게 처음으로 루프
- `loopCount`가 localStorage에 저장 (새로고침해도 유지)
- 루프 횟수에 따라 배경 노이즈/선이 미세하게 누적

### 📍 맵 노드 구성
1. **Wheelchair Node** - 버림/도망 프롤로그 오브젝트
2. **Corridor Stretch** - 걷는 시간이 존재하는 중간 구간
3. **Portal Cluster** - Interactive/Film/Writing/About 포탈
4. **Note Monolith** - 핵심 문구가 새겨진 오브젝트
5. **Return Node** - 휠체어를 다시 잡는 상징 오브젝트
6. **Loop Gate** - 루프 발생 지점

---

## 커스터마이즈 포인트

### 1. 노드 좌표/문구/순서
`src/data/mapConfig.ts` 파일에서 수정:

```typescript
export const MAP_NODES: MapNode[] = [
  {
    id: 'wheelchair',
    type: 'wheelchair',
    x: 200,           // 월드 X 좌표 (px)
    width: 120,
    label: 'abandoned',
  },
  // ...
];
```

### 2. 포탈 라우팅
동일 파일에서 `route` 속성 수정:

```typescript
{
  id: 'portal-interactive',
  type: 'portal',
  x: 1200,
  width: 100,
  label: 'Interactive',
  route: '/works?filter=interactive',  // 라우팅 경로
},
```

### 3. 루프 감지 위치/방식
`src/hooks/useGameLoop.ts`에서:

```typescript
// CUSTOMIZATION POINT: Loop Detection
if (playerX > WORLD_WIDTH - LOOP_THRESHOLD) {
  playerX = LOOP_THRESHOLD + 50;
  onLoopTrigger();
}
```

### 4. Scar 강도 파라미터
`src/data/mapConfig.ts`:

```typescript
export const SCAR_CONFIG = {
  BASE_NOISE: 0.02,        // 기본 노이즈 불투명도
  NOISE_PER_LOOP: 0.008,   // 루프당 추가 노이즈
  MAX_NOISE: 0.15,         // 최대 노이즈
  // ...
};
```

### 5. 이스터에그 메시지
`src/data/mapConfig.ts`:

```typescript
export const EASTER_EGGS: Record<number, string> = {
  3: 'you noticed.',
  7: 'still here?',
  12: 'the scar remembers.',
  // 루프 횟수: 표시할 메시지
};
```

### 6. 프로젝트 데이터
`src/data/projects.ts`:

```typescript
export const projects: Project[] = [
  {
    id: 'my-project',
    title: 'My Project',
    year: 2024,
    tags: ['interactive', 'narrative'],
    medium: 'web',  // 'web' | 'film' | 'writing' | 'engine'
    description: 'Description here',
    links: [
      { label: 'Live Demo', url: 'https://...' },
    ],
  },
];
```

---

## 폴더 구조

```
src/
├── app/
│   ├── page.tsx          # 홈 (2D 맵)
│   ├── layout.tsx        # 루트 레이아웃
│   ├── globals.css       # 전역 스타일
│   ├── works/page.tsx    # Works 페이지
│   ├── film/page.tsx     # Film 페이지
│   ├── writing/page.tsx  # Writing 페이지
│   └── about/page.tsx    # About 페이지
├── components/
│   ├── map/
│   │   ├── GameMap.tsx           # 메인 게임 컨테이너
│   │   ├── Player.tsx            # 플레이어 커서
│   │   ├── MapNodeComponent.tsx  # 노드 렌더링
│   │   ├── BackgroundLayers.tsx  # 배경/패럴랙스
│   │   ├── HUDOverlay.tsx        # UI 오버레이
│   │   ├── MobileControls.tsx    # 모바일 터치 컨트롤
│   │   └── LoopTransition.tsx    # 루프 트랜지션 이펙트
│   ├── works/
│   │   ├── ProjectCard.tsx       # 프로젝트 카드
│   │   ├── FilterBar.tsx         # 필터 바
│   │   └── ProjectModal.tsx      # 상세 모달
│   └── layout/
│       └── PageLayout.tsx        # 공통 페이지 레이아웃
├── hooks/
│   ├── useLoopCount.ts      # 루프 카운트 관리
│   ├── useKeyboardInput.ts  # 키보드 입력
│   ├── useTouchInput.ts     # 모바일 터치 입력
│   ├── useGameLoop.ts       # 게임 루프/카메라
│   └── useReducedMotion.ts  # 접근성
└── data/
    ├── mapConfig.ts    # 맵 설정/노드 데이터
    └── projects.ts     # 프로젝트 데이터
```

---

## 기술 스택

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **Framer Motion** - 애니메이션
- **Lucide React** - 아이콘

---

## 접근성

- `prefers-reduced-motion` 지원 (카메라 lerp/패럴랙스 최소화)
- 키보드 네비게이션 완전 지원
- 포커스 아웃라인 스타일링
- 모바일 터치 컨트롤

---

## Vercel 배포

환경변수 없이 바로 배포 가능:

```bash
# Vercel CLI로 배포
npx vercel
```

또는 GitHub 연결 후 자동 배포

---

## 라이선스

MIT
