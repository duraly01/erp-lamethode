# Sauvegarde de l'ERP et changement de serveur

Rédigé le 2 septembre 2026, avant le départ de l'hébergement cPanel actuel.

## Ce qu'il faut sauvegarder, par ordre d'irremplaçabilité

| # | Élément | Emplacement | Si on le perd |
| --- | --- | --- | --- |
| 1 | **Base PostgreSQL** `lamethode_erp` | serveur, port 5432 local | 64 contribuables, déclarations, factures, utilisateurs, journal d'audit — **définitivement perdus** |
| 2 | **Coffre documentaire** | `/home/lamethode/erp/storage/` | les pièces déposées par le cabinet — **définitivement perdues** |
| 3 | **Fichier `.env`** | `/home/lamethode/erp/.env` | secrets à régénérer, sessions invalidées, SMTP à reconfigurer |
| 4 | Code source | dépôt local du poste de travail | rien : il est compilable à volonté |

Les points 1 et 2 n'existent nulle part ailleurs. Les points 3 et 4 sont
reconstituables, le 3 au prix de quelques réglages.

Ce qu'il est **inutile** d'emporter : `node_modules` et `.next`, tous deux
régénérés à l'installation.

## Contraintes de l'hébergement actuel

Elles dictent la méthode :

- ni Terminal ni SSH ;
- le panneau *Setup Node.js App* échoue sur `cagefs_enter: Unable to fork` —
  les limites de ressources du compte sont atteintes, aucun processus Node
  supplémentaire ne démarre ;
- les **tâches Cron fonctionnent** pour des commandes légères : c'est notre
  seule voie d'exécution.

## 1. La base de données

### Voie A — la sauvegarde native de cPanel

cPanel → **Sauvegarde**. Si la section *Bases de données PostgreSQL* est
proposée, un clic sur `lamethode_erp` télécharge un fichier `.sql.gz`. C'est le
chemin le plus court, et il ne consomme aucun processus du compte.

### Voie B — `pg_dump` par tâche Cron

À utiliser si la voie A n'est pas proposée.

**Étape 1.** Dans le Gestionnaire de fichiers, créer `/home/lamethode/.pgpass`
contenant une seule ligne :

```
127.0.0.1:5432:lamethode_erp:lamethode_erpuser:LE_MOT_DE_PASSE
```

Puis **permissions 0600** sur ce fichier — `pg_dump` refuse de le lire s'il est
accessible à d'autres. Ce fichier contient le mot de passe : il est saisi par le
cabinet, jamais transmis.

**Étape 2.** Tâche Cron, une fois par minute :

```
pg_dump -h 127.0.0.1 -U lamethode_erpuser -d lamethode_erp -Fp --no-owner --no-privileges -f /home/lamethode/sauvegarde-erp.sql
```

**Étape 3.** Supprimer la tâche Cron, puis supprimer `.pgpass`.

`--no-owner --no-privileges` n'est pas un détail de confort. Sur ce serveur les
tables appartiennent à `lamethode_erp` et les types énumérés à `lamethode` —
deux propriétaires distincts, dont aucun n'existera sur la nouvelle machine.
Sans ces options, la restauration échouerait sur des rôles introuvables.

Le format texte (`-Fp`) est préféré au format compressé : il se lit, se
vérifie, et se restaure d'un PostgreSQL 9.6 vers un PostgreSQL 16 sans outil
particulier.

## 2. Le coffre documentaire

Gestionnaire de fichiers → sélectionner `/home/lamethode/erp/storage` → clic
droit → **Compress** → format `tar.gz` → puis **Télécharger** l'archive.

Ne pas se contenter de constater que le dossier existe : vérifier que l'archive
téléchargée s'ouvre et contient bien des sous-dossiers numérotés — un par
contribuable.

## 3. Le fichier `.env`

Gestionnaire de fichiers → `/home/lamethode/erp/.env` → **Télécharger**.

Ce fichier porte le mot de passe de la base, le secret d'authentification et le
mot de passe SMTP. Il se conserve hors de tout dépôt de code et hors de tout
partage.

`AUTH_SECRET` peut être régénéré sur le nouveau serveur — la seule conséquence
est que chacun devra se reconnecter.

## Vérifier la sauvegarde avant de partir

Une sauvegarde non vérifiée n'est pas une sauvegarde. Ouvrir le fichier `.sql`
dans un éditeur de texte et contrôler trois choses :

1. il se termine par une ligne `-- PostgreSQL database dump complete` — sans
   elle, le fichier est tronqué ;
2. il contient `COPY public.contribuables` suivi de **64 lignes de données** ;
3. il contient `COPY public.factures`, `COPY public.users` et
   `COPY public.parametres`.

Le fichier attendu pèse quelques centaines de kilo-octets. Un fichier de
quelques octets signale un échec silencieux.

## Ce que doit offrir le nouveau serveur

L'hébergement actuel a coûté quatre tentatives de migration et deux
déploiements manqués. Les causes sont identifiées, et toutes disparaissent avec
une machine correctement dimensionnée.

| Besoin | Pourquoi | Minimum |
| --- | --- | --- |
| **Accès SSH** | tout le reste en découle | indispensable |
| **Mémoire** | `next build` et `drizzle-kit` échouent sous la limite LVE de 4 Go | 2 Go de RAM dédiés |
| **PostgreSQL ≥ 13** | la 9.6 n'est plus maintenue depuis novembre 2021 et interdit `ALTER TYPE … ADD VALUE` en transaction | 16 recommandé |
| **Node.js ≥ 20** | Next.js 16 | 22 ou 24 |
| **Docker** *(optionnel)* | le dépôt fournit déjà `docker-compose.prod.yml` : PostgreSQL 16, application, nginx | fortement conseillé |

Avec Docker, l'installation se réduit à un `docker compose up`. Sans Docker, il
faut Node, PostgreSQL et un reverse proxy installés à la main.

## Ce que la migration permettra de nettoyer

Trois contournements ont été imposés par l'hébergement actuel, et ne survivront
pas au déménagement :

1. **Les types énumérés suffixés `_v2`.** `regime_fiscal_v2`,
   `declaration_type_v2`, `periodicite_v2` existent parce que les types
   d'origine appartenaient à un rôle que l'application ne contrôlait pas. Sur
   une base restaurée proprement, ils reprendront leur nom, et les
   déclarations `*LegacyEnum` de `src/db/schema.ts` disparaîtront.
2. **La livraison par archive.** Compilation locale, `tar.gz`, extraction
   manuelle : remplacé par un `git pull` suivi d'un `npm run build`.
3. **Les tâches Cron de dépannage.** Migrations et scripts d'administration
   redeviennent de simples commandes.

## Ordre des opérations le jour du transfert

1. Sauvegarder base, coffre et `.env` — et **vérifier** la sauvegarde.
2. Préparer le nouveau serveur : PostgreSQL, base et rôle applicatif créés.
3. Restaurer :
   `psql -h <hôte> -U <utilisateur> -d lamethode_erp -f sauvegarde-erp.sql`
4. Restaurer le coffre documentaire dans le dossier pointé par
   `STORAGE_LOCAL_PATH`.
5. Recopier le `.env` en corrigeant `DATABASE_URL`, `AUTH_URL` et `APP_URL`.
6. `npm ci`, `npm run build`, démarrer.
7. Contrôler : `/api/health`, puis 64 contribuables et les factures à l'écran.
8. **Ne basculer le DNS qu'après ce contrôle.** L'ancien serveur reste debout
   tant que le nouveau n'a pas fait ses preuves.
9. Conserver la sauvegarde au moins un mois après la bascule.
