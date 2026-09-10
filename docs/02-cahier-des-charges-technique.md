# Cahier des Charges Technique — ERP Fiscal & Social LaMethode SARL

**Version :** 1.0 (Phase 1) · **Statut :** à valider

---

## 1. Stack technique retenue

### Frontend
- **Next.js 16** (App Router, Server Components) — *déjà en place*
- **React 19**, **TypeScript** (strict)
- **Tailwind CSS 4** — *déjà en place*
- **Shadcn UI** (composants) + **Lucide** (icônes)
- **TanStack Table** (tableaux « Excel-like »)
- **React Query** (TanStack Query) pour le cache client des données API
- **React Hook Form** + **Zod** (formulaires validés)
- **Framer Motion** (animations)
- **Recharts** (graphiques)

### Backend
- **Next.js Route Handlers** (`/app/api/**`) — API REST
- **Drizzle ORM** + **PostgreSQL** — *déjà en place* (décision : on conserve Drizzle, pas Prisma)
- **Auth.js v5** (NextAuth) — authentification + sessions
- **Zod** — validation des entrées (partagée client/serveur)
- **Upload de fichiers** : stockage local/S3-compatible (coffre documentaire)
- **Génération PDF** (react-pdf ou équivalent) & **Excel** (SheetJS)

### Outillage & déploiement
- **Drizzle Kit** (migrations) — *déjà configuré* (`drizzle.config.json`)
- **ESLint** (config Next) — *déjà en place*
- **Docker / Docker Compose** (app + PostgreSQL)
- **GitHub Actions** (CI : lint, typecheck, build, tests)
- Cible : **VPS Ubuntu** (Nginx + PM2) ou Vercel + Postgres managé

> **Note :** le prompt initial mentionnait Prisma / UploadThing. On retient Drizzle (existant)
> et une abstraction de stockage neutre (local en dev, S3-compatible en prod).

---

## 2. Principes d'architecture

- **App Router** avec séparation nette : Server Components pour la lecture, Route Handlers
  pour les mutations, `"use client"` limité aux composants interactifs.
- **Couche d'accès aux données** isolée (`src/db`, `src/lib/repositories`) — jamais de requête
  Drizzle directement dans un composant UI.
- **Validation systématique** des entrées API via schémas Zod partagés (`src/lib/schemas`).
- **DTO / mapping** entre entités BDD et réponses API (pas d'exposition brute du schéma).
- **Clean Architecture allégée** : UI → services → repositories → DB.

---

## 3. Conventions d'API REST

| Aspect | Convention |
|--------|-----------|
| Base | `/api/<ressource>` (ex. `/api/contribuables`) |
| CRUD | `GET` liste, `POST` créer, `GET /[id]`, `PATCH /[id]`, `DELETE /[id]` |
| Pagination | `?page=&pageSize=` → `{ data, total, page, pageSize }` |
| Recherche | `?q=` (texte) |
| Filtres | `?statut=&regime=&responsable=` etc. |
| Tri | `?sort=champ&order=asc|desc` |
| Validation | Zod, erreur `422` avec détail par champ |
| Erreurs | format JSON uniforme `{ error: { code, message, details? } }` |
| Auth | session Auth.js requise ; contrôle RBAC par handler |

---

## 4. Sécurité

| Mesure | Mise en œuvre |
|--------|---------------|
| **Authentification** | Auth.js v5 (credentials + sessions signées) |
| **Autorisation** | **RBAC** : rôles (Admin / Manager / Collaborateur / Lecture) + permissions fines par ressource et action |
| **Validation** | **Zod** sur toutes les entrées (API + formulaires) |
| **Journal d'audit** | Table `audit_log` : acteur, action, entité, id, diff avant/après, horodatage, IP |
| **Rate limiting** | Middleware sur les routes sensibles (login, exports) |
| **CSRF** | Protection sur les mutations (tokens / SameSite) |
| **Chiffrement documents** | Chiffrement au repos des fichiers du coffre (clé serveur) |
| **Sauvegardes** | Dump PostgreSQL planifié (cron) + rétention |
| **Principe du moindre privilège** | Un collaborateur n'accède qu'à ses dossiers affectés |

---

## 5. Performance

- Pagination côté serveur + index BDD sur colonnes filtrées/triées (voir modèle de données).
- Tableaux volumineux **virtualisés** (TanStack Table + virtualisation).
- Cache client via React Query (invalidation ciblée après mutation).
- Server Components pour réduire le JS envoyé au client.

---

## 6. Qualité & tests (Phase 8)

- **Typage strict** (`tsc --noEmit` en CI — script déjà présent).
- **Tests unitaires** : règles métier (échéances, retard, pénalités) — priorité haute.
- **Tests d'intégration** : handlers API (auth, validation, RBAC).
- **Tests e2e** : parcours critiques (login, création déclaration, génération d'échéances).
- **Lint** bloquant en CI.

---

## 7. Environnement & configuration

- Fichier **`.env.example`** documenté (DB URL, secret Auth.js, clés de stockage…).
- Séparation `dev` / `prod` ; secrets hors dépôt.
- Migrations appliquées via Drizzle Kit dans le pipeline de déploiement.
