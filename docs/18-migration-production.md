# Migration de la base de production — journal et contraintes

Migration du 5 août 2026, de l'état initial vers le schéma des phases 9 à 11.
Ce document existe surtout pour la prochaine fois : l'hébergement impose des
contraintes qui ne se devinent pas.

## L'environnement, tel qu'il est

| | |
| --- | --- |
| Hébergement | cPanel, CloudLinux — **pas de Terminal ni de SSH** |
| Exécution de commandes | Setup Node.js App → *Run JS script*, ou Tâches Cron |
| Racine applicative | `/home/lamethode/erp` |
| PostgreSQL | **9.6.22** — fin de support depuis novembre 2021 |
| Accès distant à la base | **Fermé** — le port 5432 réinitialise toute connexion externe |
| Limite mémoire | 4 Go d'espace d'adressage (LVE) |

## Quatre obstacles rencontrés, et leur parade

### 1. `drizzle-kit migrate` ne peut pas tourner sur ce serveur

Il instancie un module WebAssembly pour lire `drizzle.config.ts`, ce que la
limite LVE refuse : *« Cannot allocate Wasm memory »*.

**Parade** — `scripts/migrate.mjs`, qui utilise le migrateur de `drizzle-orm`
en JavaScript pur. Même dossier `drizzle/`, même table de suivi, aucun
WebAssembly. Commande : `npm run db:migrate:node`.

### 2. Aucun journal de migrations

La base affichait 11 tables et 64 contribuables, mais
`drizzle.__drizzle_migrations` était **vide** : le schéma initial avait été
poussé sans passer par les migrations. Le migrateur voulait donc rejouer `0000`
sur une base déjà peuplée.

**Parade** — `scripts/baseline.mjs` (`npm run db:baseline`) constate ce qui est
réellement en base, migration par migration, et n'inscrit au journal que ce
qu'il a vu. Aucun DDL. À relancer si la base est un jour recréée.

### 3. `ALTER TYPE … ADD VALUE` interdit en transaction

PostgreSQL 9.6 refuse cette instruction dans un bloc transactionnel, et chaque
migration s'exécute dans une transaction — ce qui est souhaitable, c'est ce qui
garantit qu'aucune migration ne s'applique à moitié.

### 4. Les types énumérés n'appartiennent pas à l'application

C'est la contrainte structurante. Constat de `npm run db:privileges` :

- les **11 tables** appartiennent à `lamethode_erp`, dont l'utilisateur
  applicatif `lamethode_erpuser` est membre → `ALTER TABLE` autorisé ;
- les **9 types énumérés** appartiennent à `lamethode` → ni `ALTER TYPE`,
  ni `DROP TYPE`, ni changement de propriétaire (*« must be owner of type »*).

**Parade retenue** — ne jamais toucher aux types existants. Les trois
énumérations qui devaient évoluer ont été **recréées sous un nom suffixé**, et
les colonnes y ont été basculées :

| Type d'origine (vestige) | Type en service |
| --- | --- |
| `regime_fiscal` | `regime_fiscal_v2` |
| `declaration_type` | `declaration_type_v2` |
| `periodicite` | `periodicite_v2` |
| `role_nom` | *(plus utilisé — `roles.nom` est passé en `varchar`)* |

Les quatre types d'origine subsistent en base, inutilisés. Ils sont déclarés
dans `src/db/schema.ts` sous les noms `*LegacyEnum` : le schéma reste ainsi
fidèle à la réalité, et `drizzle-kit generate` ne tente pas de les supprimer à
chaque exécution.

## Pour revenir à des noms propres

Le correctif définitif tient en neuf instructions, à faire exécuter par
l'hébergeur en superutilisateur :

```sql
ALTER TYPE public.declaration_type   OWNER TO lamethode_erp;
ALTER TYPE public.notification_canal OWNER TO lamethode_erp;
ALTER TYPE public.notification_type  OWNER TO lamethode_erp;
ALTER TYPE public.periodicite        OWNER TO lamethode_erp;
ALTER TYPE public.regime_fiscal      OWNER TO lamethode_erp;
ALTER TYPE public.role_nom           OWNER TO lamethode_erp;
ALTER TYPE public.statut_acf         OWNER TO lamethode_erp;
ALTER TYPE public.statut_declaration OWNER TO lamethode_erp;
ALTER TYPE public.statut_penalite    OWNER TO lamethode_erp;
```

Elles ne modifient aucune donnée ni structure. Une fois passées :
supprimer les types vestiges, renommer les `*_v2` vers leur nom d'origine, et
retirer les `*LegacyEnum` du schéma. `npm run db:fix-owner` vérifie et applique
ce qui est possible.

## Outils laissés en place

| Commande | Rôle |
| --- | --- |
| `npm run db:check` | Diagnostic de connexion et état de la base (lecture seule) |
| `npm run db:privileges` | Qui possède quelles tables et quels types (lecture seule) |
| `npm run db:baseline` | Aligne le journal sur une base déjà en production |
| `npm run db:migrate:node` | Applique les migrations sans WebAssembly |
| `npm run db:fix-owner` | Tente de rendre les types au propriétaire de la base |
| `npm run db:migrate` | drizzle-kit — pour le poste de développement uniquement |

## Résultat

```
── AVANT ──                    ── APRÈS ──
migrations appliquées : 2      migrations appliquées : 3
tables dans public    : 11     tables dans public    : 14
contribuables         : 64     contribuables         : 64 (REEL=64)
tables de facturation : 0/3    tables de facturation : 3/3
```

Aucune perte de données. Les quatre tentatives infructueuses n'ont laissé
aucune trace : chaque migration s'exécute dans une transaction annulée en bloc.

## À traiter

**PostgreSQL 9.6 n'est plus maintenu depuis novembre 2021** — aucun correctif,
y compris de sécurité. À porter à l'ordre du jour avec l'hébergeur. Les
migrations resteront compatibles 9.6 en attendant.
