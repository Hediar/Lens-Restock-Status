// 오렌즈 (o-lens.com) 원데이 카탈로그 — 추천 전용
const BASE = "https://www.o-lens.com";

export async function fetchOlensOneDay(fetchFn) {
  const html = await fetchFn(`${BASE}/roundup?uc=UC001`);
  if (!html) return [];
  const products = [];
  const seen = new Set();
  const re = /href="\/product\/(\d+)"[^>]*>[\s\S]{0,600}?<img alt="([^"]+)"[^>]*(?:src|srcSet|srcset)="([^"\s]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    products.push({
      name: m[2].trim(),
      url: `${BASE}/product/${id}`,
      image: m[3].startsWith("http") ? m[3] : `${BASE}${m[3]}`,
    });
  }
  return products;
}
