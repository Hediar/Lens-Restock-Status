// 렌즈라라 원데이 상품을 추천 후보로만 한 번 적재한다.
// 실행: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-lenslala.mjs
import { createClient } from "@supabase/supabase-js";
import { fetchLenslalaOneDay } from "./parsers/lenslala.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = 100;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

if (SERVICE_KEY.startsWith("sb_publishable_")) {
  console.error("publishable 키가 아닌 service_role 키를 설정하세요");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);
const userAgent =
  "LensRestockStatus/1.0 (+https://github.com/Hediar/Lens-Restock-Status)";

async function fetchHtml(url) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent, "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      console.warn(`HTTP ${response.status}: ${url}`);
      return null;
    }
    return response.text();
  } catch (error) {
    console.warn(`수집 실패: ${url} (${error instanceof Error ? error.message : "unknown"})`);
    return null;
  }
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
}

const catalog = await fetchLenslalaOneDay(fetchHtml);
if (!catalog.length) {
  console.error("렌즈라라 원데이 카탈로그를 찾지 못했습니다.");
  process.exit(1);
}

const { data: existing, error: existingError } = await db
  .from("products")
  .select("url")
  .eq("site", "lenslala");
if (existingError) throw new Error(existingError.message);

const existingUrls = new Set((existing ?? []).map((product) => product.url));
const newProducts = catalog
  .filter((product) => !existingUrls.has(product.url))
  .map((product) => ({
    site: "lenslala",
    name: product.name,
    url: product.url,
    buy_url: product.url,
    image_url: product.image,
    color_desc: product.colorDesc,
    in_stock: null,
    tracking: false,
  }));

let inserted = 0;
for (const batch of chunks(newProducts, BATCH_SIZE)) {
  const { error } = await db.from("products").insert(batch);
  if (error) throw new Error(error.message);
  inserted += batch.length;
  console.log(`적재 ${inserted}/${newProducts.length}`);
}

console.log(
  `완료: 카탈로그 ${catalog.length}개, 새 추천 후보 ${inserted}개, 기존 ${existingUrls.size}개`
);
