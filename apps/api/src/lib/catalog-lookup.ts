import { readItems } from "@directus/sdk";
import { directus } from "./directus.js";

export interface CatalogInfo {
  title: string;
  price: number;
  enrollment?: string | null;
  source_url?: string | null;
  stock?: number | null;
  variants?: { sku: string; stock: number }[] | null;
}

const fieldsFor = (type: "dpo" | "merch") => type === "dpo" ? ["slug", "title", "price", "enrollment", "source_url"] : ["slug", "title", "price", "stock", "variants_json"];
function catalogInfo(row: any): CatalogInfo {
  return { title: row.title, price: row.price ?? 0, enrollment: row.enrollment ?? null, source_url: row.source_url ?? null,
    stock: typeof row.stock === "number" ? row.stock : null, variants: Array.isArray(row.variants_json) ? row.variants_json : null };
}

/** Не более одного чтения на коллекцию, независимо от числа строк и вариантов. */
export async function lookupCatalog(items: { type: "dpo" | "merch"; ref_id: string }[]): Promise<Map<string, CatalogInfo>> {
  const result = new Map<string, CatalogInfo>();
  await Promise.all((["dpo", "merch"] as const).map(async type => {
    const slugs = [...new Set(items.filter(item => item.type === type).map(item => item.ref_id))];
    if (!slugs.length) return;
    const rows = await directus.request((readItems as any)(type === "dpo" ? "programs" : "products", {
      filter: { slug: { _in: slugs }, status: { _eq: "published" } }, limit: -1, fields: fieldsFor(type),
    })) as any[];
    for (const row of rows) result.set(type + ":" + row.slug, catalogInfo(row));
  }));
  return result;
}

export async function lookup(type: "dpo" | "merch", slug: string): Promise<CatalogInfo | null> {
  return (await lookupCatalog([{ type, ref_id: slug }])).get(type + ":" + slug) ?? null;
}
