# Enrichissement de l'ERP LaMéthode à partir du projet MOABI

> Version 0.1 du 2026-09-09. Document de cadrage — aucun code écrit à ce stade.
> Source du périmètre fonctionnel : `Cabinet LaMéthode/Moabi-ERP/docs/`.

---

## 1. Ce qui change de nature

L'ERP actuel est un **outil de gestion de cabinet** : il suit les obligations fiscales et
sociales des contribuables, leurs pièces, leurs pénalités, et facture les honoraires.

Il ne fait pas ce que le cabinet **vend** : tenir la comptabilité de ses clients.

Les modules MOABI comblent exactement ce vide. L'enrichissement consiste donc à faire
passer l'ERP de **suivi des obligations** à **production comptable**.

```
AUJOURD'HUI                              APRÈS ENRICHISSEMENT

Comptabilité tenue ailleurs              Comptabilité tenue DANS l'ERP
  (Sage, Excel…)                                    │
        │                                           ▼
        ▼                                  Balance générale
  Saisie manuelle du montant                        │
  de la déclaration                                 ▼
        │                              Déclaration TVA / DSF / Acompte IS
        ▼                                    CALCULÉE, pas saisie
  declarations (suivi)                              │
                                                    ▼
                                            declarations (existant)
```

**La boucle se ferme.** Aujourd'hui une déclaration est une ligne de suivi avec un statut.
Demain son montant est le produit de la balance. C'est le gain de valeur principal, et il
ne s'obtient qu'avec le noyau comptable.

---

## 2. L'insight qui rend l'opération peu coûteuse

Le modèle de données MOABI est construit autour de `societe`. L'ERP LaMéthode possède déjà
cette table, sous un autre nom :

| MOABI | erp.lamethode.cm | Déjà présent |
|---|---|---|
| `societe` | **`contribuables`** | nom, NIU, centre d'impôts, régime fiscal (REEL/IGS), classe IGS, CGA, secteur d'activité, CA annuel, responsable, adresse de facturation |
| `utilisateur` + rôles | `users`, `roles`, permissions ressource×action | ✅ complet |
| `journal_audit` | `audit_log` | ✅ complet |
| `parametre` | `parametres` (jsonb par clé) | ✅ complet |
| Stockage des pièces | `documents` + `lib/storage.ts` | ✅ complet — devient le stock de justificatifs |
| Exports | `exceljs` + `pdfkit` déjà câblés | ✅ complet |
| Notifications | 5 canaux (dashboard/email/SMS/WhatsApp/push) | ✅ complet |

**Autrement dit, la phase P0 « socle » du plan MOABI — 6 à 8 semaines de travail — est
déjà faite et éprouvée en production.** Les 64 contribuables enregistrés sont déjà les
64 sociétés dont on peut tenir les livres.

C'est ce qui fait passer le projet de 18–24 mois (MOABI de zéro) à **environ 3 mois pour
la première brique réellement transformante**.

---

## 3. Cartographie des 20 modules MOABI

| Module MOABI | État actuel | Décision |
|---|---|---|
| Utilisateurs, rôles & sécurité | ✅ Fait | Rien |
| Paramétrage & référentiels | ✅ Fait | Étendre (plan comptable, journaux, taux datés) |
| Administration & gouvernance | ✅ Fait | Rien |
| Intégration des flux & données | 🟡 Partiel (import CSV contribuables, exports) | Étendre en E2/E3 |
| Pilotage & reporting | 🟡 Partiel (`/analytics`) | Étendre en E2 |
| Ventes & facturation | ⚠️ **Ambigu — voir §4** | Distinguer |
| Trésorerie & caisse | 🟡 Partiel (`reglements` sur factures cabinet) | E3 |
| **Comptabilité générale & SYSCOHADA** | ❌ **Absent** | **E1 — priorité absolue** |
| Immobilisations | ❌ Absent | E5 (requis pour les Notes de la DSF) |
| Achats & fournisseurs | ❌ Absent | E3 |
| RH & paie | 🟡 `cnps_cotisations` suit les cotisations, pas de bulletin | E4 |
| Comptabilité analytique | ❌ Absent | E5 |
| Budget & contrôle budgétaire | ❌ Absent | Ultérieur |
| Stocks & inventaire | ❌ Absent | Ultérieur — peu de clients concernés |
| Consolidation multi-entités | ❌ | **Hors périmètre** |
| Passerelle IFRS | ❌ | **Hors périmètre** |
| Courrier & transmissions | ❌ | **Hors périmètre** — `documents` suffit |
| Contrats & projets | ❌ | **Hors périmètre** |
| Production / GPAO | ❌ | **Hors périmètre** — pas la clientèle du cabinet |
| Gestion agricole | ❌ | **Hors périmètre** |

Six modules sur vingt sont retenus, deux sont déjà faits, six sont écartés d'emblée.
Le périmètre passe de « ERP généraliste » à « outil de production d'un cabinet comptable » —
c'est beaucoup plus petit, et c'est ce dont le cabinet a réellement besoin.

---

## 4. Piège à éviter : deux facturations qui n'ont rien à voir

La table `factures` existante est **la facturation du cabinet à ses clients** (honoraires,
impôts refacturés, CNPS, frais — cf. `categorie_ligne`). Elle ne doit surtout pas servir à
enregistrer les factures **que le client émet à ses propres clients**.

Ce sont deux objets distincts, avec des numérotations, des TVA et des comptes différents.

**Convention retenue :** toutes les tables du domaine comptable client sont préfixées
`cpta_` (`cpta_compte`, `cpta_ecriture`, `cpta_facture_vente`…). Aucune ambiguïté possible
dans le schéma, les requêtes ou les migrations.

---

## 5. Phasage

| Phase | Contenu | Charge estimée |
|---|---|---|
| **E1 — Noyau comptable** | Plan comptable SYSCOHADA par contribuable, exercices, journaux, séquences, écritures immuables, lettrage, grand livre, balance, journal centralisateur | 6 – 8 sem. |
| **E2 — États financiers & bouclage déclaratif** | Bilan, Compte de résultat, Tableau des flux, Notes · Système minimal de trésorerie · **DSF et TVA calculées depuis la balance** et injectées dans `declarations` | 4 – 6 sem. |
| **E3 — Saisie assistée** | Tiers du contribuable, factures de vente et d'achat → écritures automatiques, banque/caisse, rapprochement bancaire | 6 – 8 sem. |
| **E4 — Paie** | Bulletins, CNPS/IRPP/CFC/FNE/TDL avec barèmes datés, DIPE, écritures de paie — extension de `cnps_cotisations` | 6 – 8 sem. |
| **E5 — Immobilisations & analytique** | Fiches, plans d'amortissement, écritures, tableau des immobilisations · axes analytiques | 4 – 6 sem. |
| *Ultérieur* | Budget, stocks, portail client | — |

**Jalon utile : fin de E2.** À ce stade le cabinet tient les livres de ses clients dans
l'ERP et en sort les états financiers et la DSF. Environ **3 mois**. Tout le reste est
du confort par-dessus quelque chose qui sert déjà tous les jours.

---

## 6. Modèle de données E1

Conventions de l'existant à respecter : **`serial` integer** en clé primaire (pas d'uuid),
`numeric(14,2)` pour les montants, `created_at`/`updated_at`, commentaires en français.

| Table | Rôle |
|---|---|
| `cpta_exercice` | `contribuable_id`, libellé, dates début/fin, statut `OUVERT`/`CLOS`/`VERROUILLE`, exercice précédent |
| `cpta_compte` | Plan comptable par contribuable : numéro, libellé, classe 1-9, type, collectif, lettrable, rapprochable |
| `cpta_journal` | Code (`AC`,`VE`,`BQ`,`CA`,`OD`,`AN`), libellé, type, compte de contrepartie |
| `cpta_sequence` | Compteur transactionnel contribuable × journal × exercice — **numérotation sans trou** |
| `cpta_tiers` | Clients/fournisseurs **du contribuable**, comptes auxiliaires rattachés |
| `cpta_ecriture` | En-tête de pièce : exercice, journal, n° de pièce, date, libellé, statut `BROUILLON`/`VALIDEE`/`CONTREPASSEE`, origine + id d'origine |
| `cpta_ligne_ecriture` | Compte, tiers, libellé, débit, crédit, lettrage, échéance |
| `cpta_lettrage` | Regroupement des lignes soldées d'un compte de tiers |
| `cpta_rapprochement` | Rapprochement bancaire : en-tête et lignes pointées |
| `cpta_taxe` | Taux de TVA et retenues **avec période de validité** (`valide_du`/`valide_au`) |

Un **plan comptable SYSCOHADA révisé de référence** est livré en données de seed et copié
à l'ouverture du premier exercice d'un contribuable, qui peut ensuite le personnaliser.

### Invariants à faire tenir par la base, pas par la discipline

1. `CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0))`
2. Équilibre `Σ débit = Σ crédit` vérifié à la validation.
3. `UPDATE`/`DELETE` refusés sur une écriture `VALIDEE` — correction par contre-passation.
4. Aucune écriture dans un exercice `CLOS` ou `VERROUILLE`.
5. Numéro de pièce attribué à la validation, sous verrou transactionnel.
6. Toute écriture générée par un module conserve `origine_type` + `origine_id`.
7. Taux fiscaux et sociaux **datés** — un recalcul de période antérieure utilise les taux
   de l'époque. Jamais de taux en dur dans le code.

Ces invariants sont repris de `Moabi-ERP/docs/02-architecture.md` §3 ; ils ne sont pas
négociables et se traduisent en tests unitaires.

---

## 7. Où le code se greffe

| Point d'extension | Fichier |
|---|---|
| Schéma | `src/db/schema.ts` — ajouter un bloc `cpta_*` en fin de fichier |
| Logique métier pure | **`src/lib/comptable/`** (nouveau) — sur le modèle de `lib/penalty.ts` et `lib/igs.ts` : fonctions pures, sans dépendance framework, testées unitairement |
| API | `src/app/api/comptabilite/…` avec `withApi` + `rbac` existants |
| Écrans | `src/app/(app)/comptabilite/…`, en réutilisant `ui/data-table`, `ui/status-badge`, `ui/confirm-dialog` |
| Navigation | `src/lib/nav.ts` — nouvelles entrées avec `ressource` |
| Permissions | Nouvelles ressources `comptabilite`, `ecritures`, `etats-financiers` dans l'écran Rôles existant |
| Exports | `src/lib/exports/` — balance et états financiers en Excel, liasse en PDF |
| Justificatifs | Réutiliser `documents` + `lib/storage.ts` en rattachant à `cpta_ecriture` |

Aucune réécriture de l'existant. Tout est en ajout.

---

## 8. Contraintes de production à respecter

Rappel de `docs/18-migration-production.md` — ces contraintes s'appliquent intégralement
aux migrations E1, qui sont volumineuses :

- **Jamais `drizzle-kit migrate` sur le serveur** (limite mémoire LVE 4 Go) — utiliser
  `npm run db:migrate:node`.
- **Jamais `ALTER TYPE` ni `DROP TYPE`** : PostgreSQL 9.6 et propriété des types incohérente.
  Les nouveaux enums `cpta_*` sont créés de zéro, ce qui est autorisé — il suffit de ne
  jamais toucher aux enums existants.
- Ni SSH ni terminal sur cPanel : tout passe par *Run JS script* ou une tâche cron.
- Sauvegarde préalable obligatoire avant chaque migration (cf. `docs/19`).

**Recommandation :** le dépôt n'est pas versionné (`git` absent du répertoire). Avant
d'engager un chantier de cette taille, initialiser un dépôt Git. Sur trois mois de
développement sur une application en production, travailler sans historique est le
risque le plus élevé du projet — devant la comptabilité elle-même.

---

## 9. Décisions à trancher

1. **Le cabinet veut-il réellement tenir les livres dans l'ERP**, ou conserve-t-il son
   outil comptable actuel ? Toute la valeur de E1/E2 en dépend.
2. **Expert-comptable référent** pour valider le plan comptable, les états financiers et
   le rattachement DSF. Le cabinet est lui-même le sachant — mais la validation doit être
   formalisée et rejouée à chaque version.
3. **Un contribuable pilote** pour tenir un exercice complet en double avec l'outil actuel.
4. **Portail client** (le contribuable saisit ses propres pièces) : maintenant ou plus tard ?
   Recommandation : plus tard — cela ajoute une isolation par tenant côté utilisateur.
5. **Initialisation Git** avant le premier commit de E1.
