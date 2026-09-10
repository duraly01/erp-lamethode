import "server-only";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/rbac";

/** Récupère l'utilisateur authentifié (ou null) depuis la session Auth.js. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const id = Number(session.user.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    nom: session.user.name ?? "",
    email: session.user.email ?? "",
    roleNom: session.user.roleNom ?? null,
    permissions: session.user.permissions ?? [],
  };
}
