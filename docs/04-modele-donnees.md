# Architecture de la Base de Données — ERP LaMethode

**Version :** 1.0 (Phase 1) · **SGBD :** PostgreSQL · **ORM :** Drizzle · **Statut :** à valider

---

## 1. Vue d'ensemble

Tables **existantes** (à conserver, avec extensions) :
`contribuables`, `declarations`, `acf_suivis`.

Tables **à ajouter** en Phase 2 :
`users`, `roles` (+ permissions), `documents`, `cnps_cotisations`, `penalites`,
`notifications`, `audit_log`, `parametres`.

---

## 2. Entités existantes (rappel) et extensions proposées

### `contribuables` *(existant)*
`id, nom, niu, centre_impots, regime_fiscal (REEL|SIMPLIFIE|IFU), secteur_activite,
telephone, email, responsable_dossier, actif, notes, created_at, updated_at`

**Extensions proposées :**
- `responsable_id → users.id` (remplacer à terme le champ texte `responsable_dossier`)
- `date_debut_mission` (date d'entrée en portefeuille)

### `declarations` *(existant)*
`id, contribuable_id →, type (DSF|IRPP|TVA|CNPS|...), periodicite (MENSUELLE|ANNUELLE),
periode ("2026" | "2026-01"), date_echeance, statut (A_FAIRE|DEPOSEE|PAYEE|EN_RETARD|EXONERE),
date_paiement, montant, notes, created_at, updated_at`

**Extensions proposées :**
- `date_depot` (distincte de `date_paiement`)
- `document_id → documents.id` (justificatif de dépôt)
- `assigned_to → users.id`

### `acf_suivis` *(existant)*
`id, contribuable_id →, objet, date_demande, statut (EN_COURS|BLOQUE|DELIVRE|REJETE),
motif_blocage, solution, date_resolution, responsable, notes, timestamps`

**Extension proposée :** `date_validite` (pour l'alerte « ACF à renouveler »).

---

## 3. Nouvelles entités

### `users`
| Colonne | Type | Notes |
|---------|------|-------|
| id | serial PK | |
| nom | text NOT NULL | |
| email | varchar UNIQUE NOT NULL | login |
| password_hash | text | Auth.js credentials |
| role_id | int → roles.id | |
| actif | boolean default true | |
| created_at / updated_at | timestamp | |

### `roles`
| Colonne | Type | Notes |
|---------|------|-------|
| id | serial PK | |
| nom | enum(ADMIN, MANAGER, COLLABORATEUR, LECTURE) | |
| permissions | jsonb | liste de permissions fines (`{ressource, actions[]}`) |

### `cnps_cotisations`
| Colonne | Type | Notes |
|---------|------|-------|
| id | serial PK | |
| contribuable_id | int → contribuables | |
| periode | text | "2026-01" |
| masse_salariale | numeric(14,2) | |
| taux | numeric(5,2) | |
| montant_employeur | numeric(14,2) | |
| montant_salarie | numeric(14,2) | |
| date_echeance | date | |
| statut | enum (réutilise statut_declaration) | |
| declaration_id | int → declarations (nullable) | lien vers la déclaration CNPS |
| timestamps | | |

### `documents` (coffre documentaire)
| Colonne | Type | Notes |
|---------|------|-------|
| id | serial PK | |
| contribuable_id | int → contribuables | |
| nom_fichier | text | |
| type_mime | text | |
| taille | int | octets |
| chemin_stockage | text | chiffré au repos |
| categorie | text | classement (DSF, contrat, ACF…) |
| tags | jsonb | |
| version | int default 1 | historique des versions |
| parent_document_id | int → documents (nullable) | version précédente |
| declaration_id / acf_id | int (nullable) | rattachement |
| uploaded_by | int → users | |
| created_at | timestamp | |

### `penalites`
| Colonne | Type | Notes |
|---------|------|-------|
| id | serial PK | |
| declaration_id | int → declarations | |
| montant | numeric(14,2) | |
| base_calcul | text | fixe / % du montant |
| statut | enum (ESTIMEE, CONFIRMEE, ANNULEE) | |
| created_at | timestamp | |

### `notifications`
| Colonne | Type | Notes |
|---------|------|-------|
| id | serial PK | |
| user_id | int → users (nullable = broadcast) | |
| type | enum (RAPPEL, ALERTE, INFO) | |
| canal | enum (DASHBOARD, EMAIL, SMS, WHATSAPP, PUSH) | SMS/WA = architecture |
| ressource_type / ressource_id | text / int | lien vers déclaration/ACF… |
| message | text | |
| lu | boolean default false | |
| created_at | timestamp | |

### `audit_log`
| Colonne | Type | Notes |
|---------|------|-------|
| id | serial PK | |
| user_id | int → users | acteur |
| action | text | CREATE/UPDATE/DELETE/LOGIN… |
| entite | text | table concernée |
| entite_id | int | |
| diff | jsonb | avant / après |
| ip | text | |
| created_at | timestamp | |

### `parametres`
Clé/valeur du cabinet (échéances légales, jours de rappel, barème de pénalités, identité visuelle).

---

## 4. Relations principales

```
users ──< declarations (assigned_to)
users ──< contribuables (responsable_id)
users ──< audit_log
users ──< notifications
roles ──< users

contribuables ──< declarations
contribuables ──< acf_suivis
contribuables ──< cnps_cotisations
contribuables ──< documents

declarations ──< penalites
declarations ──1 documents (justificatif)
declarations ──1 cnps_cotisations (type CNPS)
```

---

## 5. Contraintes & index (Phase 2)

- **Index** : `declarations(contribuable_id)`, `declarations(date_echeance)`,
  `declarations(statut)`, `contribuables(niu)`, `documents(contribuable_id)`,
  `audit_log(entite, entite_id)`.
- **Unicité** : `users.email`, et idéalement `declarations(contribuable_id, type, periode)`
  pour éviter les doublons d'échéance.
- **Suppression** : `ON DELETE CASCADE` déjà en place pour les enfants d'un contribuable
  (déclarations, ACF) — à étendre aux nouvelles tables filles avec prudence (documents/audit
  plutôt en `RESTRICT` ou soft-delete).
- **Soft-delete** recommandé sur `contribuables` et `documents` (colonne `deleted_at`) pour
  la traçabilité plutôt qu'une suppression physique.
