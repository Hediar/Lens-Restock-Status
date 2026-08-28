import { createClient } from "@supabase/supabase-js";

// 개인용 앱: anon(publishable) 키는 클라이언트 노출 전제로 설계된 공개 키.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eoncsbfsejamcjwhzdwz.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_OA40E8QSEUX1XCtfnMRLHg_leduCpnp";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type Site = "lenssis" | "lenbling" | "lenslala" | "other";

export interface Product {
  id: string;
  site: Site;
  name: string;
  url: string;
  image_url: string | null;
  color_desc: string | null;
  in_stock: boolean | null; // null = 아직 확인 전
  buy_url: string | null;
  plano_stock: number | null; // 무도수 실재고 수량 (렌시스)
  starred: boolean;
  tracking: boolean;
  last_checked_at: string | null;
  created_at: string;
}

export interface StockLevel {
  id: string;
  product_id: string;
  stock: number;
  recorded_at: string;
}

// 수량 이력으로 예상 품절일 계산 (감소 추세일 때만)
export function estimateDaysLeft(levels: StockLevel[], current: number): number | null {
  if (levels.length < 2 || current <= 0) return null;
  const sorted = [...levels].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days =
    (new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / 86400_000;
  if (days < 0.5) return null;
  const ratePerDay = (first.stock - last.stock) / days;
  if (ratePerDay <= 0) return null; // 감소 추세가 아님
  return Math.round(current / ratePerDay);
}

export interface StockCheck {
  id: string;
  product_id: string;
  in_stock: boolean;
  changed_at: string;
}

export const SITE_LABEL: Record<Site, string> = {
  lenssis: "렌시스",
  lenbling: "렌블링",
  lenslala: "렌즈라라",
  other: "기타",
};

export function timeAgo(iso: string | null): string {
  if (!iso) return "확인 전";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
