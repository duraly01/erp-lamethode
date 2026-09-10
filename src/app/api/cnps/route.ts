import { NextRequest } from "next/server";
import { and, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cnpsCotisations, contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { paginated, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { resolveOrder, pageBounds } from "@/lib/api/list";
import { cnpsCreateSchema, cnpsListQuerySchema } from "@/lib/schemas/cnps";
import { writeAudit, clientIp } from "@/lib/audit";

const SORTABLE = {
  dateEcheance: cnpsCotisations.dateEcheance,
  periode: cnpsCotisations.periode,
  createdAt: cnpsCotisations.createdAt,
};

export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "cnps", "read");
  const q = cnpsListQuerySchema.parse(searchParamsToObject(req.url));

  const filters: SQL[] = [];
  if (q.contribuableId)
    filters.push(eq(cnpsCotisations.contribuableId, q.contribuableId));
  if (q.statut) filters.push(eq(cnpsCotisations.statut, q.statut));
  if (q.periode) filters.push(ilike(cnpsCotisations.periode, `%${q.periode}%`));

  const where = filters.length ? and(...filters) : undefined;
  const { limit, offset } = pageBounds(q);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cnpsCotisations)
    .where(where);

  const rows = await db
    .select({
      id: cnpsCotisations.id,
      contribuableId: cnpsCotisations.contribuableId,
      contribuableNom: contribuables.nom,
      periode: cnpsCotisations.periode,
      masseSalariale: cnpsCotisations.masseSalariale,
      taux: cnpsCotisations.taux,
      montantEmployeur: cnpsCotisations.montantEmployeur,
      montantSalarie: cnpsCotisations.montantSalarie,
      dateEcheance: cnpsCotisations.dateEcheance,
      statut: cnpsCotisations.statut,
      notes: cnpsCotisations.notes,
    })
    .from(cnpsCotisations)
    .innerJoin(
      contribuables,
      eq(cnpsCotisations.contribuableId, contribuables.id),
    )
    .where(where)
    .orderBy(resolveOrder(q, SORTABLE, cnpsCotisations.dateEcheance))
    .limit(limit)
    .offset(offset);

  return paginated(rows, count, q.page, q.pageSize);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "cnps", "create");
  const body = cnpsCreateSchema.parse(await req.json());

  const [row] = await db.insert(cnpsCotisations).values(body).returning();

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cnps_cotisations",
    entiteId: row.id,
    diff: { apres: row },
    ip: clientIp(req),
  });

  return created(row);
});
