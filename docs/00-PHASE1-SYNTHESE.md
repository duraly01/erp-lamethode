# Phase 1 — Synthèse & Décision de Stack

**Projet :** ERP Fiscal & Social — Cabinet Comptable & Services **LaMethode SARL**
**Phase :** 1 — Analyse des besoins & architecture (à valider avant tout développement)
**Date :** 2026-07-21

---

## 1. Objet de la Phase 1

Conformément à la méthodologie imposée (« ne jamais tout générer d'un coup, procéder par
phases, attendre validation »), cette phase livre **uniquement de la documentation** :

| # | Livrable | Fichier |
|---|----------|---------|
| 1 | Cahier des charges **fonctionnel** | [`01-cahier-des-charges-fonctionnel.md`](01-cahier-des-charges-fonctionnel.md) |
| 2 | Cahier des charges **technique** | [`02-cahier-des-charges-technique.md`](02-cahier-des-charges-technique.md) |
| 3 | Architecture **logicielle & dossiers** | [`03-architecture-logicielle.md`](03-architecture-logicielle.md) |
| 4 | Architecture de la **base de données** | [`04-modele-donnees.md`](04-modele-donnees.md) |
| 5 | Diagrammes **UML & cas d'utilisation** | [`05-diagrammes.md`](05-diagrammes.md) |

**Aucune ligne de code applicatif n'est écrite dans cette phase.** La Phase 2 (schéma,
migrations, seed) ne démarre qu'après votre validation de ces documents.

---

## 2. État des lieux — ce qui existe déjà

Le dépôt `taxpayer-management-dashboard-prompt/` **n'est pas vide**. Il contient un socle
fonctionnel réel :

- **Stack :** Next.js 16 (App Router) · React 19 · TypeScript · **Drizzle ORM** · PostgreSQL · Tailwind CSS 4
- **Domaine déjà modélisé** (`src/db/schema.ts`) : `contribuables`, `declarations`, `acf_suivis`
- **Référentiel métier camerounais** (`src/lib/constants.ts`) : types de déclarations
  (DSF, Solde DSF, IRPP, BEF, Bail, Précompte loyer, TVA, Acompte IS, CNPS, Patente),
  régimes OHADA (Réel / Simplifié / IFU), statuts, règles d'échéance légale (DSF au 15 mars,
  mensuelles au 15 du mois suivant)
- **API REST** : `/api/contribuables`, `/api/declarations`, `/api/acf` (+ génération d'échéances)
- **UI** : pages Contribuables, Déclarations, ACF + tableaux et sidebar

> **Conclusion : la base est saine et le domaine métier est correctement compris.** Il ne faut
> pas la jeter, mais la structurer et l'étendre vers un ERP complet.

---

## 3. Décision de stack (vous m'avez délégué ce choix)

### Recommandation : **conserver Drizzle, adopter le reste de la stack « premium » du prompt.**

Le prompt initial demandait **Prisma + Shadcn + Auth.js**. Ma recommandation :

| Couche | Prompt initial | **Décision retenue** | Justification |
|--------|----------------|----------------------|---------------|
| ORM / BDD | Prisma | ✅ **Drizzle (existant)** | Du code réel et correct existe déjà. Migrer d'ORM = coût pur, zéro gain fonctionnel. Drizzle est plus léger, SQL-first, excellente inférence TS, idéal serverless. |
| Auth | Auth.js | ✅ **Auth.js v5 (à ajouter)** | ORM-agnostique — s'ajoute sans conflit. |
| Validation | Zod | ✅ **Zod** | Indispensable, à ajouter. |
| Tableaux | TanStack Table | ✅ **TanStack Table** | Pour le « tableau type Excel ». |
| UI kit | Shadcn UI | ✅ **Shadcn UI** | Compatible Tailwind 4 déjà en place. |
| Graphiques | Recharts | ✅ **Recharts** | Pour le dashboard. |
| Animations | Framer Motion | ✅ **Framer Motion** | À ajouter. |
| Formulaires | React Hook Form | ✅ **React Hook Form** | À ajouter. |
| Framework | Next.js 15 | ✅ **Next.js 16 (existant)** | Déjà plus récent que demandé. |

**Principe directeur :** on garde **Drizzle** comme cœur de données (car du travail réel
existe), et on ajoute **par-dessus** toute la couche UI / auth / validation / export du prompt.
On obtient 100 % des capacités visées avec un minimum de reprise.

### Ce qu'il faut ajouter en Phase 2+ (nouvelles entités)
`users`, `roles`/permissions (RBAC), `documents` (coffre documentaire), `cnps_cotisations`,
`penalites`, `notifications`, `audit_log`. Détail dans [`04-modele-donnees.md`](04-modele-donnees.md).

---

## 4. Périmètre fonctionnel (résumé)

Modules cibles : **Dashboard exécutif · Contribuables · Déclarations (annuelles + mensuelles)
· CNPS · ACF · Blocages · Gestion documentaire · Analytics · Utilisateurs & sécurité**, avec
automatisations (échéances, rappels, pénalités, alertes) et exports (PDF / Excel / CSV).

Détail complet dans le cahier des charges fonctionnel.

---

## 5. Plan des phases suivantes (après validation)

| Phase | Contenu | Sortie |
|-------|---------|--------|
| **2** | Schéma Drizzle complet, relations, migrations, seed de démo, contraintes métier | BDD prête |
| **3** | API REST (CRUD, validation Zod, auth, RBAC, pagination, recherche, filtres) | Backend testable |
| **4** | Interface : Login, Dashboard, modules | UI complète |
| **5** | Composants réutilisables (tableau Excel-like, badges, formulaires) | Design system |
| **6** | Automatisations (échéances, rappels, pénalités, alertes) | Jobs métier |
| **7** | Exports (PDF / Excel / CSV) | Reporting |
| **8** | Tests (unitaires, intégration, e2e) + docs (install / user / admin) | Prod-ready |

---

## ⏸️ Point de validation

**Je m'arrête ici.** Merci de valider (ou d'amender) :
1. la **décision de stack** (garder Drizzle) ;
2. le **périmètre fonctionnel** et le modèle de données proposés ;
3. l'**architecture** retenue.

Dès validation, je démarre la **Phase 2**.
