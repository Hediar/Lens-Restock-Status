export function parseGenericProduct(html: string | null): {
  name: string | null;
  image: string | null;
  inStock: boolean | null;
  judgedBy: string | null;
} | null;
