// 렌블링 (lenbling.com, Cafe24)
// 상품 페이지 JSON-LD의 도수 옵션별 availability에서 (근시 0.00)만 판정.
const BASE = "https://lenbling.com";
const SEARCH_URL = `${BASE}/product/search.html?keyword=%ED%93%A8%EC%96%B4%EB%B8%94`;

// 원데이 퓨어블만 추적 (난시/주문제작 제외)
const EXCLUDE = /난시|주문제작|커스텀/;

export async function discoverPureble(fetchFn) {
  const seen = new Set();
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const html = await fetchFn(`${SEARCH_URL}&page=${page}`);
    if (!html) break;
    // Cafe24 검색 결과: <span data-product_key="link_product_detail">/product/슬러그/번호/...</span>
    const re =
      /data-product_key="link_product_detail">\/product\/([^/<]+)\/(\d+)\//g;
    let found = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      found++;
      let slug;
      try {
        slug = decodeURIComponent(m[1]);
      } catch {
        continue;
      }
      if (!slug.includes("퓨어블") || !slug.includes("원데이")) continue;
      if (EXCLUDE.test(slug)) continue;
      const path = `/product/${encodeURIComponent(slug)}/${m[2]}/`;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ url: BASE + path, name: slug.replace(/-/g, " ") });
    }
    if (found === 0) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return out;
}

// 반환: { inStock, name, image, colorDesc } / 판정 불가 시 null
export function parseLenblingProduct(html) {
  if (!html) return null;
  const blocks = [...html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  )];
  for (const b of blocks) {
    let data;
    try {
      data = JSON.parse(b[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (node["@type"] !== "Product") continue;
      const offers = [].concat(node.offers ?? []);
      const plano = offers.find((o) => (o.name ?? "").includes("근시 0.00"));
      const target = plano ?? offers[0];
      if (!target?.availability) continue;
      return {
        inStock: /InStock/i.test(target.availability),
        name: node.name ?? null,
        image: [].concat(node.image ?? [])[0]?.replace(/^https:https:/, "https:") ?? null,
        colorDesc: node.description ?? null,
      };
    }
  }
  return null;
}
