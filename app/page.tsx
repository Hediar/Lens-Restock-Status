"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Product,
  StockCheck,
  SITE_LABEL,
  supabase,
  timeAgo,
} from "@/lib/supabase";

type Filter = "all" | "starred" | "out" | "lenssis" | "lenbling";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "starred", label: "⭐ 관심" },
  { key: "out", label: "품절만" },
  { key: "lenssis", label: "렌시스" },
  { key: "lenbling", label: "렌블링" },
];

export default function Home() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, StockCheck[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("tracking", true)
      .order("starred", { ascending: false })
      .order("name");
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setProducts(data as Product[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStar(p: Product) {
    // 낙관적 갱신
    setProducts((prev) =>
      prev?.map((x) => (x.id === p.id ? { ...x, starred: !x.starred } : x)) ?? null
    );
    const { error } = await supabase
      .from("products")
      .update({ starred: !p.starred })
      .eq("id", p.id);
    if (error) load();
  }

  async function removeProduct(p: Product) {
    if (!confirm(`'${p.name}'을(를) 목록에서 제거할까요?\n(추적이 중단되며, 크론이 다시 추가하지 않아요)`)) return;
    setProducts((prev) => prev?.filter((x) => x.id !== p.id) ?? null);
    const { error } = await supabase
      .from("products")
      .update({ tracking: false })
      .eq("id", p.id);
    if (error) load();
  }

  async function toggleDetail(p: Product) {
    if (openId === p.id) {
      setOpenId(null);
      return;
    }
    setOpenId(p.id);
    if (!history[p.id]) {
      const { data } = await supabase
        .from("stock_checks")
        .select("*")
        .eq("product_id", p.id)
        .order("changed_at", { ascending: false })
        .limit(8);
      setHistory((h) => ({ ...h, [p.id]: (data as StockCheck[]) ?? [] }));
    }
  }

  const lastChecked = products
    ?.map((p) => p.last_checked_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  const shown = (products ?? []).filter((p) => {
    if (filter === "starred") return p.starred;
    if (filter === "out") return p.in_stock === false;
    if (filter === "lenssis" || filter === "lenbling") return p.site === filter;
    return true;
  });

  return (
    <main>
      <div className="header">
        <h1>렌즈 현황</h1>
        <span className="checked-at">체크: {timeAgo(lastChecked)}</span>
      </div>
      <p className="sub">⭐ 누르면 재입고 시 알림을 받아요.</p>

      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="empty">불러오기 실패: {error}</div>}
      {!error && products === null && <div className="loading">불러오는 중…</div>}
      {!error && products !== null && shown.length === 0 && (
        <div className="empty">
          {filter === "all"
            ? "추적 중인 상품이 없어요. 크론이 곧 상품을 수집합니다."
            : "조건에 맞는 상품이 없어요."}
        </div>
      )}

      {shown.map((p) => (
        <div className="pcard" key={p.id}>
          <div className="row" onClick={() => toggleDetail(p)} style={{ cursor: "pointer" }}>
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="thumb" src={p.image_url} alt="" />
            ) : (
              <div className="thumb" />
            )}
            <div className="pinfo">
              <div className="pname">{p.name}</div>
              <div className="psite">{SITE_LABEL[p.site]}</div>
            </div>
            <span
              className={`status ${
                p.in_stock === true ? "in" : p.in_stock === false ? "out" : "unknown"
              }`}
            >
              {p.in_stock === true ? "재고" : p.in_stock === false ? "품절" : "확인 전"}
            </span>
            <button
              className={`starbtn ${p.starred ? "on" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleStar(p);
              }}
              aria-label="관심 등록"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={p.starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5z" />
              </svg>
            </button>
          </div>

          {openId === p.id && (
            <div className="detail">
              {(history[p.id] ?? []).length > 0 ? (
                history[p.id].map((h) => (
                  <div className="hrow" key={h.id}>
                    <span>{new Date(h.changed_at).toLocaleString("ko-KR")}</span>
                    <span>{h.in_stock ? "재입고 ✅" : "품절 ❌"}</span>
                  </div>
                ))
              ) : (
                <div className="hrow">아직 전환 이력이 없어요.</div>
              )}
              <div className="actions">
                <a className="btn" href={p.buy_url ?? p.url} target="_blank" rel="noreferrer">
                  상품 페이지 열기
                </a>
                <button className="btn danger-text" onClick={() => removeProduct(p)}>
                  목록에서 제거
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {products !== null && (
        <div className="addurl">+ URL로 상품 추가 (준비 중)</div>
      )}
    </main>
  );
}
