# Lens Restock Status — 기획 (v2)

렌즈 쇼핑몰의 품절/재입고를 주기적으로 확인하고, 재입고 순간 웹 푸시로
알림받는 개인용 서비스.

## 확정 요구사항

| 항목 | 결정 |
|---|---|
| 추적 대상 ① | **렌시스** (lenssis.site) — **전 상품** |
| 추적 대상 ② | **렌블링** (lenbling.com) — **퓨어블 기본 사이즈만** (빅/메가/라지/스몰/원데이/주문제작 제외) |
| 도수 필터 | **무도수(0.00)만** — 다른 도수 옵션은 판정에서 제외 |
| 알림 채널 | 웹 푸시 (PWA) |
| 크론 실행처 | GitHub Actions (20~30분 간격) |
| 사용 대상 | 본인용 (로그인 없음) |
| DB / 배포 | Supabase / Vercel (`edu-ai-agent` 프로젝트, main push 자동 배포) ✅ |

## 사이트 조사 결과 (2026-08-28 확인)

### 렌블링 — lenbling.com (Cafe24)
- 상품 페이지에 **JSON-LD(schema.org Product)가 임베드**되어 있고,
  **도수 옵션별로 `availability: InStock/OutOfStock`** 이 들어 있음
  → HTML 파싱 불필요, JSON-LD의 offers에서 `(근시 0.00)` 옵션만 찾아 판정
- 퓨어블 기본 사이즈 상품 목록은 검색 페이지
  (`/product/search.html?keyword=퓨어블`)에서 URL 패턴
  `/product/퓨어블-{색상}/{번호}/` 로 수집 — 이름이 정확히 `퓨어블 `로
  시작하는 것만 (빅/메가/라지/스몰/원데이/난시용/주문제작 접두 제외)
- 확인된 예: 퓨어블-애쉬브라운/41, 퓨어블-모카쵸코/211, 퓨어블-앰버브라운/240

### 렌시스 — lenssis.site (WordPress + WooCommerce)
- WooCommerce Store API(`/wp-json/wc/store/v1/products`)는 홈 HTML을
  반환(비활성/차단 추정) → **폴백 경로 사용**:
  1. `wp-sitemap.xml`(또는 product sitemap)에서 전 상품 URL 수집
  2. 각 상품 페이지의 JSON-LD `availability` 또는 body class
     `outofstock` / "품절" 마커로 판정
- 전 상품 추적이므로 **사이트맵 기반 자동 등록** (수동 URL 입력 불필요)
- 무도수 판정: 변형(variation) 옵션 구조는 구현 시 상품 페이지에서 재확인

### 공통 크롤링 예절
- 사이트당 순차 요청 + 요청 간 1~2초 지연, 20~30분 간격
- User-Agent 명시, robots.txt 존중

## 아키텍처

```
GitHub Actions (schedule: */30)
  └─ scripts/check-stock.mjs
       ├─ Supabase에서 추적 상품 로드 (렌시스는 사이트맵 diff로 신상품 자동 추가)
       ├─ parsers/lenbling.mjs  → JSON-LD offers에서 (근시 0.00) availability
       ├─ parsers/lenssis.mjs   → 상품 페이지 JSON-LD/품절 마커
       ├─ stock_checks 이력 저장 + products.in_stock 갱신
       └─ 품절→재고 전환 감지 시 web-push 발송 (VAPID)

Next.js (Vercel: edu-ai-agent.vercel.app)
  ├─ 대시보드: 사이트별 현황, 품절 중 목록, 최근 재입고
  ├─ 통계: 자주 품절되는 항목 랭킹, 품절 지속시간, 재입고 시간대 패턴
  ├─ 알림 구독: Service Worker + Push 구독 (public/sw.js)
  └─ (기존) 내 보유 렌즈 재고 관리 — 유지
```

## DB 스키마 (추가분)

```sql
products         -- 추적 상품
  id, site ('lenssis'|'lenbling'), name, url, image_url,
  in_stock boolean, last_checked_at, tracking boolean, created_at

stock_checks     -- 체크 이력 (통계의 원천)
  id, product_id, in_stock, checked_at

push_subscriptions
  id, endpoint, p256dh, auth, created_at
```

## 단계별 계획

- [x] **1. 기본 앱** — Next.js + Supabase, GitHub push, Vercel 자동 배포
- [ ] **2. 추적 모델 + 대시보드** — products/stock_checks 스키마,
      현황·품절중 목록 UI
- [ ] **3. 크론 체커** — GitHub Actions 워크플로, 렌블링/렌시스 파서,
      렌시스 사이트맵 자동 등록, 이력 적재
- [ ] **4. 웹 푸시** — VAPID 키(GitHub Secrets), Service Worker,
      재입고 전환 시 발송
- [ ] **5. 통계** — 품절 빈도 랭킹, 평균 품절 지속시간, 재입고 요일/시간대

## 남은 확인 사항

- 렌시스 사이트맵 위치와 상품 페이지의 무도수 옵션 구조 (3단계 구현 시)
- 렌블링 퓨어블 기본 사이즈 전체 색상 목록 (검색 페이지에서 자동 수집)
- GitHub Secrets 등록 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
