# Phase 4 — Interface utilisateur

**Statut :** livré & vérifié · **UI :** Next.js 16 · Tailwind 4 · TanStack Table · React Query · Recharts · Framer-ready

---

## 1. Fondation

- **Thème** ([`globals.css`](../src/app/globals.css)) : tokens sémantiques, charte LaMethode (vert `#59B233`, encre `#111827`), **clair/sombre** (bascule persistée, sans flash).
- **Primitives UI** ([`components/ui/`](../src/components/ui)) : button, input, label, select, card, badge, dialog, pagination, spinner, page-header (style Shadcn).
- **App shell** ([`components/shell/`](../src/components/shell)) : sidebar filtrée par permissions, topbar, menu utilisateur, bascule de thème ; responsive (drawer mobile).
- **Auth UI** : page de connexion, layout protégé `(app)` avec garde serveur (`getSessionUser` → redirection `/login`).
- **Data client** : `api-client.ts` (fetch typé, erreurs normalisées), React Query, `useCan()` (RBAC côté UI), `useContribuableOptions()`.

## 2. Écrans livrés

| Écran | Fonctionnalités |
|-------|-----------------|
| **Connexion** | Auth.js Credentials, comptes de démo affichés |
| **Dashboard** | KPI, donut Recharts, prochaines échéances, ACF bloqués |
| **Contribuables** | Tableau Excel : recherche, filtres (régime/statut), tri, pagination, CRUD modale |
| **Déclarations** | Filtres type/statut/période, **génération d'échéances**, CRUD, retard calculé |
| **CNPS** | Cotisations mensuelles, montants FCFA, CRUD |
| **ACF** | Suivi, motif de blocage conditionnel, CRUD |
| **Documents** | Coffre : **upload glisser-déposer réel**, téléchargement, CRUD, soft-delete |
| **Utilisateurs** (admin) | Comptes, rôles, activation ; hachage bcrypt ; `password_hash` jamais exposé |
| **Analytics** | KPI agrégés, échéances/mois (barres), déclarations/type, portefeuille/régime, top retards |
| **Paramètres** | Édition JSON des réglages du cabinet (écriture réservée aux admins) |

## 3. Stockage documentaire

- Upload multipart → [`/api/documents/upload`](../src/app/api/documents/upload/route.ts) → fichier écrit sous `storage/<contribuableId>/<uuid>-<nom>` ([`lib/storage.ts`](../src/lib/storage.ts)), limite 10 Mo.
- Téléchargement authentifié → [`/api/documents/[id]/download`](../src/app/api/documents/[id]/download/route.ts) (protection path-traversal).
- Chemin racine configurable via `STORAGE_LOCAL_PATH` (local en dev ; S3-compatible envisageable).

## 4. Vérifications (navigateur + API réelle)

✅ login → dashboard (données réelles) · ✅ garde d'auth (307) · ✅ Contribuables/Déclarations/
Utilisateurs/Analytics/Paramètres rendus avec données réelles · ✅ RBAC UI (nav & boutons filtrés) ·
✅ upload fichier → 201 + écrit sur disque · ✅ download → contenu identique · ✅ download non
authentifié → 401 · ✅ `typecheck` vert.

## 5. Reste à faire (hors Phase 4)

- Analytics : filtres par période/collaborateur (agrégations supplémentaires).
- Documents : prévisualisation, versions, chiffrement au repos, OCR (architecture).
- Phases 5-8 : automatisations (rappels/pénalités via tâches planifiées), exports PDF/Excel, tests.

## 6. Accès

`npm run dev` → http://localhost:3000 · connexion `admin@lamethode.cm` / `Lamethode2026!`
(la base tourne via `docker compose up -d db`).
