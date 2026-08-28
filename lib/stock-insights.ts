import { Product, SITE_LABEL, StockCheck } from "@/lib/supabase";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const HEATMAP_BUCKETS = [
  { label: "새벽", start: 0, end: 4 },
  { label: "오전", start: 4, end: 8 },
  { label: "아침", start: 8, end: 12 },
  { label: "오후", start: 12, end: 16 },
  { label: "저녁", start: 16, end: 20 },
  { label: "밤", start: 20, end: 24 },
] as const;

export interface HeatmapCell {
  bucketLabel: string;
  count: number;
}

export interface HeatmapRow {
  dayLabel: string;
  cells: HeatmapCell[];
}

export interface RankedSellout {
  productId: string;
  name: string;
  siteLabel: string;
  count: number;
  inStock: boolean | null;
}

export interface RecentRestock {
  id: string;
  productId: string;
  name: string;
  siteLabel: string;
  changedAt: string;
}

export interface LongestOutProduct {
  productId: string;
  name: string;
  siteLabel: string;
  hours: number;
}

export interface StockInsights {
  trackedCount: number;
  currentlyOutCount: number;
  weeklyRestocks: number;
  averageSelloutHours: number | null;
  lastCheckedAt: string | null;
  longestOut: LongestOutProduct | null;
  selloutRanking: RankedSellout[];
  heatmap: HeatmapRow[];
  recentRestocks: RecentRestock[];
}

function hoursBetween(startIso: string, endIso: string) {
  return Math.max(
    0,
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000
  );
}

export function buildStockInsights(
  products: Product[],
  checks: StockCheck[],
  now = new Date()
): StockInsights {
  const sortedChecks = [...checks].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
  );
  const checksByProduct = new Map<string, StockCheck[]>();

  for (const check of sortedChecks) {
    const list = checksByProduct.get(check.product_id) ?? [];
    list.push(check);
    checksByProduct.set(check.product_id, list);
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const selloutDurations: number[] = [];
  const selloutRanking: RankedSellout[] = [];
  let longestOut: LongestOutProduct | null = null;

  for (const product of products) {
    const timeline = checksByProduct.get(product.id) ?? [];
    let selloutCount = 0;
    let lastOutAt: string | null = null;

    for (const event of timeline) {
      if (event.in_stock) {
        if (lastOutAt) {
          selloutDurations.push(hoursBetween(lastOutAt, event.changed_at));
          lastOutAt = null;
        }
        continue;
      }

      selloutCount += 1;
      if (!lastOutAt) lastOutAt = event.changed_at;
    }

    if (product.in_stock === false && lastOutAt) {
      const ongoingHours = hoursBetween(lastOutAt, now.toISOString());
      if (!longestOut || ongoingHours > longestOut.hours) {
        longestOut = {
          productId: product.id,
          name: product.name,
          siteLabel: SITE_LABEL[product.site],
          hours: ongoingHours,
        };
      }
    }

    selloutRanking.push({
      productId: product.id,
      name: product.name,
      siteLabel: SITE_LABEL[product.site],
      count: selloutCount,
      inStock: product.in_stock,
    });
  }

  const weekAgo = now.getTime() - 7 * 24 * 3_600_000;
  const recentRestockChecks = [...sortedChecks]
    .filter((check) => check.in_stock)
    .filter((check) => new Date(check.changed_at).getTime() >= weekAgo);

  const heatmap = DAY_LABELS.map((dayLabel) => ({
    dayLabel,
    cells: HEATMAP_BUCKETS.map((bucket) => ({
      bucketLabel: bucket.label,
      count: 0,
    })),
  }));

  for (const event of recentRestockChecks) {
    const date = new Date(event.changed_at);
    const day = date.getDay();
    const hour = date.getHours();
    const bucketIndex = HEATMAP_BUCKETS.findIndex(
      (bucket) => hour >= bucket.start && hour < bucket.end
    );
    if (bucketIndex >= 0) {
      heatmap[day].cells[bucketIndex].count += 1;
    }
  }

  const recentRestocks = [...sortedChecks]
    .filter((check) => check.in_stock)
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
    .slice(0, 6)
    .map((check) => {
      const product = productMap.get(check.product_id);
      return {
        id: check.id,
        productId: check.product_id,
        name: product?.name ?? "이름 없음",
        siteLabel: product ? SITE_LABEL[product.site] : "알 수 없음",
        changedAt: check.changed_at,
      };
    });

  const trackedCount = products.length;
  const currentlyOutCount = products.filter((product) => product.in_stock === false).length;
  const averageSelloutHours =
    selloutDurations.length > 0
      ? selloutDurations.reduce((sum, value) => sum + value, 0) / selloutDurations.length
      : null;
  const lastCheckedAt =
    products
      .map((product) => product.last_checked_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    trackedCount,
    currentlyOutCount,
    weeklyRestocks: recentRestockChecks.length,
    averageSelloutHours,
    lastCheckedAt,
    longestOut,
    selloutRanking: selloutRanking.sort((a, b) => b.count - a.count).slice(0, 8),
    heatmap,
    recentRestocks,
  };
}
