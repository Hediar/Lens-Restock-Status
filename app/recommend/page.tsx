"use client";

import { useRef, useState } from "react";
import { SITE_LABEL, Site, supabase } from "@/lib/supabase";
import Thumb from "@/components/Thumb";

interface RecItem {
  product_id: string;
  name: string;
  site: Site;
  url: string;
  buy_url: string | null;
  image_url: string | null;
  in_stock: boolean | null;
  reason: string;
}
interface RecResult {
  message: string;
  features: {
    iris_color?: string;
    skin_tone?: string;
    mood?: string;
    recommend_tones?: string[];
  } | null;
  items: RecItem[];
}

export default function RecommendPage() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ b64: string; mime: string; preview: string } | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<RecResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  function pickImage(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setImage({ b64: url.split(",")[1], mime: f.type || "image/jpeg", preview: url });
    };
    reader.readAsDataURL(f);
  }

  async function submit(preset?: string) {
    const query = (preset ?? text).trim();
    if (preset) setText(preset);
    if (!query && !image) return;
    setError(null);
    setResult(null);
    setStage(image ? "사진 분석 중…" : "상품 검색 중…");
    const t = setTimeout(() => setStage("어울리는 렌즈 찾는 중…"), 4000);
    const t2 = setTimeout(() => setStage("추천 정리 중…"), 9000);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: query || undefined,
          imageBase64: image?.b64,
          imageMime: image?.mime,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `오류 (${res.status})`);
      setResult(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearTimeout(t);
      clearTimeout(t2);
      setStage(null);
    }
  }

  async function star(item: RecItem) {
    setStarredIds((s) => new Set(s).add(item.product_id));
    await supabase.from("products").update({ starred: true }).eq("id", item.product_id);
  }

  return (
    <main>
      <div className="header">
        <h1>렌즈 추천</h1>
      </div>
      <p className="sub">사진이나 취향을 알려주면 등록된 상품 중에서 골라드려요.</p>

      <div
        className="photo-zone"
        onClick={() => fileRef.current?.click()}
        style={image ? { padding: 8 } : undefined}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.preview} alt="업로드한 사진" style={{ maxHeight: 160, borderRadius: 10 }} />
        ) : (
          <>
            <div style={{ fontSize: "1.5rem" }}>📷</div>
            <b>눈이 잘 보이는 셀카를 올려주세요</b>
            <small>정면 · 밝은 곳에서 찍은 사진이면 충분해요 (눈 클로즈업도 OK)</small>
            <small>렌즈를 빼거나 평소 모습이면 더 정확해요 · 서버에 저장되지 않아요</small>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])}
        />
      </div>
      {image && (
        <button className="btn" style={{ marginBottom: 10 }} onClick={() => setImage(null)}>
          사진 지우기
        </button>
      )}

      <p className="or-line">사진이 없어도 괜찮아요 — 원하는 느낌을 고르거나 적어주세요</p>
      <div className="presets">
        {[
          "차분한 데일리 브라운",
          "맑고 시원한 그레이",
          "자연스러운 애쉬 계열",
          "화사한 포인트 컬러",
          "처음이라 뭐가 좋을지 모르겠어요",
        ].map((p) => (
          <button
            key={p}
            className="chip"
            disabled={stage !== null}
            onClick={() => submit(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="askrow">
        <input
          className="ask"
          placeholder="직접 입력: 예) 촉촉해 보이는 초코 브라운"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn primary" onClick={() => submit()} disabled={stage !== null}>
          {stage ? "…" : "추천"}
        </button>
      </div>

      {stage && <div className="loading">{stage}</div>}
      {error && <div className="empty">{error}</div>}

      {result && (
        <>
          {result.features && (
            <div className="feat">
              {result.features.iris_color && <span className="chip">홍채 {result.features.iris_color}</span>}
              {result.features.skin_tone && <span className="chip">{result.features.skin_tone}</span>}
              {result.features.mood && <span className="chip">{result.features.mood}</span>}
              {result.features.recommend_tones?.map((tone) => (
                <span className="chip active" key={tone}>
                  {tone}
                </span>
              ))}
            </div>
          )}
          <p className="recmsg">{result.message}</p>
          {result.items.map((it) => (
            <div className="pcard" key={it.product_id}>
              <div className="row">
                <Thumb src={it.image_url} alt={it.name} />
                <div className="pinfo">
                  <div className="pname">{it.name}</div>
                  <div className="psite">{SITE_LABEL[it.site]}</div>
                </div>
                <span
                  className={`status ${
                    it.in_stock === true ? "in" : it.in_stock === false ? "out" : "unknown"
                  }`}
                >
                  {it.in_stock === true ? "재고" : it.in_stock === false ? "품절" : "재고정보 없음"}
                </span>
              </div>
              <p className="reason">{it.reason}</p>
              <div className="actions" style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <a className="btn" href={it.buy_url ?? it.url} target="_blank" rel="noreferrer">
                  상품 보기
                </a>
                {it.in_stock === false && (
                  <button
                    className="btn"
                    disabled={starredIds.has(it.product_id)}
                    onClick={() => star(it)}
                  >
                    {starredIds.has(it.product_id) ? "⭐ 알림 등록됨" : "⭐ 재입고 알림"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
