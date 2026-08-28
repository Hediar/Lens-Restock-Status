# Lens Restock Status

관심 있는 컬러렌즈의 품절과 재입고를 확인하고, 사진 또는 텍스트 취향을 바탕으로 렌즈를 추천하는 개인용 모바일 웹 앱입니다.

## 주요 기능

- 렌시스 원데이와 렌블링 퓨어블 상품의 재고를 GitHub Actions에서 15분마다 확인합니다.
- 관심 등록한 상품이 품절에서 재고 있음으로 바뀌면 웹 푸시 알림을 보냅니다.
- 현황 화면에서 전체, 관심, 품절, 쇼핑몰별 상품을 필터링하고 상품별 상태 전환 이력을 확인합니다.
- 품절 빈도, 평균 품절 기간, 주간 재입고, 재입고 시간대 통계를 제공합니다.
- 사진 또는 텍스트로 원하는 무드를 입력하면 OpenAI 분석을 바탕으로 추천 후보를 보여 줍니다.
- 렌즈라라 원데이 상품은 추천 후보로만 보관하며 재고 추적과 푸시 알림에는 포함하지 않습니다.
- PWA 설치와 웹 푸시 알림을 지원하는 모바일 우선 UI입니다.

## 구성

```text
GitHub Actions (15분마다)
  -> scripts/check-stock.mjs
  -> 렌시스 · 렌블링 재고 확인
  -> Supabase products / stock_checks 갱신
  -> 관심 상품 재입고 시 Web Push 발송

Next.js (Vercel)
  -> 현황 · 통계 · 렌즈 추천 화면
  -> Supabase에서 상품과 전환 이력 조회
  -> /api/recommend에서 OpenAI 사진·텍스트 분석
```

## 기술 스택

- Next.js 15 / React 19 / TypeScript
- Supabase Postgres
- GitHub Actions
- Web Push + Service Worker + Web App Manifest
- OpenAI Responses API

## 로컬 실행

Node.js 22 이상과 npm이 필요합니다.

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

### 환경 변수

`.env.local`에 아래 값을 넣습니다. `OPENAI_API_KEY`가 없으면 추천 화면은 텍스트 키워드 중심 폴백으로 동작합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
OPENAI_API_KEY=sk-...
```

`OPENAI_API_KEY`는 서버 전용 값이므로 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. Vercel 배포 환경에도 같은 이름으로 설정합니다.

## GitHub Actions 설정

재고 확인 워크플로에는 아래 GitHub Secrets가 필요합니다.

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

`check-stock` 워크플로는 15분마다 실행되며, GitHub Actions의 **Run workflow**로 수동 실행도 가능합니다. 수집 실패 시 해당 상품의 재고 상태를 변경하지 않아 오탐 알림을 피합니다.

## 렌즈라라 추천 후보 적재

`import-lenslala` 워크플로는 수동 실행 전용입니다. `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY` Secrets를 사용해 렌즈라라 원데이 카탈로그를 가져오며, 이미 등록된 URL은 건너뜁니다.

1. 기본 브랜치에 워크플로 파일을 push합니다.
2. GitHub 저장소의 **Actions**에서 `import-lenslala`를 선택합니다.
3. **Run workflow**를 실행합니다.

적재된 상품은 `tracking=false`, `in_stock=null`으로 저장되어 정기 재고 확인과 푸시 알림 대상이 되지 않습니다.

## 데이터 모델

- `products`: 쇼핑몰별 상품, 현재 재고 상태, 관심 여부, 추천 전용 여부
- `stock_checks`: 재고 상태가 바뀐 시점만 저장하는 전환 이력
- `push_subscriptions`: 웹 푸시 구독 정보

## 다음 개선

추천 후보는 현재 상품명·설명·재고 상태를 기준으로 정렬한 뒤 OpenAI가 추천 문구를 작성합니다. 다음 단계에서 상품 임베딩과 Supabase pgvector 검색을 연결해 의미 기반 RAG 검색으로 확장할 예정입니다.
