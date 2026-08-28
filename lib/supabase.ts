import { createClient } from "@supabase/supabase-js";

// 개인용 앱: anon(publishable) 키는 클라이언트 노출 전제로 설계된 공개 키.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eoncsbfsejamcjwhzdwz.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_OA40E8QSEUX1XCtfnMRLHg_leduCpnp";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  starred: boolean;
  tracking: boolean;
  last_checked_at: string | null;
  created_at: string;
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
