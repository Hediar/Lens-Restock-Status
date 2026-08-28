"use client";

import { useState } from "react";
import {
  Lens,
  RestockLog,
  LENS_TYPE_LABEL,
  STATUS_LABEL,
  stockStatus,
  supabase,
} from "@/lib/supabase";

interface Props {
  lens: Lens;
  onChanged: () => void;
}

export default function LensCard({ lens, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [showRestock, setShowRestock] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [logs, setLogs] = useState<RestockLog[] | null>(null);
  const [restockQty, setRestockQty] = useState("30");
  const [restockPrice, setRestockPrice] = useState("");

  const status = stockStatus(lens);
  // 게이지: 최근 재입고 기준이 없으므로 임계값의 5배를 만충으로 가정
  const full = Math.max(lens.low_stock_threshold * 5, lens.stock_quantity, 1);
  const pct = Math.min(100, Math.round((lens.stock_quantity / full) * 100));

  async function use(count: number) {
    setBusy(true);
    const next = Math.max(0, lens.stock_quantity - count);
    await supabase.from("lenses").update({ stock_quantity: next }).eq("id", lens.id);
    setBusy(false);
    onChanged();
  }

  async function restock() {
    const qty = parseInt(restockQty, 10);
    if (!qty || qty <= 0) return;
    setBusy(true);
    const price = restockPrice ? parseInt(restockPrice, 10) : null;
    await supabase.from("restock_logs").insert({ lens_id: lens.id, quantity: qty, price });
    await supabase
      .from("lenses")
      .update({ stock_quantity: lens.stock_quantity + qty })
      .eq("id", lens.id);
    setBusy(false);
    setShowRestock(false);
    setLogs(null);
    onChanged();
  }

  async function remove() {
    if (!confirm(`'${lens.brand} ${lens.product_name}' 렌즈를 삭제할까요?`)) return;
    setBusy(true);
    await supabase.from("lenses").delete().eq("id", lens.id);
    setBusy(false);
    onChanged();
  }

  async function toggleHistory() {
    if (!showHistory && logs === null) {
      const { data } = await supabase
        .from("restock_logs")
        .select("*")
        .eq("lens_id", lens.id)
        .order("restocked_at", { ascending: false })
        .limit(10);
      setLogs((data as RestockLog[]) ?? []);
    }
    setShowHistory(!showHistory);
  }

  return (
    <div className="card">
      <div className="top">
        <div>
          <div className="brand">{lens.brand}</div>
          <div className="name">{lens.product_name}</div>
        </div>
        <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
      </div>

      <div className="specs">
        <span className="chip">{LENS_TYPE_LABEL[lens.lens_type]}</span>
        <span className="chip">SPH {lens.power === 0 ? "무도수" : lens.power.toFixed(2)}</span>
        {lens.base_curve != null && <span className="chip">BC {lens.base_curve}</span>}
        {lens.diameter != null && <span className="chip">DIA {lens.diameter}</span>}
      </div>

      <div className="stockline">
        <div className="qty">
          {lens.stock_quantity}
          <small> 개 남음</small>
        </div>
        <div className="actions">
          <button className="btn small" disabled={busy || lens.stock_quantity === 0} onClick={() => use(2)}>
            착용 −2
          </button>
          <button className="btn small" disabled={busy || lens.stock_quantity === 0} onClick={() => use(1)}>
            −1
          </button>
          <button className="btn small primary" disabled={busy} onClick={() => setShowRestock(true)}>
            재입고
          </button>
          {lens.purchase_url && (
            <a className="btn small" href={lens.purchase_url} target="_blank" rel="noreferrer">
              구매처
            </a>
          )}
          <button className="btn small danger-text" disabled={busy} onClick={remove}>
            삭제
          </button>
        </div>
      </div>

      <div className={`meter ${status}`}>
        <div style={{ width: `${pct}%` }} />
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="link-btn" onClick={toggleHistory}>
          {showHistory ? "재입고 이력 닫기" : "재입고 이력 보기"}
        </button>
      </div>
      {showHistory && (
        <div className="history">
          {logs && logs.length > 0 ? (
            logs.map((l) => (
              <div className="row" key={l.id}>
                <span>{new Date(l.restocked_at).toLocaleDateString("ko-KR")}</span>
                <span>
                  +{l.quantity}개{l.price ? ` · ${l.price.toLocaleString()}원` : ""}
                </span>
              </div>
            ))
          ) : (
            <div className="row">아직 재입고 이력이 없어요.</div>
          )}
        </div>
      )}

      {showRestock && (
        <div className="overlay" onClick={() => setShowRestock(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>재입고 — {lens.product_name}</h2>
            <div className="field-row">
              <div className="field">
                <label>수량 (개)</label>
                <input
                  type="number"
                  min={1}
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                />
              </div>
              <div className="field">
                <label>금액 (원, 선택)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="예: 25000"
                  value={restockPrice}
                  onChange={(e) => setRestockPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowRestock(false)}>취소</button>
              <button className="btn primary" disabled={busy} onClick={restock}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
