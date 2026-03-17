# 배포 및 도메인 설정 (www.the-etched-mutation)

## 데모가 루트(/)에 뜨도록 하기

이 프로젝트는 이미 **Vercel** 설정(`vercel.json`)으로 다음처럼 동작합니다.

- **`/`** (루트) → `/demo`로 리다이렉트
- **`/demo`** → `demo2.html` 서빙

따라서 **www.the-etched-mutation** 도메인에서 데모 화면이 뜨게 하려면:

### 1. Vercel에 프로젝트 배포

1. [vercel.com](https://vercel.com)에 로그인 후 이 저장소를 연결해 배포한다.
2. 빌드 설정은 그대로 두면 된다. (`outputDirectory: "."`, 별도 빌드 명령 없음)

### 2. 커스텀 도메인 연결

1. Vercel 대시보드 → 해당 프로젝트 → **Settings** → **Domains**
2. **Add**로 `www.the-etched-mutation.com` (또는 사용할 도메인) 추가
3. 안내에 따라 도메인 등록처에서 **CNAME** 레코드 설정:
   - 이름: `www` (또는 서브도메인)
   - 값: `cname.vercel-dns.com`

### 3. 결과

- 사용자가 **https://www.the-etched-mutation.com** 에 접속하면
- 루트(`/`)가 `/demo`로 리다이렉트되고
- **demo2.html** (index 오프닝 → 3개 혼잣말 → index와 동일 플레이 → strata → 엔딩 → 메인으로 가기) 화면이 뜬다.

### 4. index 메인(아카이브/기타)으로 가기

데모 엔딩에서 **「메인으로 가기」** 버튼을 누르면 `index.html`로 이동한다.  
같은 도메인이라면 `https://www.the-etched-mutation.com/index.html` 로 열린다.
