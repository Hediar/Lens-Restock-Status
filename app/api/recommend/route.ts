import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eoncsbfsejamcjwhzdwz.supabase.co";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_OA40E8QSEUX1XCtfnMRLHg_leduCpnp";

// 3중 폴백: 용도별 저가 모델 체인 ($4.93 예산 운용)
const CHAT_MODELS = ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"];

async function openaiChat(key: string, messages: unknown[], jsonSchema?: object) {
  let lastErr = "";
  for (const model of CHAT_MODELS) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages,
          ...(jsonSchema
            ? { response_format: { type: "json_schema", json_schema: { name: "out", strict: true, schema: jsonSchema } } }
            : {}),
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) { lastErr = `${model}: ${res.status} ${(await res.text()).slice(0, 150)}`; continue; }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) { lastErr = `${model}: empty`; continue; }
      return { content, model };
    } catch (e) { lastErr = `${model}: ${(e as Error).message}`; }
  }
  throw new Error(`모든 모델 실패 — ${lastErr}`);
}

async function embed(key: string, text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`임베딩 실패 ${res.status}`);
  return (await res.json()).data[0].embedding;
}

const FEATURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["iris_color", "skin_tone", "mood", "recommend_tones", "avoid_tones"],
  properties: {
    iris_color: { type: "string" },
    skin_tone: { type: "string" },
    mood: { type: "string" },
    recommend_tones: { type: "array", items: { type: "string" } },
    avoid_tones: { type: "array", items: { type: "string" } },
  },
};

const PICK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "picks"],
  properties: {
    message: { type: "string" },
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["product_id", "reason"],
        properties: { product_id: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 설정되지 않았어요. Vercel 환경변수에 추가해 주세요." },
      { status: 503 }
    );
  }
  const { text, imageBase64, imageMime } = await req.json();
  if (!text && !imageBase64) {
    return NextResponse.json({ error: "사진이나 텍스트를 입력해 주세요." }, { status: 400 });
  }

  try {
    // ① 사진 → 특징 추출 (structured output, 사진은 저장하지 않음)
    let features: Record<string, unknown> | null = null;
    if (imageBase64) {
      const { content } = await openaiChat(
        key,
        [
          {
            role: "system",
            content:
              "당신은 컬러렌즈 스타일리스트입니다. 사진 속 인물의 홍채색, 피부톤(웜/쿨), 인상을 분석하고 어울리는/피할 렌즈 색 계열을 제시하세요. 한국어로 답하세요.",
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${imageMime ?? "image/jpeg"};base64,${imageBase64}` } },
              { type: "text", text: "이 사람에게 어울리는 컬러렌즈 특징을 분석해줘." },
            ],
          },
        ],
        FEATURE_SCHEMA
      );
      features = JSON.parse(content);
    }

    // ② 검색 문장 → 임베딩 → pgvector 유사도 검색
    const query = features
      ? `${features.recommend_tones instanceof Array ? (features.recommend_tones as string[]).join(", ") : ""} 계열의 자연스러운 원데이 컬러렌즈. ${features.mood ?? ""} 분위기, ${features.skin_tone ?? ""} 피부톤용. ${text ?? ""}`
      : String(text);
    const queryEmbedding = await embed(key, query);

    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ query_embedding: queryEmbedding, match_count: 30 }),
    });
    if (!rpcRes.ok) throw new Error(`검색 실패 ${rpcRes.status}: ${(await rpcRes.text()).slice(0, 150)}`);
    type Match = { product_id: string; name: string; site: string; url: string; buy_url: string | null; image_url: string | null; in_stock: boolean | null; similarity: number };
    const matches: Match[] = await rpcRes.json();
    if (!matches.length) {
      return NextResponse.json({ error: "추천 후보가 없어요. 임베딩 색인이 아직 안 됐을 수 있어요 (크론 실행 후 다시 시도)." }, { status: 404 });
    }

    // ③ 검색 결과만 근거로 추천 생성 (재고 있는 상품 우선)
    // 재고있음(2) > 재고정보없음(1) > 품절(0) 순, 같은 등급은 유사도순
    const stockScore = (m: Match) => (m.in_stock === true ? 2 : m.in_stock === null ? 1 : 0);
    const ranked = [...matches].sort(
      (a, b) => stockScore(b) - stockScore(a) || b.similarity - a.similarity
    );
    // 사이트 다양성: 한 사이트가 후보를 독점하지 않게 사이트당 최대 4개
    const perSite = new Map<string, number>();
    const candidates: Match[] = [];
    for (const m of ranked) {
      const n = perSite.get(m.site) ?? 0;
      if (n >= 4) continue;
      perSite.set(m.site, n + 1);
      candidates.push(m);
      if (candidates.length >= 14) break;
    }
    const listText = candidates
      .map((m, i) => `${i + 1}. [${m.product_id}] ${m.name} (${m.site}, ${m.in_stock === false ? "품절" : m.in_stock ? "재고있음" : "재고정보없음"})`)
      .join("\n");
    const { content, model } = await openaiChat(
      key,
      [
        {
          role: "system",
          content:
            "컬러렌즈 추천 도우미. 아래 후보 목록에 있는 상품만으로 4~5개를 추천하고, 각 상품마다 사용자 특징과 연결한 한 줄 이유를 써라. 목록에 없는 상품을 지어내지 마라. 재고있음 상품을 우선하되, 가능하면 여러 사이트(렌시스·렌블링·렌즈라라·오렌즈·렌즈미)의 상품을 섞어서 추천하라. 한국어.",
        },
        {
          role: "user",
          content: `사용자 특징: ${features ? JSON.stringify(features) : "없음"}\n요청: ${text ?? "사진 기반 추천"}\n\n후보 목록:\n${listText}`,
        },
      ],
      PICK_SCHEMA
    );
    const parsed = JSON.parse(content) as { message: string; picks: { product_id: string; reason: string }[] };
    const byId = new Map(candidates.map((m) => [m.product_id, m]));
    const items = parsed.picks
      .map((p) => {
        const m = byId.get(p.product_id);
        return m ? { ...m, reason: p.reason } : null;
      })
      .filter(Boolean);

    return NextResponse.json({ message: parsed.message, features, items, model });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
