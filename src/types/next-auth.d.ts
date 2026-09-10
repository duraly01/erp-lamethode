import type { DefaultSession } from "next-auth";
import type { RolePermission } from "@/db/schema";

// Augmentation des types Auth.js : ajoute rôle + permissions à la session.
// (l'id reste `string` — convention Auth.js — et est reconverti en number côté serveur)
declare module "next-auth" {
  interface User {
    roleNom?: string | null;
    permissions?: RolePermission[];
  }

  interface Session {
    user: {
      roleNom?: string | null;
      permissions?: RolePermission[];
    } & DefaultSession["user"];
  }
}
