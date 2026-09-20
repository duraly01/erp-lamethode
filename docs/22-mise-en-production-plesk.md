# Mise en production sur le serveur Plesk (Newton Corp)

Rédigé le 20 septembre 2026. Remplace la « voie B » de `21-mise-en-production-E1-E6.md` :
l'hébergement cPanel est abandonné, le nouveau serveur est un Plesk
(`srv2-web-ns7.newtoncorp.fr:8443`), sans accès SSH.

Sans terminal, la méthode est celle qu'on connaît déjà : **on compile ici, on
dépose une archive, on clique dans le panneau.** Le `server.js` écrit pour
Passenger du temps de cPanel resservira tel quel — Plesk fait tourner les
applications Node.js avec le même Passenger.

## 0. Le point bloquant : PostgreSQL

L'ERP est écrit pour PostgreSQL et ne tournera sur rien d'autre — les
énumérations, `jsonb`, `numeric(14,2)`, les index partiels, le schéma
`drizzle` : tout en dépend. Une migration vers MySQL n'est pas un réglage,
c'est une réécriture.

**Le `docker-compose.prod.yml` du dépôt ne peut pas fournir la base ici.**
L'extension Docker de Plesk n'est offerte qu'à l'administrateur du serveur,
ne lance que des images déjà publiées sur un registre, et ne construit pas
depuis un `Dockerfile`. Avec un accès « panneau seulement », cette voie est
fermée.

Restent trois possibilités, par ordre de préférence :

| | Ce que ça suppose | Remarque |
| --- | --- | --- |
| **PostgreSQL du serveur** | que Newton Corp l'ait installé, ou accepte de l'installer | Le plus simple. Plesk gère PostgreSQL nativement dès qu'il est présent sur la machine. |
| **PostgreSQL managé ailleurs** | un compte chez un hébergeur de bases (Neon, Supabase, Scaleway…) | Fonctionne sans rien demander à Newton Corp. La base sort du serveur : à vérifier côté confidentialité des données clients. |
| **VPS avec SSH** | changer d'offre | Redonne accès à `docker-compose.prod.yml`, c'est-à-dire à la voie A du document 13. |

**À vérifier dans le panneau avant toute chose** (cinq minutes) :

1. **Bases de données → Ajouter une base de données** : la liste « Serveur de
   base de données » propose-t-elle un serveur **PostgreSQL**, ou seulement
   MySQL/MariaDB ?
2. **Sites Web & Domaines → [le domaine]** : y a-t-il une vignette **Node.js** ?
   Si non, l'extension n'est pas installée pour ce compte — c'est une demande à
   faire à l'hébergeur, elle est gratuite.
3. Quelle **version de Node.js** le panneau propose-t-il ? Il faut **20 ou
   plus** (Next.js 16). Si le maximum est 18, l'application ne démarrera pas.
4. Y a-t-il **Tâches planifiées** dans le menu ? C'est ce qui fera tourner les
   automatisations quotidiennes (retards, pénalités, rappels).

Tant que le point 1 n'a pas de réponse, le reste de ce document ne sert à rien :
**c'est la seule question qui décide si ce serveur convient.**

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
3. **Bases de données** → créer la base PostgreSQL et son utilisateur, puis
   reporter l'URL dans `DATABASE_URL`.
4. **Sites Web & Domaines → Node.js** :
   - *Version de Node.js* : 20 ou plus ;
   - *Racine de l'application* : le dossier où l'archive a été extraite ;
   - *Fichier de démarrage* : `server.js` ;
   - *Mode* : `production` ;
   - puis **NPM install**. C'est la seule étape longue (quelques minutes).

## 3. Migrer et démarrer

1. Toujours dans le panneau Node.js, bouton **Exécuter un script** →
   `db:migrate:node`.
   La sortie doit se terminer par **« migrations appliquées : 13 »**. Chaque
   migration est une transaction : un échec ne laisse rien à moitié, on corrige
   et on relance.
2. **Redémarrer l'application**.
3. Ouvrir `https://<domaine>/api/health` : doit répondre `200`.
4. Si le site ne répond pas : **Exécuter un script** → `check:build`, qui dit ce
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

- La page de connexion Plesk sert des messages de licence en français
  (« Plesk a expiré », « licence non prévue pour… »). Ce sont des gabarits
  présents sur toutes les pages de connexion Plesk : ils ne disent rien de
  l'état réel de cette licence. À confirmer une fois connecté.
- **Aucun scan de sécurité dynamique** n'a été fait (outillage absent du poste).
- Le certificat TLS du panneau est auto-signé sur le port 8443 ; celui du
  domaine public doit être un vrai certificat (Let's Encrypt est intégré à
  Plesk).
