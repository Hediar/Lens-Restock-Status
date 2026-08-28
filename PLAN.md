# Lens Restock Status — 기획 (v4)

렌즈 쇼핑몰의 품절/재입고를 주기적으로 확인해 관심 상품 재입고 순간 웹 푸시로
알림받고, 사진 기반 멀티모달 RAG로 나에게 맞는 렌즈를 추천받는 개인용 서비스.

## 확정 요구사항

| 항목 | 결정 |
|---|---|
| 추적 대상 ① | **렌시스** (lenssis.site) — **원데이 상품만** |
| 추적 대상 ② | **렌블링** (lenbling.com) — **원데이 퓨어블만** (사이즈 변형 포함) |
| 추천 전용 코퍼스 | **렌즈라라** — 재입고 추적/알림 없이 RAG 추천 대상에만 포함 |
| 도수 필터 | 무도수(0.00)만 |
| 알림 정책 | **⭐ 관심 등록한 상품의 재입고 전환만 푸시** (신상품 알림 없음) |
| 알림 채널 | 웹 푸시 (PWA) |
| 사용 환경 | **폰 중심** — 모바일 우선 레이아웃 + PWA 홈화면 설치 |
| 크론 실행처 | GitHub Actions (**15분 간격** 단일 레인, 무료 티어 지연 감안) |
| LLM | **OpenAI 단일** — 임베딩(text-embedding-3-small) + 비전 + 생성 |
| 내 재고 관리 | **제거** — 품절 추적 + RAG 추천에 집중 |
| 사용 대상 | 본인용 (로그인 없음) |
| 비용 제약 | Supabase 무료 티어 유지 (과금 0) |
| DB / 배포 | Supabase / Vercel (`edu-ai-agent`, main push 자동 배포) ✅ |

## 무료 티어 유지 설계 원칙

1. **stock_checks는 상태 전환 시에만 기록** — 상시 상태는
   `products.in_stock` + `last_checked_at` 갱신. 통계는 전환 이력으로 계산.
2. **임베딩은 OpenAI text-embedding-3-small (1536차원)** — $0.02/1M 토큰,
   pgvector 확장은 무료.
3. **사진은 저장하지 않음** — Storage 미사용. 업로드 → 분석 → 즉시 폐기.
4. LLM 비용은 OpenAI 단일 창구, 호출당 소액.

## 운영 안정성 기본값

- GitHub Actions 크론은 지연이 흔함(15분 설정 → 실제 18~25분) → 전제하고 설계
- `concurrency` 그룹으로 실행 겹침 방지 (이전 스윕 미완료 시 대기)
- 렌시스 상품 수가 예상보다 많으면(500+ 수준) 전체 스윕 간격 재검토
- 사이트 fetch 실패/타임아웃 시: **상태를 바꾸지 않고 스킵** (오탐 알림 방지)
- 대시보드에 사이트별 **마지막 체크 시각** 표시 → 크론 정지 감지
- 크롤링 예절: 사이트당 순차 요청 + 1~2초 지연, UA 명시, robots.txt 존중

## 사이트 조사 결과 (2026-08-28 확인)

### 렌블링 — lenbling.com (Cafe24)
- 상품 페이지 JSON-LD에 도수 옵션별 `availability: InStock/OutOfStock` 포함
  → `(근시 0.00)` 옵션만 판정
- 퓨어블 기본 사이즈: `/product/search.html?keyword=퓨어블` 에서
  `/product/퓨어블-{색상}/{번호}/` 패턴만 수집 (빅/메가/라지/스몰/원데이/
  난시용/주문제작 접두 제외)

### 렌시스 — lenssis.site (WordPress + WooCommerce)
- Store API 차단 → 사이트맵(wp-sitemap)에서 전 상품 URL 수집,
  상품 페이지 JSON-LD `availability` / 품절 마커로 판정
- 사이트맵 diff로 신상품 자동 등록 (알림은 없음, 추적만 추가)

## 화면 구성 (모바일 1열, 하단 탭 3개)

**공통**: 하단 탭바(현황/추천/통계), 헤더에 마지막 체크 시각,
첫 방문 시 알림 권한 배너. 상태색: 재고=초록 / 품절=빨강.

1. **현황(홈)** — 필터 칩(전체·⭐관심·품절만·사이트별) + 상품 카드
   리스트(썸네일·이름·사이트·상태 뱃지·⭐토글). 카드 탭 → 상세 시트
   (전환 이력, 구매처). 하단에 URL로 상품 추가(7단계).
2. **추천** — 사진 업로드 존("저장되지 않아요" 표기) + 텍스트 입력.
   분석 결과 칩(홍채색·톤·어울리는 계열) → 추천 카드 3~5개(이유·재고
   뱃지·구매처, 품절 시 ⭐등록 버튼). 로딩 3단계 표시(분석→검색→작성).
3. **통계** — 품절 랭킹 가로 막대, 지표 타일(평균 품절 기간·주간 재입고),
   재입고 요일/시간대 히트맵.

## 아키텍처

```
GitHub Actions (schedule: */15, concurrency 가드)
  └─ scripts/check-stock.mjs
       ├─ 파서: lenbling(JSON-LD offers) / lenssis(사이트맵+상품페이지)
       ├─ 상품 설명 텍스트(색상/스펙 설명)도 함께 수집 → RAG 코퍼스
       ├─ products.in_stock 갱신, 전환 시에만 stock_checks 기록
       ├─ 신상품 → OpenAI 임베딩 → product_embeddings 색인
       └─ ⭐starred 상품이 품절→재고 전환 시 web-push 발송 (VAPID)

Next.js (Vercel: edu-ai-agent.vercel.app) — 모바일 우선 + PWA
  ├─ 현황: 사이트별 상품 목록, 품절중 필터, ⭐ 관심 토글, 마지막 체크 시각
  ├─ 통계: 품절 빈도 랭킹, 품절 지속시간, 재입고 시간대 패턴
  ├─ 추천 챗: 사진/텍스트 질의 → RAG → 근거 기반 추천
  └─ 알림 구독: Service Worker + Push (public/sw.js) + manifest(홈화면 설치)

RAG 파이프라인 (멀티모달)
  ① 사진 업로드(미저장) ─ OpenAI 비전 + structured output
  ② 특징 JSON {홍채색, 피부톤, 어울리는 계열, 피할 계열}
  ③ 특징→검색문장→OpenAI 임베딩→pgvector 유사도 검색
     + SQL 필터: 무도수 옵션 존재, 추적 상품은 in_stock=true 우선
     (렌즈라라 등 추천 전용 상품은 재고 정보 없이 추천 가능)
  ④ OpenAI가 검색 결과만 근거로 추천 생성 (+품절 상품은 ⭐ 등록 제안)
  ※ 텍스트 질의는 ①②를 건너뛰고 동일 파이프라인 (단발 질의, 대화 기억 없음)
```

## DB 스키마

```sql
products           -- 상품 (추적 + 추천 전용 모두)
  id, site ('lenssis'|'lenbling'|'lenslala'), name, url, image_url,
  color_desc text,                -- RAG 코퍼스용 색상/스펙 설명
  in_stock boolean,               -- 추천 전용(lenslala)은 null 허용
  starred boolean default false,
  last_checked_at,
  tracking boolean default true,  -- false = 추천 전용(크론 체크 제외)
  created_at

stock_checks       -- 전환 이력만
  id, product_id, in_stock, changed_at

product_embeddings -- RAG 색인
  product_id, content text, embedding vector(1536)

push_subscriptions
  id, endpoint, p256dh, auth, created_at

-- 기존 lenses/restock_logs는 2단계에서 drop (내 재고 관리 제거)
```

## 단계별 계획

- [x] **1. 기본 앱** — Next.js + Supabase, GitHub push, Vercel 자동 배포
- [x] **2. 추적 모델 + 현황 대시보드** — 스키마 생성(기존 테이블 정리 포함),
      모바일 우선 현황 UI, ⭐ 관심 토글, 마지막 체크 시각
- [ ] **3. 크론 체커** — GitHub Actions, 렌블링/렌시스 파서, 상품 설명 수집,
      전환 기록, 사이트맵 자동 등록
- [ ] **4. 웹 푸시 + PWA** — VAPID(GitHub Secrets), Service Worker, manifest,
      ⭐ 상품 재입고 전환 시 발송
- [ ] **5. 통계** — 품절 빈도 랭킹, 지속시간, 재입고 시간대 패턴
- [ ] **6. RAG 렌즈 추천 챗봇** — pgvector+OpenAI 임베딩 색인, 사진 특징 추출
      (OpenAI 비전, structured output), hybrid retrieval(벡터+재고 필터),
      근거 기반 추천 UI. 사진 미저장.
      **렌즈라라 상품 1회성 크롤링(추천 전용, tracking=false)로 코퍼스 확장.**
- [ ] **7. 임의 URL 추적 등록** — 상품 링크 붙여넣기 → 도메인별 파서 자동
      선택(렌블링/렌시스는 기존 파서, 그 외 generic: JSON-LD availability →
      품절 키워드 스캔 폴백) → 현재 판정 미리보기로 확인 후 등록 →
      크론 체크·⭐ 알림에 자동 합류
- [ ] **(선택) 8. 제출물 정리** — README 아키텍처 다이어그램, 데모 시나리오

## 필요한 키/설정 (해당 단계에서)

- GitHub Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `OPENAI_API_KEY` (3~4단계)
- Vercel 환경변수: `OPENAI_API_KEY` (6단계, 서버 라우트 전용 —
  `NEXT_PUBLIC_` 접두사 금지)
- 로컬: `.env.local`
