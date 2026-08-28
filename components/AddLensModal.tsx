"use client";

import { useState } from "react";
import { supabase, LensType, LENS_TYPE_LABEL } from "@/lib/supabase";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddLensModal({ onClose, onAdded }: Props) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    brand: "",
    product_name: "",
    lens_type: "daily" as LensType,
    power: "0",
    base_curve: "",
    diameter: "",
    stock_quantity: "30",
    low_stock_threshold: "6",
    purchase_url: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.brand.trim() || !form.product_name.trim()) {
      alert("브랜드와 제품명을 입력해 주세요.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("lenses").insert({
      brand: form.brand.trim(),
      product_name: form.product_name.trim(),
      lens_type: form.lens_type,
      power: parseFloat(form.power) || 0,
      base_curve: form.base_curve ? parseFloat(form.base_curve) : null,
      diameter: form.diameter ? parseFloat(form.diameter) : null,
      stock_quantity: parseInt(form.stock_quantity, 10) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 6,
      purchase_url: form.purchase_url.trim() || null,
    });
    setBusy(false);
    if (error) {
      alert(`저장 실패: ${error.message}`);
      return;
    }
    onAdded();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>렌즈 추가</h2>
        <div className="field">
          <label>브랜드 *</label>
          <input placeholder="예: 아큐브" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
        </div>
        <div className="field">
          <label>제품명 *</label>
          <input placeholder="예: 오아시스 원데이" value={form.product_name} onChange={(e) => set("product_name", e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>종류</label>
            <select value={form.lens_type} onChange={(e) => set("lens_type", e.target.value)}>
              {(Object.keys(LENS_TYPE_LABEL) as LensType[]).map((t) => (
                <option key={t} value={t}>{LENS_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>도수 (SPH, 0 = 무도수)</label>
            <input type="number" step="0.25" value={form.power} onChange={(e) => set("power", e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>BC (선택)</label>
            <input type="number" step="0.1" placeholder="8.5" value={form.base_curve} onChange={(e) => set("base_curve", e.target.value)} />
          </div>
          <div className="field">
            <label>DIA (선택)</label>
            <input type="number" step="0.1" placeholder="14.2" value={form.diameter} onChange={(e) => set("diameter", e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>현재 수량 (개)</label>
            <input type="number" min={0} value={form.stock_quantity} onChange={(e) => set("stock_quantity", e.target.value)} />
          </div>
          <div className="field">
            <label>임박 기준 수량</label>
            <input type="number" min={0} value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>구매처 URL (선택)</label>
          <input placeholder="https://..." value={form.purchase_url} onChange={(e) => set("purchase_url", e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={busy} onClick={submit}>추가</button>
        </div>
      </div>
    </div>
  );
}
