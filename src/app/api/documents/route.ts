import { NextRequest } from "next/server";
import { and, eq, ilike, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { documents, contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { paginated, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { resolveOrder, pageBounds } from "@/lib/api/list";
import {
  documentCreateSchema,
  documentListQuerySchema,
} from "@/lib/schemas/documents";
import { writeAudit, clientIp } from "@/lib/audit";

const SORTABLE = {
  nomFichier: documents.nomFichier,
  createdAt: documents.createdAt,
  categorie: documents.categorie,
};

export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "documents", "read");
  const q = documentListQuerySchema.parse(searchParamsToObject(req.url));

  const filters: SQL[] = [isNull(documents.deletedAt)];
  if (q.contribuableId)
    filters.push(eq(documents.contribuableId, q.contribuableId));
  if (q.categorie) filters.push(eq(documents.categorie, q.categorie));
  if (q.q) filters.push(ilike(documents.nomFichier, `%${q.q}%`));

  const where = and(...filters);
  const { limit, offset } = pageBounds(q);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(where);

  const rows = await db
    .select({
      id: documents.id,
      contribuableId: documents.contribuableId,
      contribuableNom: contribuables.nom,
      nomFichier: documents.nomFichier,
      typeMime: documents.typeMime,
      taille: documents.taille,
      categorie: documents.categorie,
      tags: documents.tags,
      version: documents.version,
      declarationId: documents.declarationId,
      acfId: documents.acfId,
      uploadedBy: documents.uploadedBy,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .innerJoin(contribuables, eq(documents.contribuableId, contribuables.id))
    .where(where)
    .orderBy(resolveOrder(q, SORTABLE, documents.createdAt))
    .limit(limit)
    .offset(offset);

  return paginated(rows, count, q.page, q.pageSize);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "documents", "create");
  const body = documentCreateSchema.parse(await req.json());

  const [row] = await db
    .insert(documents)
    .values({ ...body, uploadedBy: user.id })
    .returning();

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "documents",
    entiteId: row.id,
    diff: { apres: row },
    ip: clientIp(req),
  });

  return created(row);
});
