import { Product, SITE_LABEL } from "@/lib/supabase";

export interface LensProfile {
  irisColor: string;
  skinTone: string;
  mood: string;
  suitableColors: string[];
  avoidColors: string[];
  sizePreference: string;
  finishPreference: string;
  notes: string[];
}

export interface RankedProduct {
  product: Product;
  score: number;
  matchedTerms: string[];
}

const PROFILE_DEFAULTS: LensProfile = {
  irisColor: "미분석",
  skinTone: "미분석",
  mood: "데일리",
  suitableColors: [],
  avoidColors: [],
  sizePreference: "자연스러운 크기",
  finishPreference: "맑은 발색",
  notes: [],
};

const TERM_GROUPS = [
  {
    match: ["웜", "봄웜", "가을웜", "따뜻"],
    apply: (profile: LensProfile) => {
      profile.skinTone = "웜 톤";
      profile.suitableColors.push("브라운", "골드", "올리브");
      profile.avoidColors.push("푸른 회색");
    },
  },
  {
    match: ["쿨", "여름쿨", "겨울쿨", "차갑"],
    apply: (profile: LensProfile) => {
      profile.skinTone = "쿨 톤";
      profile.suitableColors.push("그레이", "애쉬", "핑크");
      profile.avoidColors.push("노란 브라운");
    },
  },
  {
    match: ["자연", "데일리", "출근", "무난"],
    apply: (profile: LensProfile) => {
      profile.mood = "자연스러운 데일리";
      profile.finishPreference = "은은한 발색";
    },
  },
  {
    match: ["또렷", "화려", "포인트", "강한"],
    apply: (profile: LensProfile) => {
      profile.mood = "또렷한 포인트";
      profile.finishPreference = "선명한 발색";
    },
  },
  {
    match: ["작은", "자연직경", "부담 없는"],
    apply: (profile: LensProfile) => {
      profile.sizePreference = "작거나 자연스러운 직경";
    },
  },
  {
    match: ["큰", "또렷한 직경", "확장감"],
    apply: (profile: LensProfile) => {
      profile.sizePreference = "또렷한 확장감";
    },
  },
  {
    match: ["브라운", "초코", "코코아"],
    apply: (profile: LensProfile) => {
      profile.suitableColors.push("브라운");
    },
  },
  {
    match: ["그레이", "회색", "애쉬"],
    apply: (profile: LensProfile) => {
      profile.suitableColors.push("그레이");
    },
  },
  {
    match: ["올리브", "카키"],
    apply: (profile: LensProfile) => {
      profile.suitableColors.push("올리브");
    },
  },
  {
    match: ["핑크", "로즈"],
    apply: (profile: LensProfile) => {
      profile.suitableColors.push("핑크");
    },
  },
];

export function mergeProfile(
  base: LensProfile,
  incoming?: Partial<LensProfile> | null
): LensProfile {
  if (!incoming) return base;

  return {
    irisColor: incoming.irisColor || base.irisColor,
    skinTone: incoming.skinTone || base.skinTone,
    mood: incoming.mood || base.mood,
    suitableColors: unique([...base.suitableColors, ...(incoming.suitableColors ?? [])]),
    avoidColors: unique([...base.avoidColors, ...(incoming.avoidColors ?? [])]),
    sizePreference: incoming.sizePreference || base.sizePreference,
    finishPreference: incoming.finishPreference || base.finishPreference,
    notes: unique([...base.notes, ...(incoming.notes ?? [])]),
  };
}

export function extractProfileFromText(query: string) {
  const profile: LensProfile = { ...PROFILE_DEFAULTS, suitableColors: [], avoidColors: [], notes: [] };
  const normalized = query.toLowerCase();

  for (const group of TERM_GROUPS) {
    if (group.match.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      group.apply(profile);
    }
  }

  if (normalized.includes("검은") || normalized.includes("흑안")) {
    profile.irisColor = "짙은 다크 브라운";
  } else if (normalized.includes("갈색") || normalized.includes("브라운 눈")) {
    profile.irisColor = "브라운";
  }

  if (!profile.suitableColors.length) {
    profile.suitableColors = ["브라운", "그레이"];
  }

  return profile;
}

export function rankProducts(
  products: Product[],
  query: string,
  profile: LensProfile,
  limit = 5
): RankedProduct[] {
  const rawTerms = tokenize(query);
  const matchTerms = unique([
    ...rawTerms,
    ...profile.suitableColors,
    profile.mood,
    profile.sizePreference,
    profile.finishPreference,
  ]);

  return products
    .map((product) => {
      const haystack = `${product.name} ${product.color_desc ?? ""} ${SITE_LABEL[product.site]}`.toLowerCase();
      let score = product.in_stock === true ? 8 : product.in_stock === null ? 2 : 0;
      const matchedTerms: string[] = [];

      for (const term of matchTerms) {
        const lowered = term.toLowerCase();
        if (!lowered) continue;
        if (haystack.includes(lowered)) {
          score += lowered.length <= 2 ? 2 : 4;
          matchedTerms.push(term);
        }
      }

      for (const term of profile.avoidColors) {
        if (haystack.includes(term.toLowerCase())) score -= 3;
      }

      if (profile.mood.includes("자연") && /데일리|브라운|소프트|맑/.test(haystack)) {
        score += 3;
      }
      if (profile.mood.includes("포인트") && /그레이|애쉬|컬러|또렷/.test(haystack)) {
        score += 3;
      }

      return {
        product,
        score,
        matchedTerms: unique(matchedTerms),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildFallbackReason(product: Product, profile: LensProfile, matchedTerms: string[]) {
  const reasons: string[] = [];

  if (matchedTerms.length) {
    reasons.push(`${matchedTerms.slice(0, 3).join(", ")} 키워드가 상품 설명과 잘 맞아요.`);
  }

  reasons.push(
    product.in_stock === true
      ? "현재 재고가 확인돼 바로 보러 가기 좋아요."
      : "지금 품절일 수 있지만 취향 후보로는 충분히 괜찮아요."
  );

  if (profile.mood) {
    reasons.push(`${profile.mood} 무드 기준으로 무난하게 고르기 쉬운 편이에요.`);
  }

  return reasons.join(" ");
}

export function buildFallbackSummary(profile: LensProfile, ranked: RankedProduct[]) {
  if (!ranked.length) {
    return "현재 조건과 잘 맞는 후보를 찾지 못했어요. 색감이나 원하는 무드를 조금 더 적어주면 더 정확해져요.";
  }

  return `${profile.mood} 쪽으로 보고, ${profile.suitableColors.slice(0, 2).join("·")} 계열 설명이 있는 상품을 먼저 골랐어요.`;
}

export function parseJsonObject<T>(value: string): T | null {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(value.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function tokenize(query: string) {
  return unique(query.split(/[\s,/|]+/).filter((token) => token.length >= 2));
}
