import { NextRequest } from "next/server";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contribuables, factures } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { paginated, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { resolveOrder, pageBounds } from "@/lib/api/list";
import {
  factureCreateSchema,
  factureListQuerySchema,
} from "@/lib/schemas/factures";
import { creerFacture } from "@/lib/services/factures";
import { writeAudit, clientIp } from "@/lib/audit";

const SORTABLE = {
  numero: factures.numero,
  dateEmission: factures.dateEmission,
  dateEcheance: factures.dateEcheance,
  totalTtc: factures.totalTtc,
  createdAt: factures.createdAt,
};

export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "factures", "read");
  const q = factureListQuerySchema.parse(searchParamsToObject(req.url));

  const filters: SQL[] = [];
  if (q.q) {
    filters.push(
      or(
        ilike(factures.numero, `%${q.q}%`),
        ilike(contribuables.nom, `%${q.q}%`),
      )!,
    );
  }
  if (q.contribuableId)
    filters.push(eq(factures.contribuableId, q.contribuableId));
  if (q.statut) filters.push(eq(factures.statut, q.statut));
  if (q.periode) filters.push(eq(factures.periode, q.periode));
  // Impayées : reste à payer strictement positif, hors brouillons et annulées.
  if (q.impayees) {
    filters.push(sql`${factures.totalTtc} > ${factures.montantRegle}`);
    filters.push(sql`${factures.statut} NOT IN ('BROUILLON', 'ANNULEE')`);
  }

  const where = filters.length ? and(...filters) : undefined;
  const { limit, offset } = pageBounds(q);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(factures)
    .innerJoin(contribuables, eq(factures.contribuableId, contribuables.id))
    .where(where);

  const rows = await db
    .select({
      id: factures.id,
      numero: factures.numero,
      contribuableId: factures.contribuableId,
      contribuableNom: contribuables.nom,
      periode: factures.periode,
      objet: factures.objet,
      dateEmission: factures.dateEmission,
      dateEcheance: factures.dateEcheance,
      statut: factures.statut,
      totalHt: factures.totalHt,
      totalTva: factures.totalTva,
      totalTtc: factures.totalTtc,
      montantRegle: factures.montantRegle,
      envoyeeLe: factures.envoyeeLe,
      canauxEnvoi: factures.canauxEnvoi,
    })
    .from(factures)
    .innerJoin(contribuables, eq(factures.contribuableId, contribuables.id))
    .where(where)
    .orderBy(resolveOrder(q, SORTABLE, factures.createdAt))
    .limit(limit)
    .offset(offset);

  return paginated(rows, count, q.page, q.pageSize);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "factures", "create");
  const body = factureCreateSchema.parse(await req.json());

  const facture = await creerFacture({ ...body, createdBy: user.id });

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "factures",
    entiteId: facture.id,
    diff: { apres: facture },
    ip: clientIp(req),
  });

  return created(facture);
});
