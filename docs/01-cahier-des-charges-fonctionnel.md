# Cahier des Charges Fonctionnel — ERP Fiscal & Social LaMethode SARL

**Version :** 1.0 (Phase 1) · **Statut :** à valider

---

## 1. Contexte & objectifs

LaMethode SARL est un cabinet d'expertise comptable, conseil fiscal et financier (Cameroun,
référentiel **OHADA** + fiscalité **DGI**). Le cabinet gère un portefeuille de **contribuables**
(clients) pour lesquels il doit produire et suivre des **déclarations fiscales et sociales**
récurrentes, dans des délais légaux stricts, sous peine de **pénalités** pour le client et de
**risque de réputation** pour le cabinet.

**Objectif du logiciel :** centraliser le suivi de toutes les obligations fiscales et sociales
du portefeuille, automatiser les échéances et les alertes, et fournir au cabinet une vision
temps réel des retards, risques et charges de travail.

**Problèmes actuels à résoudre :**
- Suivi éclaté (Excel, mémoire humaine) → oublis d'échéances → pénalités client.
- Pas de vision consolidée des retards et des dossiers à risque.
- Pas de coffre documentaire structuré par client.
- Pas de traçabilité (qui a fait quoi, quand).

---

## 2. Acteurs & rôles

| Rôle | Description | Droits principaux |
|------|-------------|-------------------|
| **Administrateur** | Associé / gérant du cabinet | Tout : utilisateurs, paramètres, audit, suppression |
| **Manager** | Chef de mission / responsable de portefeuille | Toutes données métier, affectation des dossiers, validation |
| **Collaborateur** | Comptable / fiscaliste | CRUD sur ses dossiers affectés, dépôt de déclarations, documents |
| **Lecture seule** | Stagiaire / auditeur | Consultation uniquement |

> Les rôles sont gérés par **RBAC** avec permissions fines (cf. cahier technique §Sécurité).

---

## 3. Exigences fonctionnelles par module

### 3.1 Dashboard exécutif
- **EF-DASH-01** : KPI en tête de page — nb contribuables actifs, déclarations à faire ce mois,
  déclarations en retard, ACF bloqués, montant de pénalités estimées.
- **EF-DASH-02** : graphiques (Recharts) — déclarations par statut, évolution des dépôts, charge mensuelle.
- **EF-DASH-03** : calendrier / heatmap des échéances à venir (30 / 60 / 90 jours).
- **EF-DASH-04** : « Top retards », « Top clients à risque », « Top collaborateurs » (charge).
- **EF-DASH-05** : flux des dernières activités (journal d'audit résumé).

### 3.2 Gestion des contribuables *(existant à étendre)*
- **EF-CTB-01** : CRUD contribuable — nom, **NIU**, centre des impôts, régime fiscal
  (Réel / Simplifié / IFU), secteur, contacts, responsable de dossier, statut actif, notes.
- **EF-CTB-02** : fiche détaillée avec onglets — déclarations, CNPS, ACF, documents, historique.
- **EF-CTB-03** : recherche instantanée + filtres (régime, centre, responsable, statut).
- **EF-CTB-04** : détection des obligations applicables selon le régime (ex. IFU ≠ obligations du Réel).
- **EF-CTB-05** : import / export du portefeuille (Excel / CSV).

### 3.3 Déclarations annuelles *(existant à étendre)*
- **EF-DA-01** : gestion **DSF**, **Solde DSF**, **BEF**, **Bail**, **Patente**.
- **EF-DA-02** : échéance légale par défaut = **15 mars N+1** (paramétrable).
- **EF-DA-03** : statuts — À faire · Déposée · Payée · En retard · Exonérée.
- **EF-DA-04** : suivi du montant, date de dépôt, date de paiement, pièce jointe.

### 3.4 Déclarations mensuelles *(existant à étendre)*
- **EF-DM-01** : gestion **IRPP**, **Précompte loyer**, **TVA**, **Acompte IS**, **CNPS**.
- **EF-DM-02** : échéance par défaut = **15 du mois suivant** la période (paramétrable).
- **EF-DM-03** : **génération automatique** des 12 échéances mensuelles pour une année donnée.
- **EF-DM-04** : vue tableau annuelle croisée (contribuable × mois) type Excel.

### 3.5 CNPS (social)
- **EF-CNPS-01** : suivi des cotisations sociales mensuelles par employeur (contribuable).
- **EF-CNPS-02** : masse salariale déclarée, taux, montant employeur / salarié, date limite.
- **EF-CNPS-03** : rattachement au module déclarations (type CNPS) + alertes dédiées.

### 3.6 ACF — Attestation de Conformité Fiscale *(existant à étendre)*
- **EF-ACF-01** : suivi des demandes d'ACF — objet, date de demande, responsable.
- **EF-ACF-02** : statuts — En cours · Bloqué · Délivré · Rejeté.
- **EF-ACF-03** : gestion du **motif de blocage** et de la **solution**, date de résolution.
- **EF-ACF-04** : alerte sur ACF à renouveler (validité arrivant à expiration).

### 3.7 Blocages
- **EF-BLK-01** : registre transverse des blocages (fiscaux, ACF, contentieux) par contribuable.
- **EF-BLK-02** : criticité, responsable, échéance de résolution, historique.
- **EF-BLK-03** : vue « dossiers bloqués » priorisée pour le management.

### 3.8 Gestion documentaire
- **EF-DOC-01** : chaque contribuable dispose d'un **coffre documentaire**.
- **EF-DOC-02** : upload **drag & drop**, dossiers, tags, prévisualisation.
- **EF-DOC-03** : rattachement d'un document à une déclaration / ACF précise.
- **EF-DOC-04** : historique des versions ; classement automatique par type (architecture OCR prévue).

### 3.9 Analytics
- **EF-ANA-01** : taux de dépôt dans les délais (global, par collaborateur, par période).
- **EF-ANA-02** : évolution des pénalités évitées / subies.
- **EF-ANA-03** : répartition du portefeuille (régime, secteur, centre).
- **EF-ANA-04** : export des rapports mensuels / annuels.

### 3.10 Utilisateurs & paramètres
- **EF-USR-01** : gestion des utilisateurs, rôles et permissions (RBAC).
- **EF-USR-02** : paramètres du cabinet (échéances légales, taux de pénalité, jours de rappel).
- **EF-USR-03** : journal d'audit consultable et filtrable.

---

## 4. Règles de gestion (métier)

- **RG-01** : une déclaration est **En retard** si sa date d'échéance est passée et son statut
  n'est ni Déposée, ni Payée, ni Exonérée.
- **RG-02** : échéance mensuelle par défaut = 15 du mois **suivant** la période déclarée.
- **RG-03** : échéance annuelle (DSF) par défaut = **15 mars** de l'année suivante.
- **RG-04** : les obligations applicables dépendent du **régime fiscal** du contribuable.
- **RG-05** : une **pénalité** est estimée automatiquement au passage « En retard » selon le
  barème paramétré (montant fixe et/ou % du montant dû).
- **RG-06** : un contribuable **inactif** ne génère plus de nouvelles échéances.
- **RG-07** : toute modification de donnée sensible est **tracée** (audit : qui, quoi, quand, avant/après).
- **RG-08** : un collaborateur ne voit/modifie que les dossiers qui lui sont **affectés** (sauf Manager/Admin).

---

## 5. Automatisations attendues

Échéances fiscales & CNPS · rappels (J-15 / J-7 / J-1, paramétrable) · pénalités · alertes
dashboard · ACF à renouveler · tableaux statistiques · rapports mensuels · exports Excel/PDF ·
sauvegardes.

---

## 6. Exigences non-fonctionnelles

| Catégorie | Exigence |
|-----------|----------|
| **Langue** | Interface en **français** (fr-FR), formats de date/montant locaux (FCFA). |
| **Sécurité** | Auth.js, RBAC, Zod, journal d'audit, rate limiting, chiffrement des documents. |
| **Performance** | Listes paginées, recherche < 300 ms sur 10 000 lignes, tableaux virtualisés. |
| **Responsive** | Utilisable sur desktop et tablette ; dark/light mode. |
| **Fiabilité** | Sauvegardes automatiques ; migrations versionnées ; pas de perte de données. |
| **Maintenabilité** | Code typé, modulaire, SOLID/DRY, documenté. |
| **Traçabilité** | Historique des actions sur toutes les entités métier. |

---

## 7. Hors périmètre (V1)

Comptabilité générale complète (grand livre, balance), paie détaillée, télé-déclaration
directe vers la DGI, application mobile native. Ces éléments sont notés pour une V2 éventuelle.
