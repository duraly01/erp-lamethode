# Phase 3 — API REST (CRUD, Auth, RBAC, validation)

**Statut :** livré & vérifié de bout en bout · **Auth :** Auth.js v5 · **Validation :** Zod 4

---

## 1. Couche transverse

| Élément | Fichier | Rôle |
|---------|---------|------|
| Réponses & erreurs uniformes | [`src/lib/http.ts`](../src/lib/http.ts) | `ok/created/noContent/paginated`, `withApi` (capture Zod → 422, HttpError, pg 23505 → 409, 23503 → 422) |
| Schémas communs | [`src/lib/schemas/common.ts`](../src/lib/schemas/common.ts) | pagination, tri, id, helpers (booléen, date, texte) |
| Helpers de liste | [`src/lib/api/list.ts`](../src/lib/api/list.ts) | `resolveOrder` (whitelist de tri), `pageBounds` |
| RBAC | [`src/lib/rbac.ts`](../src/lib/rbac.ts) | `hasPermission`, `requirePermission` (401/403) |
| Auth.js | [`src/lib/auth.ts`](../src/lib/auth.ts) + [`api/auth/[...nextauth]`](../src/app/api/auth/[...nextauth]/route.ts) | Credentials + bcrypt, JWT portant rôle & permissions |
| Session | [`src/lib/session.ts`](../src/lib/session.ts) | `getSessionUser()` |
| Audit | [`src/lib/audit.ts`](../src/lib/audit.ts) | `writeAudit()` sur chaque mutation |

## 2. Ressources exposées

Chaque ressource : `GET` liste (pagination + recherche + filtres + tri), `POST` créer,
`GET/PATCH/DELETE /[id]`. Toutes protégées par authentification + permission fine.

| Ressource | Base URL | Permission | Particularités |
|-----------|----------|-----------|----------------|
| Contribuables | `/api/contribuables` | `contribuables` | recherche nom/NIU/email, filtres régime/actif/responsable, **soft-delete** |
| Déclarations | `/api/declarations` | `declarations` | filtres type/statut/période/contribuable, jointure nom, + `/generate` (génération idempotente) |
| ACF | `/api/acf` | `acf` | recherche objet/responsable, filtre statut |
| CNPS | `/api/cnps` | `cnps` | unicité (contribuable, période) |
| Documents | `/api/documents` | `documents` | métadonnées coffre, **soft-delete** (upload fichier en Phase 4) |
| Utilisateurs | `/api/users` | `users` (ADMIN) | hash bcrypt, `password_hash` **jamais** exposé, désactivation au lieu de suppression |

### Conventions
- **Liste** : `?page=&pageSize=&q=&sort=&order=` + filtres par ressource → `{ data, total, page, pageSize, totalPages }`.
- **Erreurs** : `{ error: { code, message, details? } }` (422 validation, 401, 403, 404, 409, 422 FK, 500).

## 3. Comptes de démonstration (seed)

Mot de passe commun : **`Lamethode2026!`**

| Email | Rôle | Droits |
|-------|------|--------|
| `admin@lamethode.cm` | ADMIN | tout (`*`) |
| `nadege@lamethode.cm` | MANAGER | métier complet (pas `users`) |
| `yannick@lamethode.cm` / `aicha@lamethode.cm` | COLLABORATEUR | lecture + écriture partielle |

## 4. Vérifications effectuées (contre la base réelle)

✅ 401 sans session · ✅ login Credentials → session avec rôle+permissions · ✅ mauvais mot de
passe rejeté · ✅ CRUD contribuables complet · ✅ pagination/tri/recherche/filtres · ✅ validation
Zod → 422 · ✅ soft-delete → 404 · ✅ RBAC : collaborateur refusé en create/delete (403),
`users` réservé ADMIN (403) · ✅ FK invalide → 422 · ✅ doublon d'unicité → 409 · ✅ génération
d'échéances idempotente · ✅ journal d'audit alimenté à chaque mutation · ✅ `typecheck` vert.

## 5. Mise en route

```bash
docker compose up -d db      # si la base n'est pas déjà lancée
npm run dev                  # http://localhost:3000
# tester : GET /api/health → {"ok":true}
```

---

## ⏸️ Prochaine étape — Phase 4 (après validation)
Interface : page de connexion, layout protégé (garde d'auth), Dashboard, et les écrans
métier (contribuables, déclarations, CNPS, ACF, documents) branchés sur ces API, avec le
tableau « type Excel » (TanStack Table), Shadcn UI et la charte LaMethode (vert #59B233).
