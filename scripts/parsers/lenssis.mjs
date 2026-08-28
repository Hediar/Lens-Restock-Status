// 렌시스 (lenssis.site, WordPress + WooCommerce)
// 상점 목록 페이지의 li.product 클래스(instock/outofstock)로 전 상품 일괄 판정.
const BASE = "https://lenssis.site";

export async function fetchLenssisProducts(fetchFn) {
  const products = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${BASE}/?post_type=product${page > 1 ? `&paged=${page}` : ""}`;
    const html = await fetchFn(url);
    if (!html) break;

    // <li class="product type-product post-123 ... instock ..."> ... </li>
    const liRe =
      /<li[^>]*class="[^"]*\btype-product\b[^"]*\bpost-(\d+)\b[^"]*"[\s\S]*?<\/li>/g;
    let found = 0;
    let m;
    while ((m = liRe.exec(html)) !== null) {
      const li = m[0];
      const classAttr = li.match(/class="([^"]*)"/)?.[1] ?? "";
      const inStock = /\binstock\b/.test(classAttr)
        ? true
        : /\boutofstock\b/.test(classAttr)
          ? false
          : null;
      const href = li.match(/<a[^>]+href="([^"]+)"/)?.[1];
      const name = li
        .match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim();
      const image = li.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
      if (href && name && inStock !== null) {
        products.push({ url: normalizeUrl(href), name, image, inStock });
        found++;
      }
    }
    if (found === 0) break;
    await sleep(1500);
  }
  // URL 기준 중복 제거 (연관상품 등으로 겹칠 수 있음)
  const seen = new Set();
  return products.filter((p) =>
    seen.has(p.url) ? false : (seen.add(p.url), true)
  );
}

function normalizeUrl(u) {
  try {
    const url = new URL(u, BASE);
    url.hash = "";
    return url.toString();
  } catch {
    return u;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 개별 상품 페이지에서 자기 자신의 재고 판정 (목록에서 사라진 상품 폴백용)
export function parseLenssisSingle(html) {
  if (!html) return null;
  const m = html.match(/<div id="product-\d+" class="([^"]*)"/);
  if (!m) return null;
  if (/\binstock\b/.test(m[1])) return true;
  if (/\boutofstock\b/.test(m[1])) return false;
  return null;
}

// ── 재고 판정 v2: lenssis-online.com의 정상배송 화이트리스트 사용 ──
// 사이트 전 페이지에 NORMAL_SHIPPING_PRODUCTS(정상배송 = 재고 보유 도수 목록)가
// 임베드됨. 목록에 없는 상품/옵션은 배송지연(재고 없음).
const ONLINE_PAGE = "https://lenssis-online.com/series/?idx=130";

export function normalizeText(s) {
  return String(s)
    .normalize("NFC")
    .replace(/[\s​‌‍﻿]/g, "")
    .toLowerCase();
}

export async function fetchShippingMap(fetchFn) {
  const html = await fetchFn(ONLINE_PAGE);
  if (!html) return null;
  const m = html.match(/const NORMAL_SHIPPING_PRODUCTS = (\{[\s\S]*?\});/);
  if (!m) return null;
  let raw;
  try {
    raw = new Function(`return (${m[1]})`)();
  } catch {
    return null;
  }
  const map = new Map();
  for (const [name, opts] of Object.entries(raw)) {
    const list = Array.isArray(opts) ? opts : [];
    map.set(normalizeText(name), {
      all: list.length === 0 || list.includes("*"),
      options: new Set(list.map(normalizeText)),
    });
  }
  return map;
}

// 무도수(0.00) 재고 판정: 맵에 없으면 전 옵션 지연 → 품절 취급
export function planoInStock(map, productName) {
  const entry = map.get(normalizeText(productName));
  if (!entry) return false;
  return entry.all || entry.options.has(normalizeText("무도수"));
}

// lenssis.site 상품 페이지에서 '구매하기' 버튼의 lenssis-online 링크 추출
export function extractBuyUrl(html) {
  if (!html) return null;
  const re = /href="(https:\/\/lenssis-online\.com\/[^"]+)"[^>]*>([\s\S]{0,80}?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[2].includes("구매하기")) return m[1];
  }
  return null;
}
