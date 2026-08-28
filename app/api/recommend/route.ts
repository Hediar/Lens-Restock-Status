import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildFallbackReason,
  buildFallbackSummary,
  extractProfileFromText,
  LensProfile,
  mergeProfile,
  parseJsonObject,
  rankProducts,
} from "@/lib/recommendation";
import { Product, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

export const runtime = "nodejs";

interface RecommendRequest {
  query?: string;
  imageDataUrl?: string | null;
}

interface OpenAIRecommendation {
  productId: string;
  reason: string;
}

function getResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  if (typeof response.output_text === "string") return response.output_text;

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("\n") ?? ""
  );
}

function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    SUPABASE_ANON_KEY;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadProducts() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("products").select("*").in("site", [
    "lenssis",
    "lenbling",
    "lenslala",
  ]);

  if (error) throw new Error(error.message);

  return ((data as Product[]) ?? []).filter(
    (product) => product.site === "lenslala" || product.tracking
  );
}

async function callOpenAI(prompt: string, imageDataUrl?: string | null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...(imageDataUrl
              ? [{ type: "input_image", image_url: imageDataUrl, detail: "low" as const }]
              : []),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}`);
  }

  return getResponseText((await response.json()) as unknown);
}

async function analyzeProfile(query: string, imageDataUrl?: string | null) {
  const textProfile = extractProfileFromText(query);
  if (!imageDataUrl && !process.env.OPENAI_API_KEY) return { profile: textProfile, mode: "fallback" };

  if (!process.env.OPENAI_API_KEY) {
    return {
      profile: textProfile,
      mode: "fallback",
      note: "OPENAI_API_KEY가 없어 텍스트 키워드 중심으로 추천했어요.",
    };
  }

  const prompt = [
    "컬러 렌즈 추천용 프로필 분석기입니다.",
    "입력된 텍스트와 사진을 보고 아래 JSON만 반환하세요.",
    '{"irisColor":"","skinTone":"","mood":"","suitableColors":[],"avoidColors":[],"sizePreference":"","finishPreference":"","notes":[]}',
    "설명은 넣지 말고 JSON만 출력하세요.",
    `텍스트 요청: ${query || "없음"}`,
  ].join("\n");

  const responseText = await callOpenAI(prompt, imageDataUrl);
  const parsed = parseJsonObject<Partial<LensProfile>>(responseText ?? "");

  return {
    profile: mergeProfile(textProfile, parsed),
    mode: parsed ? "openai" : "fallback",
    note: parsed ? undefined : "사진 분석 응답을 해석하지 못해 텍스트 기반 추천으로 이어갔어요.",
  };
}

async function refineRecommendations(
  query: string,
  profile: LensProfile,
  candidates: ReturnType<typeof rankProducts>
) {
  if (!process.env.OPENAI_API_KEY || candidates.length === 0) return null;

  const prompt = [
    "너는 컬러 렌즈 큐레이터다.",
    "주어진 후보 목록 안에서만 최대 4개를 골라 JSON만 반환해라.",
    '{"summary":"","recommendations":[{"productId":"","reason":""}]}',
    `사용자 요청: ${query || "없음"}`,
    `프로필: ${JSON.stringify(profile)}`,
    "후보 목록:",
    ...candidates.map(({ product, matchedTerms }, index) =>
      `${index + 1}. ${JSON.stringify({
        productId: product.id,
        name: product.name,
        site: product.site,
        inStock: product.in_stock,
        colorDesc: product.color_desc,
        matchedTerms,
      })}`
    ),
  ].join("\n");

  const responseText = await callOpenAI(prompt, null);
  return parseJsonObject<{
    summary?: string;
    recommendations?: OpenAIRecommendation[];
  }>(responseText ?? "");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RecommendRequest;
    const query = body.query?.trim() ?? "";
    const imageDataUrl = body.imageDataUrl ?? null;

    if (!query && !imageDataUrl) {
      return NextResponse.json(
        { error: "텍스트 설명이나 사진 중 하나는 필요해요." },
        { status: 400 }
      );
    }

    const products = await loadProducts();
    const profileResult = await analyzeProfile(query, imageDataUrl);
    const ranked = rankProducts(products, query, profileResult.profile, 8);
    const aiResult = await refineRecommendations(query, profileResult.profile, ranked);

    const chosen = (aiResult?.recommendations ?? [])
      .map((item) => {
        const found = ranked.find(({ product }) => product.id === item.productId);
        if (!found) return null;
        return {
          ...found.product,
          reason: item.reason,
          matchedTerms: found.matchedTerms,
        };
      })
      .filter((value): value is Product & { reason: string; matchedTerms: string[] } => Boolean(value));

    const fallback = ranked.slice(0, 4).map(({ product, matchedTerms }) => ({
      ...product,
      reason: buildFallbackReason(product, profileResult.profile, matchedTerms),
      matchedTerms,
    }));

    return NextResponse.json({
      mode: aiResult?.recommendations?.length ? "openai" : profileResult.mode,
      note: profileResult.note,
      analysis: profileResult.profile,
      summary:
        aiResult?.summary ||
        buildFallbackSummary(profileResult.profile, ranked),
      recommendations: chosen.length ? chosen : fallback,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "추천을 준비하지 못했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
