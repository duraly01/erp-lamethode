# Phase 2 — Base de données (schéma, migrations, seed)

**Statut :** livré · **ORM :** Drizzle · **SGBD :** PostgreSQL

---

## 1. Ce qui a été produit

| Élément | Fichier |
|---------|---------|
| Schéma complet (tables, enums, index, relations) | [`src/db/schema.ts`](../src/db/schema.ts) |
| Données de démonstration | [`src/db/seed.ts`](../src/db/seed.ts) |
| Config migrations (sortie `./drizzle`) | [`drizzle.config.json`](../drizzle.config.json) |
| Variables d'environnement | [`.env.example`](../.env.example) |
| Scripts npm (`db:*`) | [`package.json`](../package.json) |

### Tables

**Existantes, étendues** — `contribuables` (+ `responsable_id`, `date_debut_mission`,
`deleted_at`), `declarations` (+ `date_depot`, `assigned_to`), `acf_suivis` (+ `date_validite`).

**Nouvelles** — `roles`, `users`, `cnps_cotisations`, `documents`, `penalites`,
`notifications`, `audit_log`, `parametres`.

### Contraintes métier posées
- **Unicité** : `users.email` ; `declarations(contribuable_id, type, periode)` (pas de doublon
  d'échéance) ; `cnps_cotisations(contribuable_id, periode)` ; `parametres.cle` ; `roles.nom`.
- **Index** de performance sur les colonnes filtrées/triées (échéance, statut, FK, NIU…).
- **Intégrité référentielle** : `cascade` sur les enfants d'un contribuable ; `set null` sur
  les liens optionnels (responsable, assigné, uploadeur) pour ne pas perdre de données métier.
- **Soft-delete** (`deleted_at`) sur `contribuables` et `documents`.
- **Relations Drizzle** définies pour l'API Query (jointures typées).

---

## 2. Mise en route (local)

Prérequis : **Node 20+** (✅ Node 24 installé) et un **PostgreSQL** accessible.

État de vérification (2026-07-21) : ✅ `db:generate` (migration `drizzle/0000_wandering_radioactive_man.sql`)
· ✅ `typecheck` (schéma + seed compilent). ⏳ `db:migrate` / `db:seed` en attente d'une base
PostgreSQL (aucune n'est encore disponible sur la machine).

```bash
# 1. Dépendances
npm install

# 2. Démarrer une base PostgreSQL (option Docker fournie)
docker compose up -d db       # Postgres 16 sur 127.0.0.1:5432 (app_db)

# 3. Configurer la connexion
cp .env.example .env          # DATABASE_URL par défaut pointe déjà sur le conteneur

# 4. Appliquer les migrations à la base
npm run db:migrate

# 5. Charger les données de démonstration
npm run db:seed
```

> La migration a déjà été générée (`npm run db:generate`). La régénérer n'est utile qu'après
> modification du schéma. `npm run db:push` applique le schéma sans fichier de migration
> (prototypage) ; `npm run db:studio` ouvre l'explorateur Drizzle.
>
> **Sans Docker :** installer PostgreSQL nativement, ou utiliser une base hébergée (Neon,
> Supabase…) et coller sa chaîne de connexion dans `DATABASE_URL` — puis lancer les étapes 4–5.

### Jeu de démonstration chargé
- 4 rôles (Admin / Manager / Collaborateur / Lecture) avec permissions RBAC.
- 4 utilisateurs (1 admin, 1 manager, 2 collaborateurs).
- 5 contribuables (régimes Réel / Simplifié / IFU, secteurs variés).
- Déclarations 2026 générées selon le régime (annuelles + mensuelles jan→juin).
- Cotisations CNPS détaillées, 3 ACF (dont une bloquée), 3 documents, 1 pénalité estimée,
  3 notifications, entrées de journal d'audit, paramètres du cabinet.

---

## 3. Note technique
- Le mot de passe des utilisateurs de démo est un **hash placeholder** ; l'authentification
  réelle (Auth.js + hachage) est mise en place en **Phase 3**.
- Le lien « justificatif » entre déclaration et document est porté par `documents.declaration_id`
  (sens unique) afin d'éviter une clé étrangère circulaire — le besoin fonctionnel est couvert.

---

## ⏸️ Prochaine étape — Phase 3 (après validation)
API REST complètes : CRUD, validation Zod, authentification Auth.js, autorisations RBAC,
pagination, recherche, filtres — sur toutes les ressources.
