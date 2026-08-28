// 임의 URL 상품의 범용 판정기 (7단계)
// 1순위: JSON-LD Product offers의 availability (무도수/0.00 옵션 우선)
// 2순위: 품절 키워드 / 구매 버튼 존재 여부 스캔
export function parseGenericProduct(html) {
  if (!html) return null;
  let name = null;
  let image = null;
  let inStock = null;
  let judgedBy = null;

  // og 메타에서 이름/이미지
  name = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/)?.[1] ?? null;
  image = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1] ?? null;

  // JSON-LD Product
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    for (const node of [].concat(data)) {
      if (node?.["@type"] !== "Product") continue;
      name = node.name ?? name;
      image = [].concat(node.image ?? [])[0] ?? image;
      const offers = [].concat(node.offers ?? []);
      if (!offers.length) continue;
      const avail = (o) => /InStock/i.test(o?.availability ?? "");
      // 무도수(0.00) 옵션이 있으면 그것만 판정, 없으면 아무 옵션이라도 재고면 재고
      const plano = offers.filter((o) => /무도수|0\.00/.test(o?.name ?? ""));
      inStock = (plano.length ? plano : offers).some(avail);
      judgedBy = plano.length ? "jsonld-plano" : "jsonld";
    }
  }

  if (inStock === null) {
    // 키워드 폴백
    if (/\bsold[\s_-]?out\b|품절/i.test(html)) {
      inStock = false;
      judgedBy = "keyword";
    } else if (/장바구니|구매하기|바로구매|add to cart/i.test(html)) {
      inStock = true;
      judgedBy = "keyword";
    }
  }

  if (typeof image === "string") {
    if (image.startsWith("//")) image = "https:" + image;
    image = image.replace(/^https?:(https?:\/\/)/, "$1"); // 일부 사이트의 프로토콜 중복 보정
  }
  return { name, image, inStock, judgedBy };
}
