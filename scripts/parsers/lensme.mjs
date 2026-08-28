// 렌즈미 (lens-me.com) 원데이 카탈로그 — 추천 전용
const BASE = "https://www.lens-me.com";
const LIST = `${BASE}/shop/goods_list.php?ps_ctid=00002&ps_code=function&ps_scduid=57`;

export async function fetchLensmeOneDay(fetchFn) {
  const products = [];
  const seen = new Set();
  for (let page = 1; page <= 8; page++) {
    const html = await fetchFn(`${LIST}${page > 1 ? `&ps_page=${page}` : ""}`);
    if (!html) break;
    const re =
      /<a href="goods_detail\.php\?ps_uid=(\d+)[^"]*" class="name"><h2[^>]*>([^<]+)<\/h2>/g;
    let m, found = 0;
    while ((m = re.exec(html)) !== null) {
      found++;
      const uid = m[1];
      if (seen.has(uid)) continue;
      seen.add(uid);
      // 이미지: 해당 uid 링크 이전의 picture source
      const before = html.slice(Math.max(0, m.index - 1200), m.index);
      const img = [...before.matchAll(/srcset="([^"]+\.webp)"/g)].pop()?.[1] ?? null;
      products.push({
        name: m[2].trim(),
        url: `${BASE}/shop/goods_detail.php?ps_uid=${uid}`,
        image: img,
      });
    }
    if (found === 0) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return products;
}
