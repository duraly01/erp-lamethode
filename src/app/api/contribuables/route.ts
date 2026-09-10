import { NextRequest } from "next/server";
import { and, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { paginated, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { resolveOrder, pageBounds } from "@/lib/api/list";
import {
  contribuableCreateSchema,
  contribuableListQuerySchema,
  normaliseClasseIgs,
} from "@/lib/schemas/contribuables";
import { writeAudit, clientIp } from "@/lib/audit";

const SORTABLE = {
  nom: contribuables.nom,
  createdAt: contribuables.createdAt,
  regimeFiscal: contribuables.regimeFiscal,
};

export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "contribuables", "read");
  const q = contribuableListQuerySchema.parse(searchParamsToObject(req.url));

  const filters: SQL[] = [isNull(contribuables.deletedAt)];
  if (q.q) {
    filters.push(
      or(
        ilike(contribuables.nom, `%${q.q}%`),
        ilike(contribuables.niu, `%${q.q}%`),
        ilike(contribuables.email, `%${q.q}%`),
      )!,
    );
  }
  if (q.regimeFiscal) filters.push(eq(contribuables.regimeFiscal, q.regimeFiscal));
  if (q.actif !== undefined) filters.push(eq(contribuables.actif, q.actif));
  if (q.responsableId)
    filters.push(eq(contribuables.responsableId, q.responsableId));

  const where = and(...filters);
  const { limit, offset } = pageBounds(q);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contribuables)
    .where(where);

  const rows = await db
    .select()
    .from(contribuables)
    .where(where)
    .orderBy(resolveOrder(q, SORTABLE, contribuables.createdAt))
    .limit(limit)
    .offset(offset);

  return paginated(rows, count, q.page, q.pageSize);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "contribuables",
    "create",
  );
  const parsed = contribuableCreateSchema.parse(await req.json());
  const body = normaliseClasseIgs(parsed, parsed.regimeFiscal);

  const [row] = await db.insert(contribuables).values(body).returning();

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "contribuables",
    entiteId: row.id,
    diff: { apres: row },
    ip: clientIp(req),
  });

  return created(row);
});
