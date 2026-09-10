import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, roles } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, notFound, badRequest, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { userUpdateSchema } from "@/lib/schemas/users";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

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

async function findPublic(id: number) {
  const [row] = await db
    .select(publicColumns)
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, id));
  return row ?? null;
}

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "users", "read");
  const { id } = idParamSchema.parse(await params);
  const row = await findPublic(id);
  if (!row) throw notFound("Utilisateur introuvable.");
  return ok(row);
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const actor = requirePermission(await getSessionUser(), "users", "update");
  const { id } = idParamSchema.parse(await params);
  const patch = userUpdateSchema.parse(await req.json());

  const before = await findPublic(id);
  if (!before) throw notFound("Utilisateur introuvable.");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.nom !== undefined) updates.nom = patch.nom;
  if (patch.email !== undefined) updates.email = patch.email;
  if (patch.telephone !== undefined) updates.telephone = patch.telephone;
  if (patch.roleId !== undefined) updates.roleId = patch.roleId;
  if (patch.actif !== undefined) updates.actif = patch.actif;
  if (patch.password !== undefined)
    updates.passwordHash = await bcrypt.hash(patch.password, 10);

  await db.update(users).set(updates).where(eq(users.id, id));
  const row = await findPublic(id);

  await writeAudit({
    userId: actor.id,
    action: "UPDATE",
    entite: "users",
    entiteId: id,
    // On ne journalise jamais le mot de passe ; on note seulement le changement.
    diff: {
      avant: before,
      apres: { ...row, passwordChanged: patch.password !== undefined },
    },
    ip: clientIp(req),
  });

  return ok(row);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const actor = requirePermission(await getSessionUser(), "users", "delete");
  const { id } = idParamSchema.parse(await params);

  if (id === actor.id) {
    throw badRequest("Vous ne pouvez pas supprimer votre propre compte.");
  }

  const before = await findPublic(id);
  if (!before) throw notFound("Utilisateur introuvable.");

  // Désactivation plutôt que suppression physique (préserve l'historique/audit).
  await db.update(users).set({ actif: false }).where(eq(users.id, id));

  await writeAudit({
    userId: actor.id,
    action: "DEACTIVATE",
    entite: "users",
    entiteId: id,
    diff: { avant: before },
    ip: clientIp(req),
  });

  return noContent();
});
