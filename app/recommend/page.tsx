"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { LensProfile } from "@/lib/recommendation";
import { Product, SITE_LABEL, supabase } from "@/lib/supabase";

interface RecommendationResult extends Product {
  reason: string;
  matchedTerms?: string[];
}

interface RecommendResponse {
  mode: "openai" | "fallback";
  note?: string;
  summary: string;
  analysis: LensProfile;
  recommendations: RecommendationResult[];
}

const LOADING_STEPS = ["사진/텍스트 분석 중", "어울리는 상품 찾는 중", "추천 정리 중"];

async function resizeImage(file: File) {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return src;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function chips(profile: LensProfile) {
  return [
    { label: "홍채", value: profile.irisColor },
    { label: "톤", value: profile.skinTone },
    { label: "무드", value: profile.mood },
    { label: "직경", value: profile.sizePreference },
  ].filter((item) => item.value && item.value !== "미분석");
}

export default function RecommendPage() {
  const [query, setQuery] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setInterval(() => {
      setLoadingIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setImageName(file.name);
    setImageDataUrl(await resizeImage(file));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() && !imageDataUrl) {
      setError("사진이나 텍스트 설명 중 하나는 입력해 주세요.");
      return;
    }

    setError(null);
    setResult(null);
    setIsLoading(true);
    setLoadingIndex(0);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, imageDataUrl }),
      });
      const payload = (await response.json()) as RecommendResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "추천을 불러오지 못했어요.");
      setResult(payload);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "추천을 준비하지 못했어요."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleStar(product: RecommendationResult) {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            recommendations: prev.recommendations.map((item) =>
              item.id === product.id ? { ...item, starred: !item.starred } : item
            ),
          }
        : null
    );

    const { error: updateError } = await supabase
      .from("products")
      .update({ starred: !product.starred })
      .eq("id", product.id);

    if (updateError) {
      setError(updateError.message);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              recommendations: prev.recommendations.map((item) =>
                item.id === product.id ? { ...item, starred: product.starred } : item
              ),
            }
          : null
      );
    }
  }

  return (
    <main>
      <div className="header">
        <h1>렌즈 추천</h1>
      </div>
      <p className="sub">사진은 저장하지 않고, 지금 DB에 있는 렌즈 후보 안에서만 골라드려요.</p>

      <form className="recommend-form" onSubmit={submit}>
        <label className="recommend-label" htmlFor="recommend-query">
          원하는 느낌
        </label>
        <textarea
          id="recommend-query"
          className="recommend-input"
          rows={4}
          placeholder="예: 봄웜이고 자연스러운 브라운 원데이 찾고 싶어요. 너무 튀는 건 싫어요."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="upload-card">
          <div>
            <strong>사진 업로드</strong>
            <p>셀카 한 장으로 톤과 무드를 참고해요. 저장되지는 않아요.</p>
          </div>
          <label className="btn primary upload-btn">
            사진 선택
            <input type="file" accept="image/*" hidden onChange={handleImageChange} />
          </label>
        </div>

        {imageName && (
          <div className="preview-card">
            {imageDataUrl && <img src={imageDataUrl} alt="업로드 미리보기" className="preview-image" />}
            <div className="preview-copy">
              <strong>{imageName}</strong>
              <button
                type="button"
                className="remove-link"
                onClick={() => {
                  setImageDataUrl(null);
                  setImageName(null);
                }}
              >
                사진 제거
              </button>
            </div>
          </div>
        )}

        <button className="btn primary wide" disabled={isLoading} type="submit">
          {isLoading ? LOADING_STEPS[loadingIndex] : "추천 받기"}
        </button>
      </form>

      {error && <div className="empty">{error}</div>}

      {isLoading && (
        <div className="panel loading-panel">
          <strong>{LOADING_STEPS[loadingIndex]}</strong>
          <p>분석 결과와 재고 상태를 함께 정리하고 있어요.</p>
        </div>
      )}

      {result && (
        <div className="stats-stack">
          <section className="panel">
            <div className="panel-head">
              <h2>분석 결과</h2>
              <span>{result.mode === "openai" ? "사진+텍스트 분석" : "텍스트 중심 추천"}</span>
            </div>
            <div className="analysis-chips">
              {chips(result.analysis).map((item) => (
                <span className="analysis-chip" key={item.label}>
                  {item.label} · {item.value}
                </span>
              ))}
              {result.analysis.suitableColors.map((color) => (
                <span className="analysis-chip soft" key={color}>
                  추천 컬러 · {color}
                </span>
              ))}
            </div>
            <p className="summary-text">{result.summary}</p>
            {result.note && <p className="server-note">{result.note}</p>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>추천 후보</h2>
            </div>
            <div className="recommend-list">
              {result.recommendations.map((product) => (
                <article className="recommend-card" key={product.id}>
                  <div className="recommend-top">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt="" className="thumb large" />
                    ) : (
                      <div className="thumb large" />
                    )}
                    <div className="recommend-copy">
                      <strong>{product.name}</strong>
                      <span>{SITE_LABEL[product.site]}</span>
                    </div>
                    <span
                      className={`status ${
                        product.in_stock === true
                          ? "in"
                          : product.in_stock === false
                            ? "out"
                            : "unknown"
                      }`}
                    >
                      {product.in_stock === true
                        ? "재고"
                        : product.in_stock === false
                          ? "품절"
                          : "확인 전"}
                    </span>
                  </div>
                  <p className="recommend-reason">{product.reason}</p>
                  <div className="recommend-actions">
                    <a className="btn" href={product.buy_url ?? product.url} target="_blank" rel="noreferrer">
                      상품 보기
                    </a>
                    <button
                      type="button"
                      className={`btn ${product.starred ? "primary" : ""}`}
                      onClick={() => toggleStar(product)}
                    >
                      {product.starred ? "⭐ 관심중" : "⭐ 관심 등록"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
