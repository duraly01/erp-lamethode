import "server-only";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { roles, users, type RolePermission } from "@/db/schema";
import { conflict } from "@/lib/http";
import { hasPermission } from "@/lib/permissions";

/**
 * Garde-fou anti-verrouillage.
 *
 * Retirer « Modifier » sur la ressource « roles » au dernier rôle qui la
 * détient rendrait l'écran d'administration inaccessible à tout le monde, sans
 * aucun moyen de revenir en arrière depuis l'application. On simule donc le
 * changement avant de l'appliquer et on le refuse s'il ne resterait plus aucun
 * utilisateur actif capable d'administrer les permissions.
 *
 * @param roleId    rôle en cours de modification
 * @param permissionsApres permissions visées, ou `null` si le rôle est supprimé
 */
export async function assertAdministrationPreservee(
  roleId: number,
  permissionsApres: RolePermission[] | null,
) {
  const tousRoles = await db
    .select({ id: roles.id, permissions: roles.permissions })
    .from(roles);

  const effectifs = await db
    .select({ roleId: users.roleId, n: count() })
    .from(users)
    .where(eq(users.actif, true))
    .groupBy(users.roleId);

  const actifsParRole = new Map(effectifs.map((e) => [e.roleId, e.n]));

  const resteUnAdmin = tousRoles.some((r) => {
    if (r.id === roleId && permissionsApres === null) return false;
    const perms = r.id === roleId ? permissionsApres! : r.permissions;
    if (!hasPermission(perms, "roles", "update")) return false;
    return (actifsParRole.get(r.id) ?? 0) > 0;
  });

  if (!resteUnAdmin) {
    throw conflict(
      "Opération refusée : plus aucun utilisateur actif ne pourrait administrer les permissions.",
    );
  }
}

/** Un rôle encore porté par des utilisateurs ne peut pas être supprimé. */
export async function assertRoleInutilise(roleId: number) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.roleId, roleId));
  if (n > 0) {
    throw conflict(
      `Ce rôle est encore attribué à ${n} utilisateur(s). Réaffectez-les avant de le supprimer.`,
    );
  }
}
