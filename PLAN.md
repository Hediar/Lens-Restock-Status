# Lens Restock Status — 기획 (v3)

렌즈 쇼핑몰의 품절/재입고를 주기적으로 확인해 재입고 순간 웹 푸시로 알림받고,
사진 기반 RAG로 나에게 맞는 렌즈를 추천받는 개인용 서비스.

## 확정 요구사항

| 항목 | 결정 |
|---|---|
| 추적 대상 ① | **렌시스** (lenssis.site) — **전 상품** |
| 추적 대상 ② | **렌블링** (lenbling.com) — **퓨어블 기본 사이즈만** (빅/메가/라지/스몰/원데이/주문제작 제외) |
| 도수 필터 | **무도수(0.00)만** |
| 알림 채널 | 웹 푸시 (PWA) |
| 크론 실행처 | GitHub Actions (20~30분 간격) |
| RAG 기능 | **사진(또는 텍스트) 기반 렌즈 추천 챗봇** — 멀티모달 RAG |
| 사용 대상 | 본인용 (로그인 없음) |
| 비용 제약 | **Supabase 무료 티어 유지 (과금 0)** — 아래 설계 원칙 참고 |
| DB / 배포 | Supabase / Vercel (`edu-ai-agent`, main push 자동 배포) ✅ |

## 무료 티어 유지 설계 원칙

1. **stock_checks는 상태 전환 시에만 기록** — 매 체크마다 insert하면
   연 수백 MB 누적 → 품절↔재고 전환 때만 기록하고, 상시 상태는
   `products.in_stock` + `last_checked_at` 갱신으로 처리.
   (품절 빈도/지속시간 통계는 전환 이력만으로 계산 가능)
2. **임베딩은 Supabase Edge Function 내장 모델(gte-small, 384차원)** —
   무료, 외부 임베딩 API 불필요. pgvector 확장도 무료.
3. **사진은 저장하지 않음** — Storage 미사용. 업로드 → 분석 → 즉시 폐기.
4. LLM(비전 분석·답변 생성)은 Claude API 사용 — Supabase 외 비용이며
   호출당 소액 (사진 분석 1회 수십 원 수준).

## 사이트 조사 결과 (2026-08-28 확인)

### 렌블링 — lenbling.com (Cafe24)
- 상품 페이지 JSON-LD에 **도수 옵션별 `availability: InStock/OutOfStock`** 포함
  → offers에서 `(근시 0.00)` 옵션만 찾아 판정
- 퓨어블 기본 사이즈 목록: `/product/search.html?keyword=퓨어블` 에서
  `/product/퓨어블-{색상}/{번호}/` 패턴만 수집 (접두어 빅/메가/라지/스몰/
  원데이/난시용/주문제작 제외)

### 렌시스 — lenssis.site (WordPress + WooCommerce)
- Store API 차단됨 → 사이트맵(wp-sitemap)에서 전 상품 URL 수집 후
  상품 페이지의 JSON-LD `availability` / 품절 마커로 판정
- 사이트맵 diff로 신상품 자동 등록

### 공통 크롤링 예절
- 사이트당 순차 요청 + 1~2초 지연, 20~30분 간격, UA 명시, robots.txt 존중

## 아키텍처

```
GitHub Actions (schedule: */30)
  └─ scripts/check-stock.mjs
       ├─ 파서: lenbling(JSON-LD offers) / lenssis(사이트맵+상품페이지)
       ├─ products.in_stock 갱신, 전환 시에만 stock_checks 기록
       ├─ 신상품 발견 시 → 상품 설명 임베딩(Edge Function) → 색인
       └─ 품절→재고 전환 시 web-push 발송 (VAPID)

Next.js (Vercel: edu-ai-agent.vercel.app)
  ├─ 대시보드: 현황, 품절중 목록, 최근 재입고
  ├─ 통계: 품절 빈도 랭킹, 품절 지속시간, 재입고 시간대 패턴
  ├─ 알림 구독: Service Worker + Push (public/sw.js)
  ├─ RAG 추천 챗: 사진/텍스트 질의 → 검색 → 근거 기반 추천
  └─ (기존) 내 보유 렌즈 재고 관리

RAG 파이프라인 (멀티모달)
  ① 사진 업로드(미저장) ─ Claude Vision + structured output
  ② 특징 JSON {홍채색, 피부톤, 어울리는 계열, 피할 계열}
  ③ 특징→검색문장→gte-small 임베딩→pgvector 유사도 검색
     + SQL 필터: in_stock=true, 무도수 옵션 존재
  ④ Claude가 검색 결과만 근거로 추천 생성 (+품절 상품은 재입고 알림 제안)
  ※ 텍스트 질의는 ①②를 건너뛰고 같은 파이프라인
```

## DB 스키마 (추가분)

```sql
products          -- 추적 상품
  id, site, name, url, image_url, color_desc,
  in_stock boolean, last_checked_at, tracking boolean, created_at

stock_checks      -- 전환 이력만 (무료 티어 용량 보호)
  id, product_id, in_stock, changed_at

product_embeddings -- RAG 색인
  product_id, content text, embedding vector(384)

push_subscriptions
  id, endpoint, p256dh, auth, created_at
```

## 단계별 계획

- [x] **1. 기본 앱** — Next.js + Supabase, GitHub push, Vercel 자동 배포
- [ ] **2. 추적 모델 + 대시보드** — products/stock_checks 스키마, 현황 UI
- [ ] **3. 크론 체커** — GitHub Actions, 렌블링/렌시스 파서, 전환 기록,
      렌시스 사이트맵 자동 등록
- [ ] **4. 웹 푸시** — VAPID(GitHub Secrets), Service Worker, 전환 시 발송
- [ ] **5. 통계** — 품절 빈도 랭킹, 지속시간, 재입고 시간대 패턴
- [ ] **6. RAG 렌즈 추천 챗봇** — pgvector+gte-small 색인, 사진 특징 추출
      (Claude Vision, structured output), hybrid retrieval(벡터+재고 필터),
      근거 기반 추천 UI. 사진 미저장.

## 필요한 키/설정 (해당 단계에서)

- GitHub Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (3~4단계)
- Vercel 환경변수: `ANTHROPIC_API_KEY` (6단계, 서버 라우트에서만 사용)
