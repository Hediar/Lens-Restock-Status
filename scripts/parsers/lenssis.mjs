// 렌시스 — lenssis-online.com (Imweb, = 렌시스.com)
// 원데이 카테고리 페이지 한 번으로 상품 목록(이름/URL/이미지) + 정상배송 맵을
// 모두 얻는다. NORMAL_SHIPPING_PRODUCTS는 "재고 보유 도수 화이트리스트"로,
// 맵에 없는 상품/옵션은 배송지연(재고 없음)이다.
const BASE = "https://lenssis-online.com";
const ONEDAY_CATEGORY = `${BASE}/325460388`;

export function normalizeText(s) {
  return String(s)
    .normalize("NFC")
    .replace(/[\s​‌‍﻿]/g, "")
    .toLowerCase();
}

function parseShippingMap(html) {
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

// 무도수(0.00) 재고: 맵에 없으면 전 옵션 지연 → 품절 취급
export function planoInStock(map, productName) {
  const entry = map.get(normalizeText(productName));
  if (!entry) return false;
  return entry.all || entry.options.has(normalizeText("무도수"));
}

// 원데이 카테고리 1회 fetch → [{ name, url, image, inStock }]
export async function fetchLenssisOneDay(fetchFn) {
  const html = await fetchFn(ONEDAY_CATEGORY);
  if (!html) return { products: [], mapLoaded: false };
  const map = parseShippingMap(html);

  const products = [];
  const seen = new Set();
  const re = /href="\/325460388\/\?idx=(\d+)"[^>]*>([\s\S]{0,3000}?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const idx = m[1];
    if (seen.has(idx)) continue;
    const block = m[2];
    const name = block
      .match(/<h2[^>]*>([^<]+)<\/h2>/)?.[1]
      ?.trim();
    if (!name) continue;
    seen.add(idx);
    products.push({
      name,
      url: `${BASE}/325460388/?idx=${idx}`,
      image: block.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
      inStock: map ? planoInStock(map, name) : null,
    });
  }
  return { products, mapLoaded: Boolean(map) };
}
