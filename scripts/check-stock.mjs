// 품절/재입고 체커 — GitHub Actions에서 15분 간격 실행
// 사용 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { Agent, fetch as undiciFetch } from "undici";

// 렌시스.com은 인증서 만료 → 해당 호스트 요청에만 검증 예외 적용
// (내장 fetch와 npm undici Agent는 호환되지 않아 undici fetch를 함께 사용)
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
const needsInsecure = (url) => {
  try {
    return new URL(url).hostname === "xn--sm2bu7q1e.com";
  } catch {
    return false;
  }
};
const smartFetch = (url, init = {}) =>
  needsInsecure(url)
    ? undiciFetch(url, { ...init, dispatcher: insecureAgent })
    : fetch(url, init);
import {
  fetchLenssisCatalog,
  fetchOmsProduct,
  judgePlanoFromOms,
} from "./parsers/lenssis.mjs";
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

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const pushEnabled = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (pushEnabled) {
  webpush.setVapidDetails("mailto:srlimvp@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn("VAPID 키 미설정 — 푸시 발송 생략");
}

async function sendRestockPush(product) {
  if (!pushEnabled) return;
  const { data: subs } = await db.from("push_subscriptions").select("*");
  if (!subs?.length) return;
  const payload = JSON.stringify({
    title: "재입고 알림",
    body: `${product.name} 무도수가 재입고됐어요!`,
    url: product.buy_url ?? product.url,
  });
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      console.log(`📨 푸시 발송: ${product.name}`);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.from("push_subscriptions").delete().eq("id", s.id);
        console.log("만료된 구독 정리");
      } else {
        console.warn(`푸시 실패 (${e.statusCode ?? e.message})`);
      }
    }
  }
}

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

// HTML + 세션 쿠키까지 필요한 경우 (렌시스 OMS API용)
async function fetchWithCookies(url) {
  try {
    const res = await smartFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`HTTP ${res.status}: ${url}`);
      return null;
    }
    const cookie = (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
    return { html: await res.text(), cookie };
  } catch (e) {
    console.warn(`fetch 실패: ${url} (${e.message})`);
    return null;
  }
}

async function fetchJson(url, { cookie = "", referer = "" } = {}) {
  try {
    const res = await smartFetch(url, {
      headers: { "User-Agent": UA, Cookie: cookie, Referer: referer },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok || !text) {
      console.warn(`JSON HTTP ${res.status} len ${text.length}: ${url}`);
      return null;
    }
    return JSON.parse(text);
  } catch (e) {
    console.warn(`JSON fetch 실패: ${url} (${e.message})`);
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
      if (product.starred) await sendRestockPush(product);
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
  // 구버전 크론이 남긴 다른 URL 형식 행 정리 (현행은 렌시스.com 표기)
  await db.from("products").delete().eq("site", "lenssis").like("url", "https://lenssis.site%");
  await db.from("products").delete().eq("site", "lenssis").like("url", "https://lenssis-online.com%");
  const { products, cookie } = await fetchLenssisCatalog(fetchWithCookies);
  console.log(`원데이 카탈로그 ${products.length}개`);
  if (!products.length) return;
  for (const item of products) {
    const product = await upsertProduct("lenssis", item);
    if (!product) continue;
    const extra = {};
    if (item.image && !product.image_url) extra.image_url = item.image;
    if (!product.buy_url) extra.buy_url = item.url;
    // 옵션 단위 실재고: OMS API에서 무도수 stock/status 판정
    const oms = await fetchOmsProduct(fetchJson, item.idx, cookie);
    const inStock = judgePlanoFromOms(oms);
    if (inStock === null) console.warn(`무도수 판정 불가: ${item.name}`);
    await applyStatus(product, inStock, extra);
    await sleep(800);
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
