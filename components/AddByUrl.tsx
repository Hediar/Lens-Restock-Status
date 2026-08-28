"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Thumb from "@/components/Thumb";

interface Preview {
  url: string;
  name: string;
  image: string | null;
  inStock: boolean | null;
  judgedBy: string | null;
  knownNote: string | null;
}

export default function AddByUrl({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/track-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `오류 (${res.status})`);
      setPreview(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!preview) return;
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from("products")
        .select("id, tracking")
        .eq("url", preview.url)
        .maybeSingle();
      if (existing) {
        if (!existing.tracking) {
          await supabase.from("products").update({ tracking: true }).eq("id", existing.id);
        } else {
          setError("이미 추적 중인 상품이에요.");
          setBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.from("products").insert({
          site: "other",
          name: preview.name,
          url: preview.url,
          image_url: preview.image,
          in_stock: preview.inStock,
          last_checked_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      }
      setOpen(false);
      setUrl("");
      setPreview(null);
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="addurl addurl-btn" onClick={() => setOpen(true)}>
        + URL로 상품 추가
      </button>
    );
  }

  return (
    <div className="addurl-panel">
      <div className="askrow">
        <input
          className="ask"
          placeholder="상품 페이지 URL 붙여넣기"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadPreview()}
        />
        <button className="btn primary" disabled={busy} onClick={loadPreview}>
          {busy ? "…" : "확인"}
        </button>
      </div>
      {error && <p className="addurl-error">{error}</p>}
      {preview && (
        <div className="pcard">
          <div className="row">
            <Thumb src={preview.image} alt={preview.name} />
            <div className="pinfo">
              <div className="pname">{preview.name}</div>
              <div className="psite">{preview.knownNote ?? new URL(preview.url).hostname}</div>
            </div>
            <span
              className={`status ${
                preview.inStock === true ? "in" : preview.inStock === false ? "out" : "unknown"
              }`}
            >
              {preview.inStock === true ? "재고" : preview.inStock === false ? "품절" : "판정불가"}
            </span>
          </div>
          <p className="reason">
            현재 판정이 실제 페이지와 맞는지 확인한 뒤 등록해 주세요.
            {preview.judgedBy === "keyword" && " (키워드 기반 판정이라 정확도가 낮을 수 있어요)"}
          </p>
          <div className="actions" style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={busy} onClick={register}>
              등록하고 추적 시작
            </button>
            <button className="btn" onClick={() => setPreview(null)}>
              취소
            </button>
          </div>
        </div>
      )}
      <button className="remove-link" style={{ marginTop: 6 }} onClick={() => { setOpen(false); setError(null); setPreview(null); }}>
        닫기
      </button>
    </div>
  );
}
