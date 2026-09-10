import type { RolePermission } from "@/db/schema";
import { forbidden, unauthorized } from "@/lib/http";
import { hasPermission, type Action } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// RBAC — garde d'autorisation côté serveur
// ---------------------------------------------------------------------------

export { hasPermission, type Action };

export type SessionUser = {
  id: number;
  nom: string;
  email: string;
  roleNom: string | null;
  permissions: RolePermission[];
};

/**
 * Garde d'autorisation : lève 401 si non authentifié, 403 si la permission
 * manque. Retourne l'utilisateur pour la suite du handler.
 */
export function requirePermission(
  user: SessionUser | null | undefined,
  ressource: string,
  action: Action,
): SessionUser {
  if (!user) throw unauthorized();
  if (!hasPermission(user.permissions, ressource, action)) {
    throw forbidden(`Permission « ${action} » manquante sur « ${ressource} ».`);
  }
  return user;
}
