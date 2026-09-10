# Phase 10 — Rôles & permissions administrables

## Objet

Le RBAC existait déjà (permissions JSON par rôle, `requirePermission` côté
serveur, `useCan` côté client) mais n'était modifiable qu'en base, via le seed.
L'administrateur peut désormais **attribuer les droits d'accès aux
fonctionnalités selon les niveaux de pouvoir**, depuis l'ERP.

## Ce qui a été livré

### Catalogue des ressources — `src/lib/permissions.ts`

Source de vérité unique des ressources protégées (contribuables, déclarations,
CNPS, ACF, documents, analytics, utilisateurs, rôles, paramètres) et des quatre
actions (consulter, créer, modifier, supprimer). Helpers purs `toMatrice` /
`fromMatrice` / `isAccesTotal` pour convertir entre le format stocké
(`RolePermission[]`) et la matrice affichée.

### Rôles personnalisés — `drizzle/0003_tense_mandarin.sql`

`roles.nom` était une énumération Postgres figée à quatre valeurs. Elle est
convertie en `varchar(50)` : l'administrateur peut créer ses propres niveaux
(ex. `CHEF_MISSION`) sans migration. Les quatre rôles existants sont conservés.

### API

| Route                      | Droit requis    | Rôle                                    |
| -------------------------- | --------------- | --------------------------------------- |
| `GET /api/roles`           | `users:read`    | Liste. Les permissions détaillées ne sont renvoyées qu'à qui a `roles:read`. |
| `POST /api/roles`          | `roles:create`  | Création (sans aucun droit au départ)   |
| `GET /api/roles/{id}`      | `roles:read`    | Détail                                  |
| `PATCH /api/roles/{id}`    | `roles:update`  | Description + matrice de permissions    |
| `DELETE /api/roles/{id}`   | `roles:delete`  | Suppression                             |

Toutes les écritures sont tracées dans le journal d'audit.

### Deux garde-fous

- **Anti-verrouillage** (`assertAdministrationPreservee`) : une modification ou
  une suppression est refusée (409) s'il ne resterait **aucun utilisateur actif**
  capable d'administrer les permissions. Sans ce contrôle, un administrateur
  pouvait se retirer `roles:update` et rendre l'écran définitivement
  inaccessible, sans recours depuis l'application.
- **Rôle encore attribué** (`assertRoleInutilise`) : suppression refusée tant
  que des utilisateurs le portent, avec le nombre concerné dans le message.

### Fraîcheur des permissions — `src/lib/auth.ts`

Les permissions sont portées par le JWT pour éviter une requête à chaque appel
d'API. Elles étaient donc figées **jusqu'à la reconnexion** : un changement de
rôle restait sans effet, y compris côté serveur puisque `getSessionUser()` lit
la session. Le callback `jwt` relit désormais rôle et permissions en base :

- immédiatement sur `session.update()` (déclenché après enregistrement dans
  l'écran, pour un retour instantané) ;
- sinon dès que le jeton dépasse **60 secondes** ;
- un compte désactivé voit ses droits vidés sans attendre l'expiration de sa
  session.

### Interface — `/roles`

Liste des rôles à gauche (avec le nombre d'utilisateurs et un repère « accès
total »), matrice ressource × action à droite. Bascule « Accès total
(super-administrateur) » qui correspond au joker `*`, raccourci « Tout / Aucun »
par ligne, indicateur de modifications non enregistrées, création et suppression
de rôle. Entrée de menu conditionnée par la permission `roles`.

## Vérifications

| Contrôle    | Résultat                                  |
| ----------- | ----------------------------------------- |
| `typecheck` | 0 erreur                                  |
| `lint`      | 0 erreur, 6 avertissements React-Compiler |
| `test`      | **58/58** (+8 sur la matrice et le joker) |

**Non vérifié à ce stade** : le comportement en base (migration 0003, garde-fous
409, rafraîchissement du JWT). Aucune base PostgreSQL n'est accessible depuis le
poste — voir la note d'accès distant en Phase 9.
