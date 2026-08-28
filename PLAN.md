# Lens Restock Status — 기획 (v4)

렌즈 쇼핑몰의 품절/재입고를 주기적으로 확인해 관심 상품 재입고 순간 웹 푸시로
알림받고, 사진 기반 멀티모달 RAG로 나에게 맞는 렌즈를 추천받는 개인용 서비스.

## 확정 요구사항

| 항목 | 결정 |
|---|---|
| 추적 대상 ① | **렌시스** (lenssis.site) — 전 상품 |
| 추적 대상 ② | **렌블링** (lenbling.com) — 퓨어블 기본 사이즈만 |
| 도수 필터 | 무도수(0.00)만 |
| 알림 정책 | **⭐ 관심 등록한 상품의 재입고 전환만 푸시** (신상품 알림 없음) |
| 알림 채널 | 웹 푸시 (PWA) |
| 사용 환경 | **폰 중심** — 모바일 우선 레이아웃 + PWA 홈화면 설치 |
| 크론 실행처 | GitHub Actions (30분 간격, 무료 티어 지연 감안) |
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

- GitHub Actions 크론은 지연이 흔함(30분 설정 → 실제 40~50분) → 전제하고 설계
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

## 아키텍처

```
GitHub Actions (schedule: */30)
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
     + SQL 필터: in_stock=true, 무도수 옵션 존재
  ④ OpenAI가 검색 결과만 근거로 추천 생성 (+품절 상품은 ⭐ 등록 제안)
  ※ 텍스트 질의는 ①②를 건너뛰고 동일 파이프라인 (단발 질의, 대화 기억 없음)
```

## DB 스키마

```sql
products           -- 추적 상품
  id, site ('lenssis'|'lenbling'), name, url, image_url,
  color_desc text,                -- RAG 코퍼스용 색상/스펙 설명
  in_stock boolean, starred boolean default false,
  last_checked_at, tracking boolean default true, created_at

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
- [ ] **2. 추적 모델 + 현황 대시보드** — 스키마 생성(기존 테이블 정리 포함),
      모바일 우선 현황 UI, ⭐ 관심 토글, 마지막 체크 시각
- [ ] **3. 크론 체커** — GitHub Actions, 렌블링/렌시스 파서, 상품 설명 수집,
      전환 기록, 사이트맵 자동 등록
- [ ] **4. 웹 푸시 + PWA** — VAPID(GitHub Secrets), Service Worker, manifest,
      ⭐ 상품 재입고 전환 시 발송
- [ ] **5. 통계** — 품절 빈도 랭킹, 지속시간, 재입고 시간대 패턴
- [ ] **6. RAG 렌즈 추천 챗봇** — pgvector+OpenAI 임베딩 색인, 사진 특징 추출
      (OpenAI 비전, structured output), hybrid retrieval(벡터+재고 필터),
      근거 기반 추천 UI. 사진 미저장.
- [ ] **(선택) 7. 제출물 정리** — README 아키텍처 다이어그램, 데모 시나리오

## 필요한 키/설정 (해당 단계에서)

- GitHub Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `OPENAI_API_KEY` (3~4단계)
- Vercel 환경변수: `OPENAI_API_KEY` (6단계, 서버 라우트 전용 —
  `NEXT_PUBLIC_` 접두사 금지)
- 로컬: `.env.local`
