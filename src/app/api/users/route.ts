import { NextRequest } from "next/server";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, roles } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { paginated, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { resolveOrder, pageBounds } from "@/lib/api/list";
import { userCreateSchema, userListQuerySchema } from "@/lib/schemas/users";
import { writeAudit, clientIp } from "@/lib/audit";

const SORTABLE = {
  nom: users.nom,
  email: users.email,
  createdAt: users.createdAt,
};

// Projection publique : ne JAMAIS exposer password_hash.
const publicColumns = {
  id: users.id,
  nom: users.nom,
  email: users.email,
  telephone: users.telephone,
  roleId: users.roleId,
  roleNom: roles.nom,
  actif: users.actif,
  createdAt: users.createdAt,
};

export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "users", "read");
  const q = userListQuerySchema.parse(searchParamsToObject(req.url));

  const filters: SQL[] = [];
  if (q.q)
    filters.push(
      or(ilike(users.nom, `%${q.q}%`), ilike(users.email, `%${q.q}%`))!,
    );
  if (q.roleId) filters.push(eq(users.roleId, q.roleId));
  if (q.actif !== undefined) filters.push(eq(users.actif, q.actif));

  const where = filters.length ? and(...filters) : undefined;
  const { limit, offset } = pageBounds(q);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  const rows = await db
    .select(publicColumns)
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(where)
    .orderBy(resolveOrder(q, SORTABLE, users.createdAt))
    .limit(limit)
    .offset(offset);

  return paginated(rows, count, q.page, q.pageSize);
});

export const POST = withApi(async (req: NextRequest) => {
  const actor = requirePermission(await getSessionUser(), "users", "create");
  const body = userCreateSchema.parse(await req.json());

  const passwordHash = await bcrypt.hash(body.password, 10);
  const [row] = await db
    .insert(users)
    .values({
      nom: body.nom,
      email: body.email,
      telephone: body.telephone,
      passwordHash,
      roleId: body.roleId ?? null,
      actif: body.actif,
    })
    .returning({
      id: users.id,
      nom: users.nom,
      email: users.email,
      telephone: users.telephone,
      roleId: users.roleId,
      actif: users.actif,
      createdAt: users.createdAt,
    });

  await writeAudit({
    userId: actor.id,
    action: "CREATE",
    entite: "users",
    entiteId: row.id,
    diff: { apres: { ...row } },
    ip: clientIp(req),
  });

  return created(row);
});
