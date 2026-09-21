# Retour terrain du 17 septembre 2026 — Gestion commerciale & stocks

> Version 0.1 du 2026-09-21. Document de cadrage — aucun code écrit à ce stade.
> Sources : deux entretiens menés chez un client multi-sites (entrepôt central, boutiques,
> restaurant), transcrits dans `Cabinet LaMéthode/TRANSCRIPTION AUDIO/` :
> **[A]** le comptable, en poste depuis trois mois (11h17, 42 min) ;
> **[B]** le gestionnaire de stock / magasinier (12h07, 43 min).
> Les repères `[A 00:07:56]` renvoient à l'horodatage de la transcription.

---

## 1. Ce que le terrain nous apprend

Le client tient sa caisse avec une application tierce (« Duka ») dont le comptable résume
le périmètre en une phrase : *« c'est juste la facturation, tout le reste n'existe pas »*
`[A 00:11:44]`. Références articles, transferts entre sites, inventaires, prix, périmés,
responsabilités : tout est sur papier, sur Excel, ou nulle part. Le comptable n'a
**aucun contrôle sur le stock** `[A 00:08:29]` ; le magasinier subit un système dont les
données *« arrivent tard »* `[B 00:02:44]` et déstocke à la main `[B 00:34:57]`.

Le cabinet a conclu qu'il fallait *« mettre en place un système qui est complet »*
`[A 00:24:37]`. Ce document traduit chaque insuffisance constatée en une exigence pour
notre ERP, afin qu'il ne reproduise aucune d'elles.

### 1.1 Comptabilité et pilotage

| # | Insuffisance constatée | Repère | Exigence pour l'ERP | État |
|---|---|---|---|---|
| 1 | Le logiciel comptable a été installé avec le **plan comptable français** par défaut ; impossible de corriger en cours d'exercice, on subit jusqu'au 31/12. | `[A 00:00:37]` `[A 00:01:52]` | Le plan SYSCOHADA révisé est le seul plan livré ; il est copié à l'ouverture du premier exercice. Aucun autre référentiel n'est proposé. | ✅ `lib/comptable/plan-syscohada.ts` |
| 2 | Aucune traçabilité : on ne peut pas *« sortir »* les états d'une période (ventes, achats, transferts). | `[A 00:01:52]` `[A 00:23:23]` | Écritures immuables, `origine_type` + `origine_id`, balance et grand livre recalculés, exports Excel. | ✅ E1/E2 |
| 3 | **Personne ne voit l'activité mois par mois** : la baisse du CA depuis juin et un taux de marge de 26 % qui ne couvre pas les charges ne sont découverts qu'en septembre, par un tableau Excel du comptable. | `[A 00:27:40]` `[A 00:28:19]` | Tableau de bord de gestion **mensuel** par contribuable : CA, achats consommés, marge, taux de marge, charges, résultat — par mois, par section analytique (site), comparé au budget. | 🟡 SIG annuels seulement → **A1** |
| 4 | Pas de budgets d'approvisionnement ni de dépenses ; pas d'objectifs par manager ni de réunion d'évaluation. | `[A 00:26:17]` `[A 00:27:40]` | Budgets par compte × section, mensualisés, contrôle à date. Les objectifs de vente d'une boutique sont un budget de classe 7 sur sa section. | ✅ E6 — restitution par site dans **A1** |
| 5 | Le comptable n'a pas accès aux données de stock et de vente ; il dépend de ce qu'on veut bien lui dire. *« Tu es la première barrière »* | `[A 00:03:26]` `[A 00:21:27]` `[B 00:10:51]` | Toute ressource du module commercial est lisible par le rôle comptable ; la matrice ressource × action existante s'étend aux nouvelles ressources. | ✅ RBAC → à étendre (**A2**) |
| 6 | Le système est hébergé chez l'éditeur, sans suivi ; les données ne sont pas chez le client. | `[A 00:25:17]` `[B 00:14:18]` | L'ERP et sa base sont chez le cabinet, sauvegardés (doc 19), exportables. | ✅ |

### 1.2 Recettes et caisse

| # | Insuffisance constatée | Repère | Exigence pour l'ERP | État |
|---|---|---|---|---|
| 7 | Le rapport de caisse journalier (7h–19h) est parfois faux : bugs, **ventes enregistrées en double** (*« vendu trois fois »*). Le contrôle se limite à comparer le rapport aux espèces. | `[A 00:04:12]` | **Session de caisse** par site : ouverture (fond), ventes, encaissements par mode, clôture (espèces déclarées), écart de caisse calculé et tracé. Détection des doublons (même article, même montant, même minute) signalée avant clôture. | ❌ → **S3** |
| 8 | La caissière facture sur papier quand la machine ne connaît pas le produit ; le stock n'est jamais mis à jour. | `[B 00:07:00]` `[B 00:34:57]` | Une vente ne peut porter que sur un article référencé ; un article absent se crée avant la vente, pas après. | ❌ → **S1/S3** |

### 1.3 Référentiel articles

| # | Insuffisance constatée | Repère | Exigence pour l'ERP | État |
|---|---|---|---|---|
| 9 | **Articles sans référence** : impossible de suivre quoi que ce soit. Certains ont un code-barres, d'autres non ; un même biscuit existe en plusieurs grammages. Excel ne s'en sort pas. | `[A 00:07:56]` `[A 00:09:51]` `[A 00:10:32]` | **Référentiel interne** : code unique généré par l'ERP, libellé, famille, unité, variantes (grammage), 0..n codes-barres, comptes d'achat / vente / stock, TVA. Aucun mouvement sans article. Import Excel pour le démarrage. | ❌ → **S1** |
| 10 | Convertir les références fournisseur prend 30 minutes par réception. | `[A 00:07:56]` | Codes fournisseur rattachés à l'article ; la réception rapproche automatiquement. | ❌ → **S1** |

### 1.4 Sites et responsabilités

| # | Insuffisance constatée | Repère | Exigence pour l'ERP | État |
|---|---|---|---|---|
| 11 | *« Il n'y a pas de responsable. Tu ne sais pas qui est responsable de la boutique. »* Le stock *« est dans la machine »* — de personne. | `[A 00:11:01]` `[A 00:12:19]` `[A 00:22:47]` | **Dépôt** (entrepôt, boutique, restaurant) avec responsable nommé ; chaque mouvement porte le dépôt et son auteur ; les écarts d'inventaire s'imputent au dépôt. | ❌ → **S1** |
| 12 | Boutique = deux personnes, le manager passe les commandes : c'est lui le responsable. | `[A 00:31:42]` | Le responsable du dépôt valide ses réceptions, sorties et inventaires ; droit `valider` distinct de `saisir`. | ❌ → **S1** |

### 1.5 Mouvements de stock

| # | Insuffisance constatée | Repère | Exigence pour l'ERP | État |
|---|---|---|---|---|
| 13 | Les achats ne sont pas saisis article par article : *« impossible, trop lent »*. | `[A 00:07:09]` | **Réception fournisseur** par lignes, depuis une commande ou un bon de livraison, code-barres ou code fournisseur, import de fichier. Met à jour le coût moyen. | ❌ → **S2** |
| 14 | **Transferts sur papier**, sans référence, mélangés aux factures ; impossible d'éditer un état des transferts d'une période. | `[A 00:09:06]` `[A 00:23:23]` `[B 00:39:21]` | **Ordre de transfert** : émis → expédié (sortie du dépôt source) → reçu (entrée au dépôt destination), avec écarts de réception. Valorisé au coût. État des transferts par période et par site. | ❌ → **S2** |
| 15 | Les données de transfert **arrivent après la vente** : stock négatif, puis ré-ajout ; « facturations négatives » de contournement. | `[B 00:02:44]` `[B 00:03:52]` `[B 00:04:32]` | Base centrale unique (l'ERP est web). Entre expédition et réception, la marchandise est visible **en transit**. Politique de stock négatif **par dépôt** : refusé, ou toléré avec alerte. | ❌ → **S2** |
| 16 | **Déstockage manuel** sans document : pertes, périmés, ventes papier, consommation du restaurant. On ne sait pas *« où sont les pertes »*. | `[B 00:34:13]` `[B 00:38:44]` | **Sortie de stock** typée (perte, casse, périmé, consommation interne, retour fournisseur, don) avec motif obligatoire, valorisée, validée par le responsable. Rapport des pertes par site et par motif. | ❌ → **S2** |
| 17 | Le restaurant est sur un autre système ; on ne peut pas lui transférer ; on facture depuis une boutique **au prix public** au lieu d'un tarif interne (5 % au lieu de 15 %). Seule la caissière peut facturer. | `[B 00:17:08]` `[B 00:19:42]` `[B 00:25:31]` `[B 00:27:51]` | Le restaurant est un **client interne** : facturation depuis l'entrepôt à un tarif dédié, sans caisse, réservée à un droit précis. La facture déstocke et se comptabilise comme toute vente. | ❌ → **S3** |

### 1.6 Prix

| # | Insuffisance constatée | Repère | Exigence pour l'ERP | État |
|---|---|---|---|---|
| 18 | Un changement de prix **n'arrive pas dans les boutiques** ; on continue à vendre à l'ancien prix ; conflits d'étiquetage ; personne ne sait qui a le bon prix. | `[B 00:09:08]` `[B 00:12:20]` `[B 00:13:39]` | **Grille tarifaire centrale** : tarif (public, restaurant, gros…) × article × date d'effet. Le prix est **résolu par le serveur** à la vente, jamais saisi par le poste. Historique et journal des changements. Rapport « ventes hors tarif ». | ❌ → **S1/S3** |

### 1.7 Périssables et lots

| # | Insuffisance constatée | Repère | Exigence pour l'ERP | État |
|---|---|---|---|---|
| 19 | Produits périssables ; règle orale « pas moins de six mois de durée de vie à la réception, sauf accord de l'acheteur » ; certains fournisseurs reprennent les périmés. | `[B 00:36:17]` `[B 00:37:01]` | **Lots** avec DLC (optionnels par article) ; durée de vie minimale par article contrôlée à la réception, dérogation tracée ; alertes de péremption ; **retour fournisseur** comme document de sortie. | ❌ → **S5** |

### 1.8 Inventaire

| # | Insuffisance constatée | Repère | Exigence pour l'ERP | État |
|---|---|---|---|---|
| 20 | Aucun inventaire depuis l'ouverture, pas de planning. Le cabinet en programme un samedi soir, boutiques fermées, avec des fichiers à préparer. | `[A 00:14:19]` `[A 00:28:59]` `[B 00:41:38]` | **Planning annuel** d'inventaires ; **session d'inventaire** par dépôt : gel du théorique, feuilles de comptage, saisie, écarts en quantité et en valeur, validation par le responsable, régularisation automatique (mouvement + écriture). | ❌ → **S4** |
| 21 | Stock théorique = initial + achats − ventes, tenu à la main ; besoin de le confronter au physique, en quantité puis en valeur. | `[A 00:15:04]` `[A 00:15:43]` `[B 00:10:51]` | Le stock **n'est jamais stocké** : il se recalcule depuis les mouvements, à toute date, par dépôt, en quantité et en valeur (coût moyen pondéré). | ❌ → **S2** |

### 1.9 Bilan

Sur 21 points, **6 sont déjà couverts**, **2 demandent une amélioration de l'existant**
(A1, A2) et **13 relèvent d'un module absent**. Le document 20 classait les stocks en
« ultérieur — peu de clients concernés ». Ce client en est un, et le cabinet s'est engagé
auprès de lui. Le module devient prioritaire.

---

## 2. Améliorations de l'existant

### A1 — Tableau de bord de gestion mensuel

Un onglet « Pilotage » dans la comptabilité d'un contribuable, sur l'exercice ouvert :

- par mois : chiffre d'affaires (70x), achats consommés (60x ± variation 603), marge
  commerciale, taux de marge, autres charges (61–66), résultat courant ;
- filtrable par section analytique (site) quand un axe existe ;
- colonne « budget » quand un budget VALIDE couvre l'exercice ;
- courbe CA / marge sur 12 mois glissants.

Tout se calcule depuis `cpta_lignes_ecriture` comme la balance — rien n'est cumulé en
base. Le calcul pur va dans `lib/comptable/pilotage.ts`, testé sur des cas de marge.

C'est exactement le tableau que le comptable a dû reconstruire à la main `[A 00:28:19]`,
et c'est le support des réunions mensuelles avec les managers `[A 00:26:17]`.

**Livré le 2026-09-21** : onglet « Pilotage » de la comptabilité, `GET /api/comptabilite/pilotage`
(`exerciceId`, `jusquAu`, `sectionId`, `budgetId`), module pur `lib/comptable/pilotage.ts`
(12 tests), service `services/comptabilite/pilotage.ts`, 8 tests d'intégration. Les SIG
mensuels passent par `calculerCompteResultat` : la somme des mois est la liasse. Filtré sur
une section, seule la part ventilée compte ; le budget de référence est le dernier validé,
réduit aux lignes de la section quand il est bâti sur son axe.

### A2 — Ressources RBAC du module commercial

Nouvelles ressources dans l'écran Rôles : `articles`, `depots`, `tarifs`, `stocks`
(mouvements, transferts, sorties), `ventes`, `inventaires`, `caisse`. Le rôle comptable
obtient `lire` sur toutes ; le rôle « responsable de dépôt » (nouveau, livré en seed)
obtient `creer` et `valider` sur son périmètre. Le droit `ventes.modifier_prix` est
distinct et tracé dans `audit_log`.

### A3 — Dépôt ↔ section analytique

Un dépôt se rattache à une section analytique. Les écritures générées par le module
(ventes, achats, variations de stock) se ventilent automatiquement sur cette section :
le résultat par site de A1 tombe sans saisie supplémentaire.

---

## 3. Module « Gestion commerciale & stocks »

Préfixe de tables `gc_`. Mêmes conventions que `cpta_` : `serial` en clé, `numeric(14,2)`
pour les montants, `numeric(14,3)` pour les quantités, `created_at` / `updated_at`,
commentaires en français.

### 3.1 Modèle de données

| Table | Rôle |
|---|---|
| `gc_depots` | Site de stockage du contribuable : code, libellé, type `ENTREPOT` / `BOUTIQUE` / `RESTAURANT` / `TRANSIT`, `responsable_user_id`, `section_id`, `politique_negatif` `REFUSE` / `TOLERE`, actif. Un dépôt `TRANSIT` est créé d'office par contribuable. |
| `gc_familles` | Arborescence simple (parent nullable) ; porte les comptes par défaut des articles. |
| `gc_articles` | Code interne unique (généré `ART-000001`, modifiable avant le premier mouvement), libellé, famille, unité, `suivi_lot`, `duree_vie_min_jours`, comptes achat / vente / stock / variation (hérités de la famille), `taxe_id`, actif. |
| `gc_article_codes` | Codes alternatifs : `EAN`, `FOURNISSEUR` (avec `tiers_id`), `INTERNE_ANCIEN`. Unique par contribuable × type × code. |
| `gc_tarifs` | Grille : code (`PUBLIC`, `RESTAURANT`, `GROS`…), libellé, par défaut pour tel type de dépôt ou tel tiers. |
| `gc_tarif_prix` | Tarif × article × `valide_du` / `valide_au` × prix HT. Pas de chevauchement par la base. |
| `gc_lots` | Article, numéro, DLC, fournisseur d'origine. |
| `gc_documents` | En-tête : contribuable, exercice, type (`COMMANDE_ACHAT`, `RECEPTION`, `TRANSFERT`, `VENTE`, `SORTIE`, `RETOUR_FOURNISSEUR`, `INVENTAIRE`), numéro sans trou par contribuable × type × exercice (réutilise `cpta_sequences`), statut `BROUILLON` / `VALIDE` / `EXPEDIE` / `RECU` / `ANNULE`, `depot_source_id`, `depot_destination_id`, `tiers_id`, `tarif_id`, date, motif (`PERTE`, `CASSE`, `PERIME`, `CONSO_INTERNE`, `DON`, `REGUL_INVENTAIRE`), `piece_id` (facture `cpta_pieces` générée), `ecriture_id`, `created_by`, `valide_par`, `valide_le`. |
| `gc_document_lignes` | Article, lot, quantité, quantité reçue (transferts, réceptions), prix unitaire HT (ventes), coût unitaire (calculé), `taxe_id`, `prix_tarif` (pour repérer les ventes hors tarif). |
| `gc_mouvements` | **Immuable.** Ligne de document, dépôt, article, lot, date, quantité signée, coût unitaire, valeur. Seule source du stock. Index (dépôt, article, date). |
| `gc_inventaires` | Extension du document `INVENTAIRE` : `planifie_le`, `gele_le`, `cloture_le`. Lignes : quantité théorique figée au gel, comptée, écart, valeur de l'écart. |
| `gc_sessions_caisse` | Dépôt, ouverte par / le, fermée le, fond initial, ventes de la session, encaissements par mode, espèces déclarées, écart, commentaire. Une vente `VENTE` référence sa session. |

### 3.2 Invariants — tenus par la base et par le service, pas par la discipline

1. **Le stock n'est jamais stocké.** Quantité et valeur d'un article dans un dépôt à une
   date = Σ `gc_mouvements`. Un total stocké finit toujours par diverger de son détail.
2. **Un mouvement naît de la validation d'un document**, jamais d'une saisie directe.
   Il est immuable : `UPDATE` / `DELETE` refusés. Annuler = document inverse, lié.
3. **Aucun mouvement sans article actif référencé.** Aucune ligne de vente sans tarif
   résolu par le serveur à la date de la vente ; un prix forcé exige le droit
   `ventes.modifier_prix` et laisse `prix_tarif` à côté du prix appliqué.
4. **Transfert en deux temps** : l'expédition sort du dépôt source vers `TRANSIT` ; la
   réception entre depuis `TRANSIT` vers la destination. Un écart de réception laisse
   la différence en `TRANSIT`, visible tant qu'un document de sortie ne l'explique pas.
5. **Stock négatif refusé** à la validation, sauf dépôt en politique `TOLERE` — alors
   notifié au responsable (canaux existants) et listé dans le tableau de bord.
6. **Coût moyen pondéré** recalculé à chaque entrée ; toute sortie est valorisée au
   CMUP courant du dépôt. Les transferts entrent à leur coût de sortie.
7. **Inventaire** : le théorique est figé au gel ; toute vente sur le dépôt entre gel et
   clôture est refusée. L'écart validé génère un mouvement `REGUL_INVENTAIRE` et une
   écriture de variation de stock (`603x` ↔ `3x`) avec `origine`.
8. **Réception d'un lot** dont la DLC est inférieure à aujourd'hui + `duree_vie_min_jours`
   refusée, sauf dérogation portée par un utilisateur ayant `stocks.deroger`, tracée.
9. **Comptabilisation par les objets existants** : une `VENTE` validée crée une
   `cpta_pieces` `FACTURE_VENTE` ; une `RECEPTION` avec facture crée une `FACTURE_ACHAT` ;
   les écritures sortent de `services/comptabilite/pieces.ts` comme aujourd'hui. Seule
   la variation de stock est une écriture propre au module.
10. **Rien ne se recalcule dans le dos d'un document validé** — même principe que la
    paie : coût, prix et TVA sont figés sur la ligne.

### 3.3 Écrans

- **Articles** : liste type Excel, fiche, codes, prix par tarif, stock par dépôt, import.
- **Dépôts** : fiche, responsable, politique, stock valorisé, mouvements.
- **Réceptions / Transferts / Sorties** : formulaire à lignes avec recherche par code
  ou code-barres, validation par le responsable.
- **Ventes** : facturation depuis un dépôt, tarif résolu, session de caisse, facture
  interne (restaurant).
- **Inventaires** : planning, session, feuille de comptage (imprimable), saisie, écarts.
- **Tableau de bord commercial** : stock valorisé par site, marge par site, pertes par
  site et motif, articles sous stock de sécurité, lots à péremption, ventes hors tarif,
  écarts de caisse.

### 3.4 Où le code se greffe

| Point d'extension | Fichier |
|---|---|
| Schéma | `src/db/schema.ts` — bloc `gc_*` en fin de fichier |
| Logique pure | `src/lib/commercial/` : `stock.ts` (Σ mouvements, CMUP), `tarif.ts` (résolution à date), `transfert.ts`, `inventaire.ts` (écarts), `caisse.ts` (écart, doublons) — testés unitairement |
| Services | `src/lib/services/commercial/` avec `withApi` + `rbac` |
| API | `src/app/api/commercial/…` |
| Écrans | `src/app/(app)/commercial/…` sur `ui/data-table`, `ui/status-badge`, `ui/confirm-dialog` |
| Navigation | `src/lib/nav.ts` — entrée « Commercial & stocks », ressource `stocks` |
| Comptabilisation | `services/comptabilite/pieces.ts` (réutilisé), nouvelle génération pour la variation de stock |
| Exports | `src/lib/exports/` — état des transferts, feuille de comptage, stock valorisé |

### 3.5 Phasage

| Phase | Contenu | Livrable utile | Charge |
|---|---|---|---|
| **S1 — Référentiel** | Dépôts, familles, articles, codes, tarifs datés, import Excel, RBAC (A2), lien dépôt ↔ section (A3) | Le client dispose enfin d'une référence unique par article ; fichiers d'inventaire imprimables | 2 – 3 sem. |
| **S2 — Mouvements** | Réceptions, transferts en deux temps, sorties typées, stock théorique et CMUP, état des transferts, politique de stock négatif | Le comptable contrôle le stock ; les transferts ne sont plus sur papier | 3 – 4 sem. |
| **S3 — Ventes** | Facturation depuis dépôt, tarif résolu, sessions de caisse et doublons, facture interne restaurant, comptabilisation par `cpta_pieces` | Les ventes déstockent et se comptabilisent ; les écarts de caisse sont tracés | 3 – 4 sem. |
| **S4 — Inventaire** | Planning, gel, comptage, écarts valorisés, régularisation et écriture | L'inventaire du samedi soir se fait dans l'ERP | 2 – 3 sem. |
| **S5 — Périssables & pilotage** | Lots et DLC, dérogations, retours fournisseur, alertes ; tableau de bord commercial ; A1 | Réunion mensuelle des managers sur les chiffres de l'ERP | 2 – 3 sem. |

**Jalon utile : fin de S2.** Le comptable a un stock théorique par site, valorisé, à
confronter au physique — ce qu'il n'a jamais eu. S3 ferme la boucle avec la comptabilité.

A1 peut être livré indépendamment, avant S1 : il ne dépend que de l'existant.

---

## 4. Décisions à trancher

1. **Le client des entretiens est-il le pilote ?** Son inventaire physique est programmé
   un samedi prochain avec des fichiers à préparer `[B 00:41:38]` : l'import Excel du
   référentiel (S1) peut servir dès cette étape, même avant le reste.
2. **La caisse en boutique.** L'ERP web sert-il de poste de vente (tablette, connexion
   requise), ou reste-t-il derrière une caisse tierce dont on importe les ventes ?
   Recommandation : S3 livre une facturation web simple depuis un dépôt ; un mode
   hors-ligne est hors périmètre — c'est précisément la synchronisation différée qui
   a détruit la fiabilité du système actuel `[B 00:02:44]`.
3. **Inventaire permanent ou intermittent** en comptabilité. Recommandation :
   intermittent (variation constatée à l'inventaire et en fin de mois), conforme à la
   pratique SYSCOHADA du cabinet et plus simple à auditer.
4. **Le restaurant** : dépôt de l'ERP (ses consommations sont des sorties) ou client
   interne (facturé) ? Le magasinier penche pour la facture `[B 00:25:31]`, qui donne la
   marge du restaurant. Recommandation : client interne avec tarif `RESTAURANT`.
5. **Ordre de livraison** : A1 seul d'abord (une semaine, valeur immédiate pour tous les
   contribuables), ou S1 directement pour le client pilote ?

---

## Décisions prises le 2026-09-21

- **Décision 2 — caisse** : facturation web depuis un dépôt, connexion requise. Pas de mode
  hors-ligne.
- **Décision 5 — ordre** : **A1 d'abord**, puis S1.
- Décisions 1, 3 et 4 : restent ouvertes ; à trancher avant S1 (pilote) et S3
  (inventaire permanent ou intermittent, statut du restaurant).

## Point de validation

Le cadrage (21 points, modèle `gc_*`, invariants, phasage) est validé dans ses grandes
lignes le 2026-09-21. A1 démarre ; S1 attend la décision 1.
