// 품절/재입고 체커 — GitHub Actions에서 15분 간격 실행
// 사용 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import { fetchLenssisProducts } from "./parsers/lenssis.mjs";
import { discoverPureble, parseLenblingProduct } from "./parsers/lenbling.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY);

const UA =
  "LensRestockStatus/1.0 (personal stock tracker; +https://github.com/Hediar/Lens-Restock-Status)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    console.warn(`fetch 실패: ${url} (${e.message})`);
    return null;
  }
}

// 상태 반영: 전환 시에만 stock_checks 기록. fetch 실패(null)는 상태 유지.
async function applyStatus(product, inStock, extra = {}) {
  const now = new Date().toISOString();
  const patch = { last_checked_at: now, ...extra };
  if (inStock !== null && inStock !== product.in_stock) {
    patch.in_stock = inStock;
    await db.from("stock_checks").insert({ product_id: product.id, in_stock: inStock });
    if (product.in_stock === false && inStock === true) {
      console.log(`🔔 재입고: ${product.name}`);
      // TODO(4단계): starred 상품이면 웹 푸시 발송
    }
  }
  await db.from("products").update(patch).eq("id", product.id);
}

async function upsertProduct(site, { url, name, image = null, colorDesc = null }) {
  const { data } = await db.from("products").select("*").eq("url", url).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db
    .from("products")
    .insert({ site, name, url, image_url: image, color_desc: colorDesc })
    .select()
    .single();
  if (error) {
    console.warn(`upsert 실패: ${name} (${error.message})`);
    return null;
  }
  console.log(`➕ 신상품 등록: [${site}] ${name}`);
  // TODO(6단계): OpenAI 임베딩 색인
  return created;
}

async function runLenssis() {
  console.log("── 렌시스 스윕");
  const listed = await fetchLenssisProducts(fetchHtml);
  console.log(`목록에서 ${listed.length}개 확인`);
  for (const item of listed) {
    const product = await upsertProduct("lenssis", item);
    if (product) await applyStatus(product, item.inStock, { image_url: item.image ?? product.image_url });
  }
}

async function runLenbling() {
  console.log("── 렌블링(퓨어블) 스윕");
  const discovered = await discoverPureble(fetchHtml);
  console.log(`검색에서 ${discovered.length}개 확인`);
  await sleep(1500);
  for (const item of discovered) {
    const product = await upsertProduct("lenbling", item);
    if (!product) continue;
    const html = await fetchHtml(product.url);
    const parsed = parseLenblingProduct(html);
    if (parsed === null) {
      console.warn(`판정 불가, 스킵: ${product.name}`);
      await db.from("products").update({ last_checked_at: new Date().toISOString() }).eq("id", product.id);
    } else {
      await applyStatus(product, parsed.inStock, {
        name: parsed.name ?? product.name,
        image_url: parsed.image ?? product.image_url,
        color_desc: parsed.colorDesc ?? product.color_desc,
      });
    }
    await sleep(1500);
  }
}

const t0 = Date.now();
await runLenssis();
await runLenbling();
console.log(`완료 (${Math.round((Date.now() - t0) / 1000)}s)`);
