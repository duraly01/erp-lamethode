import { asc, desc, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { ListQuery } from "@/lib/schemas/common";

/** Résout la clause ORDER BY à partir d'une whitelist de colonnes triables. */
export function resolveOrder(
  q: Pick<ListQuery, "sort" | "order">,
  sortable: Record<string, PgColumn>,
  fallback: PgColumn,
): SQL {
  const col = (q.sort && sortable[q.sort]) || fallback;
  return q.order === "asc" ? asc(col) : desc(col);
}

/** Bornes LIMIT/OFFSET pour la pagination. */
export function pageBounds(q: Pick<ListQuery, "page" | "pageSize">) {
  return { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
}
