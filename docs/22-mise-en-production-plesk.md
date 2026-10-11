# Mise en production sur le serveur Plesk (Newton Corp)

Rédigé le 20 septembre 2026. Remplace la « voie B » de `21-mise-en-production-E1-E6.md` :
l'hébergement cPanel est abandonné, le nouveau serveur est un Plesk
(`srv2-web-ns7.newtoncorp.fr:8443`), sans accès SSH.

Sans terminal, la méthode est celle qu'on connaît déjà : **on compile ici, on
dépose une archive, on clique dans le panneau.** Le `server.js` écrit pour
Passenger du temps de cPanel resservira — Plesk fait tourner les applications
Node.js avec le même Passenger — mais il a dû apprendre, en octobre, à réparer
les liens de Turbopack (§ 7.1).

> **En service depuis le 10 octobre 2026.** Les pièges rencontrés lors de la
> mise en service sont au § 7 : à lire avant tout nouveau déploiement.

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
| `drizzle/` | les 14 migrations et leur journal |
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
   deux : les variables du panneau **priment** sur `.env`, et une valeur
   périmée dans l'un masque la bonne dans l'autre (§ 7.2). En pratique,
   `DATABASE_URL` vit dans `.env` seul.

## 3. Migrer et démarrer

1. Toujours dans le panneau Node.js, onglet **Exécuter les commandes Node.js**
   (disponible une fois Node.js activé) → `npm run db:migrate:node`.
   La sortie doit se terminer par **« migrations appliquées : 14 »** et
   **46 tables**. Chaque migration est une transaction : un échec ne laisse
   rien à moitié, on corrige et on relance.

   Le migrateur annonce sa cible au démarrage (`🎯 cible : …`) et refuse une
   base distante non confirmée. Sur le serveur, la base est en `localhost` :
   il s'exécute sans rien de plus. Depuis un poste de travail, il faudrait
   `--distant` — garde-fou volontaire, la variable `DATABASE_URL_MIGRATION`
   du `.env` de développement pointant vers la production.

   Si la base a déjà été migrée par le migrateur standard de Drizzle, le suivi
   laissé dans le schéma `drizzle` est repris automatiquement au premier
   passage (ligne `↻ suivi repris…`) : les migrations déjà appliquées ne sont
   pas rejouées.
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

### 4 bis. La reprise, telle qu'elle a été répétée le 28 septembre 2026

Voie retenue : reprise de la sauvegarde complète du compte cPanel du
3 septembre (`backup-9.3.2026_11-15-10_lamethode.tar`, 1,7 Go), l'écart de
25 jours étant assumé par le cabinet.

**Ce que portait réellement la production.** Quatre migrations sur quatorze —
`0000` à `0003`. Autrement dit **E1 à E6 n'y ont jamais été déployés** : ni
comptabilité, ni paie, ni immobilisations, ni analytique, ni budget. Cette mise
en production n'est pas un déménagement, c'est la première livraison de l'ERP
comptable.

| | |
| --- | --- |
| contribuables | 64 (3 en IGS, 61 au réel) |
| utilisateurs · rôles | 6 · 4 |
| déclarations · factures · lignes | 6 · 3 · 10 |
| journal d'audit · paramètres | 113 · 10 |
| coffre documentaire | **vide** — table `documents` à zéro, aucun fichier dans la sauvegarde |

**Le dump n'est pas directement importable.** cPanel le range en
`psql/lamethode_erp.tar`, au format répertoire `pg_dump` (`toc.dat` plus des
fichiers numérotés), et il porte quatre propriétaires — `lamethode`,
`lamethode_erp`, `lamethode_erpuser`, `postgres` — dont aucun n'existe sur le
Plesk. Conversion :

```bash
tar -xf backup-*.tar 'backup-*/psql/lamethode_erp.tar'
mkdir dump && tar -xf backup-*/psql/lamethode_erp.tar -C dump
pg_restore --no-owner --no-privileges --format=directory --file=lamethode_erp.sql dump
grep -vE '^\\(un)?restrict ' lamethode_erp.sql > lamethode_erp-pour-plesk.sql
```

Le dernier filtre retire deux métacommandes `\restrict` posées par les
`pg_restore` récents : psql 14 ne les connaît pas. Résultat : 120 Ko de SQL
simple, sans `OWNER TO`.

**Séquence vérifiée sur base jetable.** Restauration puis migration :

```
↻ suivi repris depuis drizzle.__drizzle_migrations (4 migration(s))
▸ 0004_e1_comptabilite_generale … ▸ 0013_s1_gc_referentiel
✅ 10 migration(s) appliquée(s)
   tables : 14 → 46 · contribuables : 64, intacts
```

La reprise du suivi hérité est ce qui rend l'opération possible : sans elle, le
migrateur croirait la base vierge et rejouerait les quatorze migrations sur une
base pleine.

Une erreur bénigne apparaît à la restauration — `schema "public" already
exists` : le dump recrée un schéma qui existe toujours. Sans conséquence.

**Le suivi des migrations doit être déplacé dans `public`.** Constaté au
premier essai réel sur le serveur : l'utilisateur de la base n'en est pas le
propriétaire et n'a pas le privilège `CREATE` dessus. Le `CREATE SCHEMA
drizzle;` du dump échoue donc sur `permission denied for database`
(SQL 42501), et la transaction annule toute la restauration. Il faut réécrire
le dump avant de le déposer :

```bash
sed -e '/^CREATE SCHEMA drizzle;$/d' \
    -e 's/drizzle\.__drizzle_migrations/public.__drizzle_migrations/g' \
    dump.sql > dump-pour-plesk.sql
```

Le migrateur s'en accommode sans rien changer : il cherche
`public.__drizzle_migrations` en premier et y trouve directement les quatre
migrations déjà appliquées. C'est la même limite de privilège qui a imposé le
migrateur maison — elle se paie une deuxième fois ici.

**Le panneau n'exécute que des gestionnaires de paquets.** Le sélecteur de
« Exécuter les commandes Node.js » propose `npm`, `yarn`, `pnpm`, jamais
`node`. Pour lancer un script directement :

```
exec -- node scripts/restore.mjs dump-pour-plesk.sql
```

soit `npm exec -- node …`.

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
- ~~Le domaine n'a pas de certificat~~ — **émis le 10 octobre 2026** (Let's
  Encrypt, `erp.lamethode.cm` seul, validation HTTP), renouvelé
  automatiquement 30 jours avant l'échéance. Il ne peut être émis qu'une fois
  le DNS basculé : Let's Encrypt vérifie que le nom pointe sur ce serveur.

## 7. Les pièges de la mise en service — 10 et 11 octobre 2026

Chacun a coûté un diagnostic. Aucun n'est propre à ce serveur : ils
reviendront à chaque déploiement si on les oublie.

### 7.1 Les liens de Turbopack, cassés par une archive faite sous Windows

**Symptôme.** `/login` s'affiche (page précalculée), mais toute page qui touche
la base répond `500 Internal Server Error` en texte brut — `/api/health`
compris, alors que cette route rattrape les erreurs de base et devrait
répondre `{"ok":false}`. Le plantage a donc lieu au chargement du code.

**Cause.** Next 16 (Turbopack) charge les paquets externes (`pg`, `pdfkit`,
`rimraf`) par un alias haché, `.next/node_modules/pg-587764f78a6c7a9c`, lien
symbolique vers `node_modules/pg`. Sous Windows, ce lien est écrit en chemin
**absolu** (`C:/Users/…/node_modules/pg`). Sur le serveur Linux il ne mène
nulle part : `Cannot find package 'pg-587764f78a6c7a9c'`.

**Correction, désormais automatique.** `server.js` relit au démarrage les
traces du build (`.next/server/**/*.nft.json`) et le contenu de
`.next/node_modules`, puis recrée en relatif (`../../node_modules/<paquet>`)
chaque lien cassé. Un lien sain n'est pas touché ; un paquet absent de
`node_modules` est signalé (« lancer NPM install »), jamais inventé. Les
hachages changeant à chaque build, rien n'est codé en dur. Testé sous Linux
(Node 22) : liens absents, cassés, sains, paquet à portée `@scope`, paquet
manquant.

À la main, si besoin (onglet *Exécuter les commandes Node.js*) :

```text
exec -- node -e "const fs=require('fs'),path=require('path');const d='.next/node_modules';for(const e of fs.readdirSync(d)){const pkg=e.replace(/-[0-9a-f]{16}$/,'');const p=path.join(d,e);fs.rmSync(p,{force:true});fs.symlinkSync(path.join('..','..','node_modules',pkg),p,'dir');console.log(e,'->',fs.realpathSync(p))}"
```

### 7.2 Les variables du panneau priment sur `.env`

`server.js` charge `.env` avec `dotenv`, qui **n'écrase jamais** une variable
déjà définie. Or Passenger injecte d'abord les *Variables d'environnement
personnalisées* du panneau. Le 10 octobre, la `DATABASE_URL` du panneau —
même hôte, même base — était refusée, tandis que celle de `.env` fonctionnait :
`/api/health` répondait `{"ok":false}` en ligne et `{"ok":true}` en test. Elle
a été retirée du panneau.

Corollaire : les commandes lancées depuis l'onglet *Exécuter* ne reçoivent
**pas** les variables du panneau, seulement `.env`. Un secret changé dans le
panneau doit l'être aussi dans `.env`, sinon les scripts (`automations`,
`migrate`) tournent avec l'ancien.

### 7.3 Le panneau n'affiche que la sortie standard

Les erreurs de Next partent sur `console.error`, que l'onglet *Exécuter*
n'affiche pas, et le journal d'erreurs du domaine ne montre que les accès.
Pour voir une erreur, rejouer l'application dans l'onglet en redirigeant :
`console.error=(...a)=>console.log('ERR>',...a)` en tête du `node -e`.

### 7.4 La page par défaut de Plesk masque l'application

Plesk dépose un `index.html` dans la racine web (`public/`). nginx le sert
avant de passer la main à Passenger : `/` affichait « Domain Default page ».
Supprimé ; `public/` ne doit contenir que `.well-known` (l'application n'a pas
de dossier `public` à elle).

### 7.5 La bascule DNS

- La zone `lamethode.cm` est chez **nitrowebhost** (ns3/ns4.nitrowebhost.co.uk),
  ni chez Plesk ni chez le registraire.
- Méthode suivie : TTL de `erp` abaissé de 14400 à **300** sans changer
  l'adresse, attente de l'ancien TTL (4 h), puis adresse changée de
  `95.217.84.98` à **`178.32.213.243`**, puis certificat.
- **Ne jamais cliquer « Restaurer » dans l'éditeur de zone** : cela a remis le
  TTL à 14400 et relancé l'attente de 4 h.
- Vérifier sur les serveurs faisant autorité, pas seulement sur un résolveur
  public (`Resolve-DnsName erp.lamethode.cm -Server ns3.nitrowebhost.co.uk`).
- **Tester le nouveau serveur avant la bascule**, sans toucher au DNS :
  `curl --resolve erp.lamethode.cm:443:178.32.213.243 https://erp.lamethode.cm/api/health`.
  C'est ce test qui a révélé les pièges 7.1 à 7.4 alors que les utilisateurs
  étaient encore sur l'ancien serveur.

### 7.6 Changer un secret sans couper le service

- Produire les secrets en **hexadécimal** (`randomBytes(24).toString('hex')`) :
  un `@`, `:`, `/`, `+` ou `#` casse `DATABASE_URL`.
- Mot de passe de la base : le changer dans Plesk (*Bases de données → Gestion
  des utilisateurs*) **puis** dans `.env`, sans pause — l'ERP est coupé entre
  les deux. **Lire le message de confirmation de Plesk** : le 11 octobre, un
  premier changement ne s'est pas enregistré, et la base refusait le nouveau
  mot de passe (`28P01`).
- L'éditeur de code de Plesk **ajoute** au lieu de remplacer quand on colle un
  fichier entier : ne modifier que la valeur, sur sa ligne.

### 7.7 Supprimer un sous-domaine supprime sa racine

Plesk efface le répertoire de la racine du sous-domaine. Le sous-domaine de
test `erp2` pointait sur `/erp.lamethode.cm/public` : le supprimer tel quel
aurait effacé l'application. Changer sa racine d'abord, puis supprimer. (Le
test par `erp2` était de toute façon voué à l'échec : Plesk refuse deux
applications Node.js sur la même racine.)

### 7.8 La corbeille

Ce Plesk n'a pas de bouton « Corbeille » : les fichiers supprimés vont dans le
dossier `.trash` du *Répertoire principal*, qu'il faut vider à la main. Les
dumps de reprise (données des 64 contribuables) y sont restés jusqu'au
11 octobre.
