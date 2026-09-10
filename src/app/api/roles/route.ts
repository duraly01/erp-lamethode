import { NextRequest } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { roles, users } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { hasPermission } from "@/lib/permissions";
import { ok, created, withApi } from "@/lib/http";
import { roleCreateSchema } from "@/lib/schemas/roles";
import { writeAudit, clientIp } from "@/lib/audit";

/**
 * Liste des rôles.
 *
 * La permission `users:read` suffit pour alimenter le sélecteur de rôle du
 * formulaire utilisateur, mais les permissions détaillées ne sont exposées
 * qu'à qui peut administrer les rôles : elles décrivent la surface de sécurité
 * de l'application.
 */
export const GET = withApi(async () => {
  const user = requirePermission(await getSessionUser(), "users", "read");
  const peutAdministrer = hasPermission(user.permissions, "roles", "read");

  const rows = await db
    .select({
      id: roles.id,
      nom: roles.nom,
      description: roles.description,
      permissions: roles.permissions,
      nbUtilisateurs: count(users.id),
    })
    .from(roles)
    .leftJoin(users, eq(users.roleId, roles.id))
    .groupBy(roles.id)
    .orderBy(asc(roles.id));

  if (!peutAdministrer) {
    return ok(
      rows.map(({ id, nom, description }) => ({ id, nom, description })),
    );
  }
  return ok(rows);
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "roles", "create");
  const body = roleCreateSchema.parse(await req.json());

  const [row] = await db.insert(roles).values(body).returning();

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "roles",
    entiteId: row.id,
    diff: { apres: row },
    ip: clientIp(req),
  });

  return created(row);
});
