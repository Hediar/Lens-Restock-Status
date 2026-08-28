"use client";

import { useCallback, useEffect, useState } from "react";
import { buildStockInsights } from "@/lib/stock-insights";
import { Product, StockCheck, supabase, timeAgo } from "@/lib/supabase";

function formatHours(value: number | null) {
  if (value === null) return "기록 대기";
  if (value < 24) return `${value.toFixed(1)}시간`;
  return `${(value / 24).toFixed(1)}일`;
}

export default function StatsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [checks, setChecks] = useState<StockCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: productData, error: productError }, { data: checkData, error: checkError }] =
      await Promise.all([
        supabase.from("products").select("*").eq("tracking", true).order("name"),
        supabase.from("stock_checks").select("*").order("changed_at", { ascending: false }),
      ]);

    if (productError || checkError) {
      setError(productError?.message ?? checkError?.message ?? "통계를 불러오지 못했어요.");
      return;
    }

    setError(null);
    setProducts((productData as Product[]) ?? []);
    setChecks((checkData as StockCheck[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const insights =
    products && checks
      ? buildStockInsights(
          products,
          checks.filter((check) => products.some((product) => product.id === check.product_id))
        )
      : null;
  const maxSelloutCount = Math.max(...(insights?.selloutRanking.map((item) => item.count) ?? [0]));
  const maxHeat = Math.max(
    ...(insights?.heatmap.flatMap((row) => row.cells.map((cell) => cell.count)) ?? [0])
  );

  return (
    <main>
      <div className="header">
        <h1>품절 통계</h1>
        <span className="checked-at">체크: {timeAgo(insights?.lastCheckedAt ?? null)}</span>
      </div>
      <p className="sub">최근 전환 이력으로 품절 패턴과 재입고 타이밍을 모아봤어요.</p>

      {error && <div className="empty">불러오기 실패: {error}</div>}
      {!error && (!products || !checks) && <div className="loading">통계를 계산하는 중…</div>}

      {!error && insights && (
        <div className="stats-stack">
          <section className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">추적 상품</span>
              <strong>{insights.trackedCount}개</strong>
              <p>현재 보고 있는 전체 후보예요.</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">현재 품절</span>
              <strong>{insights.currentlyOutCount}개</strong>
              <p>지금 바로 기다리는 상품 수예요.</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">평균 품절 기간</span>
              <strong>{formatHours(insights.averageSelloutHours)}</strong>
              <p>품절 후 다시 재고로 돌아온 기록만 평균냈어요.</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">최근 7일 재입고</span>
              <strong>{insights.weeklyRestocks}회</strong>
              <p>최근 일주일 안에 확인된 재입고 전환이에요.</p>
            </article>
          </section>

          {insights.longestOut && (
            <section className="panel">
              <div className="panel-head">
                <h2>가장 오래 품절 중</h2>
              </div>
              <p className="highlight-line">
                <strong>{insights.longestOut.name}</strong>
                <span>
                  {insights.longestOut.siteLabel} · {formatHours(insights.longestOut.hours)}
                </span>
              </p>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2>품절 잦은 순위</h2>
              <span>전환 횟수 기준</span>
            </div>
            {insights.selloutRanking.length === 0 ? (
              <div className="empty compact">아직 품절 전환 기록이 없어요.</div>
            ) : (
              <div className="ranking-list">
                {insights.selloutRanking.map((item) => (
                  <div className="ranking-row" key={item.productId}>
                    <div className="ranking-copy">
                      <strong>{item.name}</strong>
                      <span>
                        {item.siteLabel} · {item.inStock === false ? "현재 품절" : "현재 확인 가능"}
                      </span>
                    </div>
                    <div className="ranking-bar">
                      <div
                        className="ranking-fill"
                        style={{
                          width: `${maxSelloutCount === 0 ? 0 : (item.count / maxSelloutCount) * 100}%`,
                        }}
                      />
                    </div>
                    <strong className="ranking-count">{item.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>재입고 요일/시간대</h2>
              <span>최근 7일 기준</span>
            </div>
            <div className="heatmap-wrap">
              <div className="heatmap-axis">
                <span />
                {insights.heatmap[0]?.cells.map((cell) => (
                  <span key={cell.bucketLabel}>{cell.bucketLabel}</span>
                ))}
              </div>
              {insights.heatmap.map((row) => (
                <div className="heatmap-row" key={row.dayLabel}>
                  <span className="heatmap-day">{row.dayLabel}</span>
                  {row.cells.map((cell) => (
                    <div
                      key={`${row.dayLabel}-${cell.bucketLabel}`}
                      className="heatmap-cell"
                      style={{
                        opacity:
                          cell.count === 0 || maxHeat === 0 ? 0.15 : 0.25 + cell.count / maxHeat,
                      }}
                      title={`${row.dayLabel} ${cell.bucketLabel} · ${cell.count}회`}
                    >
                      {cell.count > 0 ? cell.count : ""}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>최근 재입고</h2>
            </div>
            {insights.recentRestocks.length === 0 ? (
              <div className="empty compact">아직 재입고 기록이 없어요.</div>
            ) : (
              <div className="event-list">
                {insights.recentRestocks.map((event) => (
                  <div className="event-row" key={event.id}>
                    <div>
                      <strong>{event.name}</strong>
                      <span>{event.siteLabel}</span>
                    </div>
                    <time>{new Date(event.changedAt).toLocaleString("ko-KR")}</time>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
