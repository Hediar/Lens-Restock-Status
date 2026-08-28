// 렌시스 — lenssis-online.com (Imweb, = 렌시스.com)
// 원데이 카테고리에서 상품 목록을 얻고, 각 상품의 무도수(도수 0.00) 실재고는
// 사이트 내부 OMS API(옵션 단위 stock/status)로 판정한다.
const BASE = "https://lenssis-online.com";
const ONEDAY_CATEGORY = `${BASE}/325460388`;

export function normalizeText(s) {
  return String(s)
    .normalize("NFC")
    .replace(/[\s​‌‍﻿]/g, "")
    .toLowerCase();
}

const PLANO = normalizeText("무도수");

// 카테고리 페이지 → [{ idx, name, url, image }] + 세션 쿠키
export async function fetchLenssisCatalog(fetchFn) {
  const res = await fetchFn(ONEDAY_CATEGORY, { wantResponse: true });
  if (!res) return { products: [], cookie: "" };
  const { html, cookie } = res;
  const products = [];
  const seen = new Set();
  const re = /href="\/325460388\/\?idx=(\d+)"[^>]*>([\s\S]{0,3000}?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const idx = m[1];
    if (seen.has(idx)) continue;
    const block = m[2];
    const name = block.match(/<h2[^>]*>([^<]+)<\/h2>/)?.[1]?.trim();
    if (!name) continue;
    seen.add(idx);
    products.push({
      idx,
      name,
      url: `${BASE}/325460388/?idx=${idx}`,
      image: block.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
    });
  }
  return { products, cookie };
}

// OMS API 응답에서 무도수 옵션 재고 판정
// 반환: true/false, 판정 불가 시 null
export function judgePlanoFromOms(json) {
  const d = json?.data;
  if (!d) return null;
  if (d.prod_soldout_status && d.prod_soldout_status !== "sale") return false;

  const options = Array.isArray(d.options) ? d.options : [];
  let planoCodes = new Set();
  for (const opt of options) {
    for (const [code, label] of Object.entries(opt.value_list ?? {})) {
      if (normalizeText(label) === PLANO) planoCodes.add(code);
    }
  }
  const details = Array.isArray(d.options_detail) ? d.options_detail : [];
  if (planoCodes.size === 0) {
    // 옵션 정의가 아예 없는 상품: 상품 상태로 판정
    if (!options.length && !details.length) return d.prod_soldout_status === "sale";
    // 도수 옵션은 있는데 무도수 값이 없음(무도수 미취급) → 품절 취급
    return false;
  }
  const planoDetails = details.filter((od) =>
    (od.value_code_list ?? []).some((c) => planoCodes.has(c))
  );
  if (!planoDetails.length) return false;
  return planoDetails.some(
    (od) => od.status === "SALE" && (d.stock_unlimit || Number(od.stock) > 0)
  );
}

export async function fetchOmsProduct(fetchJsonFn, idx, cookie) {
  return fetchJsonFn(`${BASE}/ajax/oms/OMS_get_product.cm?prod_idx=${idx}`, {
    cookie,
    referer: `${BASE}/325460388/?idx=${idx}`,
  });
}
