# Mise en production sur le serveur Plesk (Newton Corp)

Rédigé le 20 septembre 2026. Remplace la « voie B » de `21-mise-en-production-E1-E6.md` :
l'hébergement cPanel est abandonné, le nouveau serveur est un Plesk
(`srv2-web-ns7.newtoncorp.fr:8443`), sans accès SSH.

Sans terminal, la méthode est celle qu'on connaît déjà : **on compile ici, on
dépose une archive, on clique dans le panneau.** Le `server.js` écrit pour
Passenger du temps de cPanel resservira tel quel — Plesk fait tourner les
applications Node.js avec le même Passenger.

Bonne nouvelle par rapport à cPanel : ce serveur a PostgreSQL 14, Node 22, les
tâches planifiées et un onglet d'exécution de commandes. Tout ce qui manquait
là-bas est ici.

## 0. Ce que le serveur offre — constaté le 20 septembre 2026

Vérifié directement dans le panneau, session ouverte par le cabinet. Rien n'a
été créé ni modifié : lecture seule.

| | |
| --- | --- |
| Abonnement | `lamethode.cm`, actif, 0,6 Mo utilisés — hébergement neuf |
| IP | 178.32.213.243 · utilisateur système `lamethode.cm_cvls4nga5b` |
| **PostgreSQL** | **oui — `localhost:5432`, v14.24** (et MariaDB 10.6.23 à côté) |
| **Node.js** | **oui — extension présente**, versions proposées **22.23.2** et 23.11.1 |
| Racine du document | `/httpdocs` · mode d'application `production` |
| Variables d'environnement | réglables depuis le panneau Node.js |
| Tâches planifiées | oui |
| Git, Composer, PHP 8.4.25 | oui |
| SSL/TLS | **« Domaine non protégé »** — aucun certificat pour l'instant |

Trois conclusions :

1. **Le serveur convient.** PostgreSQL 14.24 est très au-dessus du 9.6 de
   l'ancien hébergeur — dont la migration 0010 a été retaillée pour tenir. La
   question qui bloquait tout est tranchée, et le docker-compose du dépôt
   devient inutile : la base est fournie par l'hébergeur.
2. **Prendre Node 22.23.2, pas 23.11.1.** La 22 est la version en support long
   terme, celle du `Dockerfile` du dépôt. La 23 n'est plus maintenue.
3. **Ne pas activer Node.js sur `lamethode.cm` lui-même.** Activer Node.js à la
   racine d'un domaine fait passer tout le domaine derrière Passenger : le site
   vitrine, s'il est servi depuis ce serveur, disparaîtrait. L'ERP va sur un
   **sous-domaine dédié**, `erp.lamethode.cm`, avec sa propre racine.
   À confirmer au passage : le site public `lamethode.cm` est-il déjà servi par
   ce serveur, ou le DNS pointe-t-il encore vers l'ancien ? Les 0,6 Mo
   d'occupation disque laissent penser que `httpdocs` est encore vide.

Au passage, les messages « Plesk a expiré » repérés dans la page de connexion
étaient bien des gabarits : le panneau fonctionne normalement.

## 0 bis. Ce qui est déjà fait sur le serveur — 20 septembre 2026

Configuration posée directement dans le panneau, avec l'accord du cabinet :

- **sous-domaine `erp.lamethode.cm` créé** (id 459), racine du document
  `/erp.lamethode.cm/public`, racine d'application `/erp.lamethode.cm` — les
  secrets et les sources restent ainsi hors de portée du web ;
- **Node.js activé** sur ce sous-domaine, en **22.23.2**, mode `production`,
  fichier de démarrage **`server.js`**.

Plesk signale, à raison, que `server.js` est introuvable : les fichiers ne sont
pas encore déposés. C'est l'étape suivante.

### Ce qui bloque le dépôt des fichiers

**Le gestionnaire de fichiers de ce Plesk ne s'affiche pas** — page vide, aucun
élément, aucune erreur dans la console du navigateur, aussi bien sur
`lamethode.cm` que sur le sous-domaine. Ce n'est pas un problème de droits :
c'est l'interface elle-même qui ne rend rien. Trois contournements :

1. **Le réessayer depuis un autre navigateur**, ou avec les extensions
   désactivées — c'est le plus rapide à vérifier.
2. **Par FTP**, avec les identifiants du panneau (Sites Web & Domaines → Accès
   FTP). C'est la voie la plus sûre pour 15 Mo.
3. **Par Git** — le tableau de bord propose « Déployer à l'aide de Git ». Il
   faudrait d'abord pousser le dépôt sur un hébergeur Git, ce qu'il n'est pas
   aujourd'hui.

### L'état du DNS, et ce qu'il implique

`lamethode.cm` est délégué à `ns3/ns4.nitrowebhost.co.uk` — pas à ce Plesk. Et
surtout :

| Nom | Résout vers | Ce qui s'y trouve |
| --- | --- | --- |
| `lamethode.cm` | 95.217.84.98 | le site vitrine |
| `erp.lamethode.cm` | 95.217.84.98 | **l'ERP en production, vivant** |
| serveur Plesk | 178.32.213.243 | le nouvel hébergement, vide |

`erp.lamethode.cm` **sert l'ERP en production** : la bascule de ce nom vers
178.32.213.243 est donc le dernier geste de la migration, pas le premier. Elle
se fait chez le gestionnaire du DNS, une fois la nouvelle installation
éprouvée — et l'ancien serveur reste debout un moment, comme le prescrit le
document 19.

Conséquence pratique : **le certificat Let's Encrypt ne pourra être émis
qu'après la bascule DNS**, puisque la validation passe par le nom de domaine.
Pour éprouver l'installation avant la bascule, le plus simple est un nom
temporaire (`erp2.lamethode.cm`, par exemple) pointé vers 178.32.213.243.

## 1. L'archive

Produite ici, avec `npm run build` préalable :

```bash
tar -czf erp-lamethode-AAAA-MM-JJ.tar.gz --exclude='.next/dev' --exclude='.next/cache' --exclude='.next/trace' --exclude='.next/trace-build' --exclude='.next/diagnostics' --exclude='.next/_events_*.json' .next drizzle scripts src server.js package.json package-lock.json next.config.ts postcss.config.mjs tsconfig.json tsconfig.scripts.json drizzle.config.ts .env.production.example
```

Environ **15 Mo**. Les exclusions ne sont pas cosmétiques : sans elles,
`.next/dev` — le cache du serveur de développement — porte l'archive à 535 Mo.

Ce qu'elle contient, et pourquoi :

| | |
| --- | --- |
| `.next/` | l'application compilée — c'est ce qui évite de compiler sur le serveur |
| `drizzle/` | les 13 migrations et leur journal |
| `src/`, `tsconfig*.json` | requis par les scripts (`seed`, `automations`) lancés via `tsx` |
| `scripts/` | dont `migrate.mjs`, le migrateur qui n'utilise pas WebAssembly |
| `server.js` | point d'entrée Passenger |
| `package*.json` | pour le bouton « NPM install » du panneau |

Elle ne contient **ni `.env`, ni `storage/`, ni `node_modules/`** — secrets,
documents des contribuables, dépendances. Les deux premiers se déposent à la
main, le troisième s'installe depuis le panneau.

## 2. Déposer et installer

1. **Gestionnaire de fichiers** → répertoire de l'application (par exemple
   `httpdocs` ou un sous-dossier dédié, `erp/`) → **Téléverser** l'archive →
   clic droit → **Extraire**.
   Vérifier ensuite que `.next` est bien là : certains gestionnaires masquent
   les dossiers commençant par un point — il y a une option « afficher les
   fichiers cachés ».
2. **Créer le fichier `.env`** à la racine de l'application, sur le modèle de
   `.env.production.example`, avec :
   - `DATABASE_URL` — l'URL de la base créée à l'étape 3 ;
   - `AUTH_SECRET` — 32 octets aléatoires ; le panneau n'en génère pas, à
     produire ici (`openssl rand -base64 32`) ;
   - `AUTH_URL` — l'URL publique réelle, en `https://` ;
   - `CRON_SECRET` — pour l'endpoint d'automatisations ;
   - `STORAGE_LOCAL_PATH` — chemin absolu du coffre documentaire.
   Ce fichier porte tous les secrets : il ne doit jamais entrer dans le dépôt
   ni transiter par messagerie.
3. **Bases de données → Ajouter une base de données** : choisir le serveur
   **`localhost:5432 (PostgreSQL v14.24)`** — surtout pas le MariaDB proposé
   par défaut —, créer la base et son utilisateur, puis composer
   `DATABASE_URL=postgresql://<user>:<motdepasse>@localhost:5432/<base>`.
4. **Sites Web & Domaines → `erp.lamethode.cm` → Node.js** :
   - *Version de Node.js* : **22.23.2** ;
   - *Root d'application* : le dossier où l'archive a été extraite ;
   - *Fichier de démarrage* : `server.js` (le panneau propose `app.js` par
     défaut) ;
   - *Mode d'application* : `production` ;
   - **Activer Node.js**, puis **NPM install**. C'est la seule étape longue
     (quelques minutes).

   Les secrets peuvent aussi être posés ici, dans *Variables d'environnement
   personnalisées*, plutôt que dans un fichier `.env` — au choix, mais pas les
   deux.

## 3. Migrer et démarrer

1. Toujours dans le panneau Node.js, onglet **Exécuter les commandes Node.js**
   (disponible une fois Node.js activé) → `npm run db:migrate:node`.
   La sortie doit se terminer par **« migrations appliquées : 13 »**. Chaque
   migration est une transaction : un échec ne laisse rien à moitié, on corrige
   et on relance.
2. **Redémarrer l'application**.
3. Ouvrir `https://<domaine>/api/health` : doit répondre `200`.
4. Si le site ne répond pas : même onglet → `npm run check:build`, qui dit ce
   qui manque (build, dépendances, variables) sans rien écrire.

## 4. Les données

Sur une base neuve, deux chemins s'excluent :

- **Reprise de l'existant** — restaurer la sauvegarde de l'ancien serveur
  (64 contribuables, factures, utilisateurs, journal d'audit) avant les
  migrations. Procédure et vérifications : `19-sauvegarde-et-migration.md`.
  Le coffre documentaire se restaure séparément, dans le dossier pointé par
  `STORAGE_LOCAL_PATH`.
- **Départ à neuf** — `db:seed` crée les rôles, les comptes de démonstration et
  des données d'exemple. À ne lancer que sur une base vide et jamais sur une
  base reprise : le seed purge.

## 5. Après le démarrage

Comme au document 21, et toujours à la main dans l'application :

1. **Rôles** — donner `Comptabilité générale` au Manager (quatre actions) et au
   Collaborateur (consulter, créer, modifier). Sinon seul l'administrateur voit
   le module.
2. **Premier exercice** de chaque contribuable — c'est lui qui dépose le plan
   SYSCOHADA, les journaux et les taxes.
3. **Barème de paie** — confirmer celui qui est livré, ou en saisir un daté.
4. **Tâches planifiées** — appeler quotidiennement l'endpoint d'automatisations
   avec `CRON_SECRET` (voir `13-deploiement.md`, § 5).
5. Contrôle : une écriture validée, la balance équilibrée, un bulletin imprimé.

## 6. Ce qui reste à savoir sur ce serveur

- **Aucun scan de sécurité dynamique** n'a été fait (outillage absent du poste).
- **Le domaine est marqué « non protégé » : il n'a pas encore de certificat.**
  À émettre avant la mise en service — Let's Encrypt est intégré à Plesk, c'est
  l'affaire de deux clics. Ce n'est pas cosmétique : `AUTH_URL` doit être en
  `https://`, et les cookies de session d'Auth.js sont refusés en clair.
