# Lens Restock Status — 기획

렌즈 쇼핑몰(렌블링·렌시스·렌즈라라 등)에서 자주 품절되는 상품을 추적하고,
재입고되면 웹 푸시로 알림받는 개인용 서비스.

## 확정 사항

| 항목 | 결정 |
|---|---|
| 사용 대상 | 본인용 (로그인 없음) |
| 알림 채널 | 웹 푸시 (PWA, Web Push API) |
| 크론 실행처 | GitHub Actions (15~30분 간격) |
| DB | Supabase (`Lens-Restock-Status` 프로젝트) |
| 배포 | Vercel (GitHub main 연동) |

## 아키텍처

```
GitHub Actions (schedule)
  └─ scripts/check-stock.ts
       ├─ products 테이블에서 추적 상품 로드
       ├─ 사이트별 파서로 상품 페이지 fetch → 품절 판정
       ├─ stock_checks 이력 저장, products.current 상태 갱신
       └─ 품절→재고 전환 감지 시 → push_subscriptions로 웹 푸시 발송

Next.js (Vercel)
  ├─ 대시보드: 상품별 현황, 품절 빈도/지속시간 통계
  ├─ 상품 등록: URL 붙여넣기 → 사이트 자동 인식
  └─ 알림 구독: Service Worker + Push 구독 등록
```

## DB 스키마 (2단계에서 추가)

- `products` — site, name, option(도수/색상), url, image_url, in_stock, last_checked_at
- `stock_checks` — product_id, in_stock, checked_at (이력 → 품절 빈도 통계의 원천)
- `push_subscriptions` — endpoint, keys (브라우저 푸시 구독 정보)

기존 `lenses`/`restock_logs`(보유 재고 관리)는 유지 — 추후 "이 상품 재입고되면
내 재고에 반영" 연결 고리로 활용 가능.

## 사이트별 파서

렌즈 쇼핑몰은 대부분 Cafe24/고도몰 기반 → 품절 마커("품절", "SOLD OUT",
재입고 알림 버튼 존재 여부)가 일정한 패턴. 어댑터 구조:

```
parsers/
  lensbling.ts   렌블링
  lensis.ts      렌시스
  lenslala.ts    렌즈라라
  generic.ts     폴백 (품절 키워드 스캔)
```

- 요청 간격·횟수는 점잖게 (사이트당 순차 요청 + 지연), robots.txt 존중.

## 단계별 계획

1. **[완료] 기본 앱** — Next.js + Supabase 재고 트래커, GitHub push
2. **추적 상품 모델 + 대시보드** — products/stock_checks 스키마, 상품 등록 UI, 현황 표시
3. **크론 체커** — GitHub Actions 워크플로 + 사이트별 파서, 이력 적재
4. **웹 푸시 알림** — Service Worker, VAPID 키, 재입고 전환 시 발송
5. **통계** — 자주 품절되는 항목 랭킹, 품절 지속시간, 재입고 패턴(요일/시간대)

## 미해결 / 확인 필요

- Vercel `lens-restock-status-r6` 프로젝트 ↔ GitHub 저장소 Git 연동
  (대시보드에서 수동 연결 필요 — push해도 배포 안 되는 상태)
- 추적할 실제 상품 URL 목록 (사용자 제공)
