// 렌즈라라 (lenslala4.com) 원데이 카탈로그. 추천 전용이라 재고 추적에는 포함하지 않는다.
const BASE = "https://lenslala4.com";
const CATEGORY_URL = `${BASE}/category/1day`;

function getJsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function normalizeUrl(url) {
  try {
    return new URL(url, BASE).toString();
  } catch {
    return null;
  }
}

// ItemList의 전체 상품 수를 이용해 필요한 페이지 수를 계산한다.
function getCatalogCount(html) {
  for (const block of getJsonLdBlocks(html)) {
    const entries = Array.isArray(block) ? block : [block];
    for (const entry of entries) {
      if (entry?.["@type"] !== "ItemList" || !Array.isArray(entry.itemListElement)) continue;
      if (Number.isInteger(entry.numberOfItems)) return entry.numberOfItems;
    }
  }
  return null;
}

function parseVisibleCards(html) {
  const products = [];
  const pattern = /<a[^>]+href="(\/item\/[^"]+)"[^>]*>\s*<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = normalizeUrl(match[1]);
    const name = match[3]
      .replace(/\s*\([^)]*\)\s*일본 컬러렌즈\s*$/, "")
      .trim();
    // 무도수 사용자 대상: 난시용(토릭) CYL/AXIS 변형 상품은 제외
    if (/난시|토릭|toric|CYL|멀티포컬|multifocal/i.test(name)) continue;
    if (url && name) products.push({ name, url, image: normalizeUrl(match[2]), colorDesc: name });
  }
  return products;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchLenslalaOneDay(fetchFn, { maxPages = null, delayMs = 1000 } = {}) {
  const html = await fetchFn(CATEGORY_URL);
  if (!html) return [];

  const firstPage = parseVisibleCards(html);
  if (!firstPage.length) return [];

  const catalogCount = getCatalogCount(html);
  const pageCount = Math.ceil((catalogCount ?? firstPage.length) / firstPage.length);
  const pagesToFetch = Math.min(pageCount, maxPages ?? pageCount);
  const productsByUrl = new Map(firstPage.map((product) => [product.url, product]));

  for (let page = 2; page <= pagesToFetch; page++) {
    await sleep(delayMs);
    const pageHtml = await fetchFn(`${CATEGORY_URL}?page=${page}`);
    if (!pageHtml) break;

    const cards = parseVisibleCards(pageHtml);
    if (!cards.length) break;
    for (const product of cards) productsByUrl.set(product.url, product);
  }

  return [...productsByUrl.values()];
}
