# Mise en production des phases E1 à E6 — revue et procédure

Revue du 15 septembre 2026. Depuis le dépôt initial (`73517d4`, l'ERP tel que
déployé), trente-neuf commits ont ajouté la comptabilité générale, les états
financiers et la DSF, la saisie assistée et la banque, la paie, les
immobilisations, l'analytique et le budget. Aucune de ces phases n'est encore
en production. Ce document dit ce qui a été vérifié, ce qui a été corrigé, et
comment livrer.

## 1. Ce que la revue a trouvé et corrigé

| Constat | Conséquence en production | Correctif |
| --- | --- | --- |
| La migration 0010 faisait `ALTER TYPE … ADD VALUE` | PostgreSQL 9.6 le refuse dans une transaction : la migration aurait échoué, et toutes les suivantes avec elle | Type recréé sous `_v2`, colonne basculée, ancien type retiré, nouveau renommé — même résultat, en transaction |
| Le build allait chercher la police Inter sur Google Fonts | Sur un poste sans accès à ce domaine, `next build` échoue ; l'hébergeur ne compile rien | Police servie depuis le dépôt (`@fontsource-variable/inter`, `next/font/local`) |
| Les rôles MANAGER et COLLAB du seed n'avaient aucun droit `comptabilite` | Seul l'administrateur aurait pu tenir les livres | Seed corrigé — et en production, les rôles existants sont à compléter à la main (§ 4) |
| Les suppressions d'axes, de sections et de budgets, et les changements de lignes de budget n'étaient pas journalisés | Trou dans le journal d'audit | Audit ajouté |

Vérifié par ailleurs : toutes les routes API sont authentifiées (`requirePermission`
ou session explicite), toutes les entrées passent par un schéma Zod, aucun
nouveau paramètre d'environnement n'est requis, le barème de paie livré
s'applique tant que le cabinet n'en a pas saisi.

## 2. La répétition sur PostgreSQL 9.6

La base de production est en 9.6 et n'est pas joignable depuis l'extérieur.
La chaîne complète a donc été rejouée sur un 9.6 local, avec le migrateur de
production — c'est la seule preuve qui vaille, et elle se refait en cinq
minutes avant chaque livraison :

```bash
docker run -d --name pg96 -p 5496:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=app_db postgres:9.6
```

```bash
DATABASE_URL_MIGRATION="postgresql://postgres:test@127.0.0.1:5496/app_db" node scripts/migrate.mjs
```

```bash
DATABASE_URL="postgresql://postgres:test@127.0.0.1:5496/app_db" DATABASE_URL_MIGRATION= npx tsx src/db/seed.ts
```

```bash
DATABASE_URL="postgresql://postgres:test@127.0.0.1:5496/app_db" DATABASE_URL_MIGRATION= npx vitest run --config vitest.integration.config.ts
```

Résultat du 15 septembre : 13 migrations appliquées, 39 tables, 176 tests
d'intégration verts. Le SQL d'exécution des six phases — pas seulement le
DDL — est compatible 9.6.

```bash
docker rm -f pg96
```

## 3. Livrer

### Voie A — nouveau serveur (Docker, PostgreSQL 16)

C'est la voie décrite dans `13-deploiement.md` et `19-sauvegarde-et-migration.md`.
L'application applique ses migrations au démarrage ; il n'y a rien de
particulier à cette livraison.

### Voie B — hébergement cPanel actuel

**Caduque depuis le 20 septembre 2026** : le cabinet a quitté cPanel pour un
serveur Plesk (`srv2-web-ns7.newtoncorp.fr`), sans accès SSH lui non plus. La
procédure adaptée — archive, boutons du panneau, migrateur sans WebAssembly —
est dans `22-mise-en-production-plesk.md`, qui pose aussi la question qui
décide de tout : ce serveur offre-t-il PostgreSQL ?

## 4. Après la livraison, à la main, dans l'application

1. **Rôles** — Paramètres → Rôles : donner `Comptabilité générale` au rôle
   Manager (les quatre actions) et au rôle Collaborateur (consulter, créer,
   modifier). Sans cela, seul l'administrateur voit le module. `Paie` est déjà
   accordée aux deux.
2. **Premier exercice de chaque contribuable** — Comptabilité → Ouvrir un
   exercice. C'est lui qui dépose le plan SYSCOHADA, les journaux et les taux
   de taxe du contribuable. Rien ne se fait en masse : un dossier à la fois,
   c'est voulu.
3. **Barème de paie** — Paramètres → Barème de paie : le barème livré
   s'applique par défaut ; le confirmer, ou en saisir un daté.
4. **Contrôle** : une écriture saisie et validée, la balance équilibrée, un
   bulletin imprimé.

## 5. Ce qui reste à faire valider par l'expert-comptable

Ces conventions sont portées en données, pas enfouies dans le code, et se
changent sans livraison :

- la base de **360 jours** de l'amortissement linéaire et les **coefficients du
  dégressif** (1,5 / 2 / 2,5) — `src/lib/comptable/amortissement.ts` ;
- la **numérotation des notes annexes** — `src/lib/comptable/notes-annexes.ts` ;
- les taux du **barème de paie** livré — `src/lib/paie/bareme.ts`.

## 6. Ce que cette revue n'a pas fait

- **Aucun scan de sécurité dynamique** : l'outillage (HawkScan) n'est ni
  installé ni autorisé sur ce poste. À prévoir avant l'ouverture à des
  utilisateurs hors cabinet.
- **Pas de test de charge**. Le cabinet a quelques utilisateurs et 64 dossiers ;
  ce n'est pas le risque du moment.
- **PostgreSQL 9.6 reste hors support** depuis novembre 2021. Cette livraison
  s'en accommode ; la suivante devrait se faire sur le nouveau serveur.
