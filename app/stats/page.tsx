"use client";

import { useEffect, useState } from "react";
import { supabase, SITE_LABEL, Site } from "@/lib/supabase";

interface CheckRow { product_id: string; in_stock: boolean; changed_at: string; }
interface ProdRow { id: string; name: string; site: Site; plano_stock?: number | null; tracking?: boolean; }
interface LevelRow { product_id: string; stock: number; recorded_at: string; }

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const BUCKETS = ["0-4", "4-8", "8-12", "12-16", "16-20", "20-24"];

export default function StatsPage() {
  const [checks, setChecks] = useState<CheckRow[] | null>(null);
  const [prods, setProds] = useState<Map<string, ProdRow>>(new Map());
  const [levelRows, setLevelRows] = useState<LevelRow[]>([]);

  useEffect(() => {
    (async () => {
      const [c, p, lv] = await Promise.all([
        supabase.from("stock_checks").select("product_id,in_stock,changed_at").order("changed_at").limit(3000),
        supabase.from("products").select("id,name,site,plano_stock,tracking"),
        supabase.from("stock_levels").select("product_id,stock,recorded_at").order("recorded_at").limit(3000),
      ]);
      setProds(new Map(((p.data ?? []) as ProdRow[]).map((r) => [r.id, r])));
      setChecks((c.data as CheckRow[]) ?? []);
      setLevelRows((lv.data as LevelRow[]) ?? []);
    })();
  }, []);

  if (checks === null) return <main className="loading">불러오는 중…</main>;

  // 품절 빈도 랭킹 (품절 전환 횟수)
  const outCount = new Map<string, number>();
  for (const c of checks) if (!c.in_stock) outCount.set(c.product_id, (outCount.get(c.product_id) ?? 0) + 1);
  const ranking = [...outCount.entries()]
    .map(([id, n]) => ({ p: prods.get(id), n }))
    .filter((r) => r.p)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  const maxN = ranking[0]?.n ?? 1;

  // 평균 품절 지속시간 (품절→재입고 쌍)
  const lastOut = new Map<string, number>();
  const durations: number[] = [];
  let restockThisWeek = 0;
  const weekAgo = Date.now() - 7 * 86400_000;
  const heat = Array.from({ length: 7 }, () => Array(6).fill(0));
  for (const c of checks) {
    const t = new Date(c.changed_at).getTime();
    if (!c.in_stock) lastOut.set(c.product_id, t);
    else {
      const started = lastOut.get(c.product_id);
      if (started) { durations.push(t - started); lastOut.delete(c.product_id); }
      if (t >= weekAgo) restockThisWeek++;
      const d = new Date(c.changed_at);
      heat[d.getDay()][Math.floor(d.getHours() / 4)]++;
    }
  }
  const avgDays = durations.length
    ? (durations.reduce((a, b) => a + b, 0) / durations.length / 86400_000).toFixed(1)
    : null;
  const heatMax = Math.max(1, ...heat.flat());

  return (
    <main>
      <div className="header"><h1>품절 통계</h1></div>
      <p className="sub">품절↔재입고 전환 이력이 쌓일수록 정확해져요.</p>

      <div className="stat-tiles">
        <div className="tile"><div className="num">{avgDays ?? "—"}{avgDays && <small>일</small>}</div><div className="label">평균 품절 지속</div></div>
        <div className="tile"><div className="num">{restockThisWeek}<small>건</small></div><div className="label">최근 7일 재입고</div></div>
        <div className="tile"><div className="num">{checks.length}<small>건</small></div><div className="label">누적 전환 기록</div></div>
      </div>

      <h2 className="sec">자주 품절되는 상품</h2>
      {ranking.length === 0 ? (
        <div className="empty">아직 품절 전환 기록이 없어요.</div>
      ) : (
        <div className="rank">
          {ranking.map((r) => (
            <div className="rrow" key={r.p!.id}>
              <span className="rname">{r.p!.name}</span>
              <div className="rbar"><div style={{ width: `${(r.n / maxN) * 100}%` }} /></div>
              <span className="rn">{r.n}회</span>
            </div>
          ))}
        </div>
      )}

      <h2 className="sec">재입고 요일 · 시간대</h2>
      <div className="heat">
        <div className="hhead"><span /> {BUCKETS.map((b) => <span key={b}>{b}</span>)}</div>
        {heat.map((row, d) => (
          <div className="hrow2" key={d}>
            <span className="hday">{DAYS[d]}</span>
            {row.map((v, i) => (
              <span key={i} className="hcell" style={{ opacity: v ? 0.25 + 0.75 * (v / heatMax) : 1, background: v ? "var(--primary)" : "var(--border)" }} title={`${v}건`} />
            ))}
          </div>
        ))}
      </div>
      <p className="sub" style={{ marginTop: 8 }}>진한 칸일수록 재입고가 잦은 시간대예요.</p>

      <h2 className="sec">무도수 재고 수량 · 소진 추이 (렌시스)</h2>
      {(() => {
        const byProduct = new Map<string, LevelRow[]>();
        for (const r of levelRows) {
          const list = byProduct.get(r.product_id) ?? [];
          list.push(r);
          byProduct.set(r.product_id, list);
        }
        const rows = [...prods.values()]
          .filter((p) => p.site === "lenssis" && p.tracking !== false && p.plano_stock != null)
          .map((p) => {
            const hist = byProduct.get(p.id) ?? [];
            const weekAgoTs = Date.now() - 7 * 86400_000;
            const recent = hist.filter((h) => new Date(h.recorded_at).getTime() >= weekAgoTs);
            const delta = recent.length >= 2 ? recent[recent.length - 1].stock - recent[0].stock : null;
            return { p, delta };
          })
          .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
          .slice(0, 10);
        if (!rows.length) return <div className="empty">수량 이력이 쌓이는 중이에요 (크론이 변화를 감지하면 기록됩니다).</div>;
        return (
          <div className="rank">
            {rows.map(({ p, delta }) => (
              <div className="rrow" key={p.id}>
                <span className="rname">{p.name}</span>
                <span className="rn" style={{ width: "auto" }}>
                  {p.plano_stock!.toLocaleString()}개
                  {delta != null && delta !== 0 && (
                    <span style={{ color: delta < 0 ? "var(--out)" : "var(--ok)", marginLeft: 6 }}>
                      ({delta > 0 ? "+" : ""}{delta.toLocaleString()}/7일)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        );
      })()}
      <p className="sub" style={{ marginTop: 8 }}>소진이 빠른 순으로 상위 10개. 감소 추세면 상세에서 예상 품절일을 보여드려요.</p>
    </main>
  );
}
