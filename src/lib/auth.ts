import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { users, roles, type RolePermission } from "@/db/schema";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Champs personnalisés stockés dans le JWT (au-delà du standard Auth.js). */
type TokenExtra = {
  roleNom?: string | null;
  permissions?: RolePermission[];
  /** Horodatage (ms) de la dernière relecture des permissions en base. */
  permsAt?: number;
};

/**
 * Durée pendant laquelle les permissions du JWT sont réputées fraîches.
 *
 * Les permissions sont portées par le jeton pour éviter une requête à chaque
 * appel d'API. Mais un administrateur qui modifie un rôle doit voir l'effet
 * sans attendre la reconnexion des utilisateurs concernés : passé ce délai, le
 * jeton est rafraîchi depuis la base.
 */
const PERMISSIONS_TTL_MS = 60_000;

/** Relit rôle et permissions en base pour un utilisateur donné. */
async function lirePermissions(userId: number) {
  const [row] = await db
    .select({
      actif: users.actif,
      roleNom: roles.nom,
      permissions: roles.permissions,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId));
  return row ?? null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const [row] = await db
          .select({
            id: users.id,
            nom: users.nom,
            email: users.email,
            passwordHash: users.passwordHash,
            actif: users.actif,
            roleNom: roles.nom,
            permissions: roles.permissions,
          })
          .from(users)
          .leftJoin(roles, eq(users.roleId, roles.id))
          .where(eq(users.email, email));

        if (!row || !row.actif || !row.passwordHash) return null;

        const valid = await bcrypt.compare(password, row.passwordHash);
        if (!valid) return null;

        // Ces champs personnalisés transitent vers le callback jwt.
        return {
          id: String(row.id),
          name: row.nom,
          email: row.email,
          roleNom: row.roleNom ?? null,
          permissions: (row.permissions ?? []) as RolePermission[],
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger }) => {
      const t = token as TokenExtra;

      if (user) {
        t.roleNom = user.roleNom ?? null;
        t.permissions = user.permissions ?? [];
        t.permsAt = Date.now();
        return token;
      }

      // Rafraîchissement : à la demande explicite du client (`session.update()`)
      // ou dès que les permissions portées par le jeton sont périmées.
      const perime = Date.now() - (t.permsAt ?? 0) > PERMISSIONS_TTL_MS;
      if ((trigger === "update" || perime) && token.sub) {
        const id = Number(token.sub);
        if (Number.isFinite(id)) {
          const row = await lirePermissions(id);
          // Compte désactivé ou supprimé : on vide les droits sans attendre
          // l'expiration de la session.
          t.roleNom = row?.actif ? (row.roleNom ?? null) : null;
          t.permissions = row?.actif ? (row.permissions ?? []) : [];
          t.permsAt = Date.now();
        }
      }
      return token;
    },
    session: async ({ session, token }) => {
      const t = token as TokenExtra;
      // token.sub porte l'id de l'utilisateur (défini par Auth.js à la connexion).
      if (token.sub) session.user.id = token.sub;
      session.user.roleNom = t.roleNom ?? null;
      session.user.permissions = t.permissions ?? [];
      return session;
    },
  },
});
