import { NextRequest } from "next/server";
import { and, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { declarations, contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { paginated, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { resolveOrder, pageBounds } from "@/lib/api/list";
import {
  declarationCreateSchema,
  declarationListQuerySchema,
} from "@/lib/schemas/declarations";
import { writeAudit, clientIp } from "@/lib/audit";

const SORTABLE = {
  dateEcheance: declarations.dateEcheance,
  createdAt: declarations.createdAt,
  statut: declarations.statut,
  periode: declarations.periode,
};

export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "declarations", "read");
  const q = declarationListQuerySchema.parse(searchParamsToObject(req.url));

  const filters: SQL[] = [];
  if (q.contribuableId)
    filters.push(eq(declarations.contribuableId, q.contribuableId));
  if (q.type) filters.push(eq(declarations.type, q.type));
  if (q.statut) filters.push(eq(declarations.statut, q.statut));
  if (q.periodicite) filters.push(eq(declarations.periodicite, q.periodicite));
  if (q.periode) filters.push(ilike(declarations.periode, `%${q.periode}%`));
  if (q.assignedTo) filters.push(eq(declarations.assignedTo, q.assignedTo));

  const where = filters.length ? and(...filters) : undefined;
  const { limit, offset } = pageBounds(q);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(declarations)
    .where(where);

  const rows = await db
    .select({
      id: declarations.id,
      contribuableId: declarations.contribuableId,
      contribuableNom: contribuables.nom,
      type: declarations.type,
      periodicite: declarations.periodicite,
      periode: declarations.periode,
      dateEcheance: declarations.dateEcheance,
      statut: declarations.statut,
      dateDepot: declarations.dateDepot,
      datePaiement: declarations.datePaiement,
      montant: declarations.montant,
      assignedTo: declarations.assignedTo,
      notes: declarations.notes,
    })
    .from(declarations)
    .innerJoin(contribuables, eq(declarations.contribuableId, contribuables.id))
    .where(where)
    .orderBy(resolveOrder(q, SORTABLE, declarations.dateEcheance))
    .limit(limit)
    .offset(offset);

  return paginated(rows, count, q.page, q.pageSize);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "declarations",
    "create",
  );
  const body = declarationCreateSchema.parse(await req.json());

  const [row] = await db.insert(declarations).values(body).returning();

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "declarations",
    entiteId: row.id,
    diff: { apres: row },
    ip: clientIp(req),
  });

  return created(row);
});
