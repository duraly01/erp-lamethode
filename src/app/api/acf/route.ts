import { NextRequest } from "next/server";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { acfSuivis, contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { paginated, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { resolveOrder, pageBounds } from "@/lib/api/list";
import { acfCreateSchema, acfListQuerySchema } from "@/lib/schemas/acf";
import { writeAudit, clientIp } from "@/lib/audit";

const SORTABLE = {
  dateDemande: acfSuivis.dateDemande,
  createdAt: acfSuivis.createdAt,
  statut: acfSuivis.statut,
};

export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "acf", "read");
  const q = acfListQuerySchema.parse(searchParamsToObject(req.url));

  const filters: SQL[] = [];
  if (q.contribuableId)
    filters.push(eq(acfSuivis.contribuableId, q.contribuableId));
  if (q.statut) filters.push(eq(acfSuivis.statut, q.statut));
  if (q.q) {
    filters.push(
      or(
        ilike(acfSuivis.objet, `%${q.q}%`),
        ilike(acfSuivis.responsable, `%${q.q}%`),
      )!,
    );
  }

  const where = filters.length ? and(...filters) : undefined;
  const { limit, offset } = pageBounds(q);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(acfSuivis)
    .where(where);

  const rows = await db
    .select({
      id: acfSuivis.id,
      contribuableId: acfSuivis.contribuableId,
      contribuableNom: contribuables.nom,
      objet: acfSuivis.objet,
      dateDemande: acfSuivis.dateDemande,
      statut: acfSuivis.statut,
      motifBlocage: acfSuivis.motifBlocage,
      solution: acfSuivis.solution,
      dateResolution: acfSuivis.dateResolution,
      dateValidite: acfSuivis.dateValidite,
      responsable: acfSuivis.responsable,
      notes: acfSuivis.notes,
    })
    .from(acfSuivis)
    .innerJoin(contribuables, eq(acfSuivis.contribuableId, contribuables.id))
    .where(where)
    .orderBy(resolveOrder(q, SORTABLE, acfSuivis.dateDemande))
    .limit(limit)
    .offset(offset);

  return paginated(rows, count, q.page, q.pageSize);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "acf", "create");
  const body = acfCreateSchema.parse(await req.json());

  const [row] = await db.insert(acfSuivis).values(body).returning();

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "acf_suivis",
    entiteId: row.id,
    diff: { apres: row },
    ip: clientIp(req),
  });

  return created(row);
});
