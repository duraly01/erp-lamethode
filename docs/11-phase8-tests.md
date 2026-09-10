# Phase 8 — Tests & qualité

**Statut :** livré · **Runner :** Vitest · **32 tests · 4 fichiers · tous verts**

---

## 1. Suite de tests unitaires

| Fichier | Couvre |
|---------|--------|
| [`penalty.test.ts`](../src/lib/penalty.test.ts) | Calcul de pénalité : forfait, pourcentage, minimum plancher, montant nul/chaîne |
| [`constants.test.ts`](../src/lib/constants.test.ts) | Échéances légales (mensuelle J+15 mois suivant, DSF 15 mars N+1, bascule décembre) ; `isEnRetard` (passé/futur/jour même, statuts traités) — horloge figée via `vi.setSystemTime` |
| [`permissions.test.ts`](../src/lib/permissions.test.ts) | RBAC `hasPermission` : joker admin, permission spécifique, action/ressource refusée, vide/undefined |
| [`schemas/schemas.test.ts`](../src/lib/schemas/schemas.test.ts) | Validation Zod : défauts, coercition, bornes, dates, email null, régime/montant |

Lancer : `npm test` (une passe) · `npm run test:watch` (mode veille).

Configuration : [`vitest.config.ts`](../vitest.config.ts) (alias `@/`, environnement node).

## 2. Refactor de testabilité

Le calcul de pénalité a été extrait dans un **module pur** [`lib/penalty.ts`](../src/lib/penalty.ts)
(sans dépendance serveur), réutilisé par le service d'automatisation — testable en isolation.

## 3. Portée & intégration / e2e

Les tests unitaires ciblent la **logique métier déterministe** (règles, RBAC, validation), la
plus critique et la plus stable.

Les couches **intégration** (handlers API : auth, RBAC, validation, unicité, FK) et **e2e**
(login → CRUD → génération → export) ont été **vérifiées manuellement** tout au long du projet
(requêtes HTTP authentifiées + parcours navigateur documentés dans `docs/07`–`10`). Les
automatiser demanderait une base de test dédiée + un serveur — piste d'amélioration future
(ex. Playwright pour l'e2e, une DB éphémère pour l'intégration).

## 4. Qualité du code

- `npm run typecheck` : **0 erreur** (TypeScript strict).
- `npm run lint` : **0 erreur** (avertissements React Compiler sur `useReactTable` de TanStack
  Table — connus et sans impact fonctionnel).
- `npm test` : **32/32**.

---

## ✅ Les 8 phases du plan initial sont livrées.
