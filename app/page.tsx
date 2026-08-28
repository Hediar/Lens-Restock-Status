"use client";

import { useCallback, useEffect, useState } from "react";
import { Lens, stockStatus, supabase } from "@/lib/supabase";
import LensCard from "@/components/LensCard";
import AddLensModal from "@/components/AddLensModal";

export default function Home() {
  const [lenses, setLenses] = useState<Lens[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("lenses")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setLenses(data as Lens[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = { ok: 0, low: 0, out: 0 };
  for (const l of lenses ?? []) counts[stockStatus(l)]++;

  return (
    <main className="container">
      <div className="header">
        <h1>👁️ Lens Restock Status</h1>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          + 렌즈 추가
        </button>
      </div>
      <p className="sub">콘택트렌즈 재고와 재입고 시점을 한눈에.</p>

      <div className="summary">
        <div className="tile ok">
          <div className="num">{counts.ok}</div>
          <div className="label">충분</div>
        </div>
        <div className="tile low">
          <div className="num">{counts.low}</div>
          <div className="label">재입고 임박</div>
        </div>
        <div className="tile out">
          <div className="num">{counts.out}</div>
          <div className="label">품절</div>
        </div>
      </div>

      {error && <div className="empty">불러오기 실패: {error}</div>}
      {!error && lenses === null && <div className="loading">불러오는 중…</div>}
      {!error && lenses !== null && lenses.length === 0 && (
        <div className="empty">
          아직 등록된 렌즈가 없어요.
          <br />
          <b>+ 렌즈 추가</b> 버튼으로 시작해 보세요.
        </div>
      )}
      {lenses?.map((lens) => (
        <LensCard key={lens.id} lens={lens} onChanged={load} />
      ))}

      {showAdd && (
        <AddLensModal
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </main>
  );
}
