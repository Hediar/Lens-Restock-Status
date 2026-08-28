import { createClient } from "@supabase/supabase-js";

// 개인용 앱: anon(publishable) 키는 클라이언트 노출을 전제로 설계된 공개 키입니다.
// Vercel 환경변수가 있으면 우선 사용하고, 없으면 기본값으로 동작합니다.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eoncsbfsejamcjwhzdwz.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_OA40E8QSEUX1XCtfnMRLHg_leduCpnp";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type LensType = "daily" | "biweekly" | "monthly" | "yearly";

export interface Lens {
  id: string;
  brand: string;
  product_name: string;
  lens_type: LensType;
  power: number;
  base_curve: number | null;
  diameter: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  purchase_url: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface RestockLog {
  id: string;
  lens_id: string;
  quantity: number;
  price: number | null;
  restocked_at: string;
  memo: string | null;
}

export const LENS_TYPE_LABEL: Record<LensType, string> = {
  daily: "원데이",
  biweekly: "2주용",
  monthly: "한달용",
  yearly: "1년용",
};

export type StockStatus = "ok" | "low" | "out";

export function stockStatus(lens: Lens): StockStatus {
  if (lens.stock_quantity <= 0) return "out";
  if (lens.stock_quantity <= lens.low_stock_threshold) return "low";
  return "ok";
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  ok: "충분",
  low: "재입고 임박",
  out: "품절",
};
