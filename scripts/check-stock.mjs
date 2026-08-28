// 품절/재입고 체커 — GitHub Actions에서 15분 간격 실행
// 사용 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import { fetchLenssisProducts, parseLenssisSingle } from "./parsers/lenssis.mjs";
import { discoverPureble, parseLenblingProduct } from "./parsers/lenbling.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
// 키 검증: anon/publishable 키가 잘못 들어간 경우 조기 실패
if (SERVICE_KEY.startsWith("sb_publishable_")) {
  console.error("❌ publishable(anon) 키가 설정됨 — service_role(sb_secret_) 키로 교체하세요");
  process.exit(1);
}
try {
  const payload = JSON.parse(
    Buffer.from(SERVICE_KEY.split(".")[1], "base64url").toString()
  );
  if (payload.role && payload.role !== "service_role") {
    console.error(`❌ '${payload.role}' 키가 설정됨 — service_role 키로 교체하세요`);
    process.exit(1);
  }
} catch {
  /* sb_secret_ 등 JWT가 아닌 키는 통과 */
}
const db = createClient(SUPABASE_URL, SERVICE_KEY);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`HTTP ${res.status}: ${url}`);
      return null;
    }
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
  const all = await fetchLenssisProducts(fetchHtml);
  // 원데이 상품만 추적 (1개월용 등 제외)
  const listed = all.filter((p) => p.name.includes("원데이"));
  console.log(`목록 ${all.length}개 중 원데이 ${listed.length}개 추적`);
  const seen = new Set();
  for (const item of listed) {
    const product = await upsertProduct("lenssis", item);
    if (product) {
      seen.add(product.url);
      await applyStatus(product, item.inStock, { image_url: item.image ?? product.image_url });
    }
  }
  // WooCommerce가 품절 상품을 목록에서 숨길 수 있음 → 목록에 없던 기존 추적
  // 상품은 개별 페이지에서 직접 판정
  const { data: tracked } = await db
    .from("products")
    .select("*")
    .eq("site", "lenssis")
    .eq("tracking", true);
  for (const p of tracked ?? []) {
    if (seen.has(p.url)) continue;
    console.log(`목록에 없음 → 개별 확인: ${p.name}`);
    const html = await fetchHtml(p.url);
    await applyStatus(p, parseLenssisSingle(html));
    await sleep(1500);
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
const { count } = await db
  .from("products")
  .select("*", { count: "exact", head: true });
console.log(`완료 (${Math.round((Date.now() - t0) / 1000)}s) — DB 상품 ${count}개`);
if (!count) {
  console.error("수집 결과 0개 — 사이트 접근 차단 또는 파서 문제 의심");
  process.exit(1);
}
