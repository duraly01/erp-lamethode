# Diagrammes UML & Cas d'Utilisation — ERP LaMethode

**Version :** 1.0 (Phase 1) · **Statut :** à valider
*(Diagrammes en syntaxe Mermaid — rendus par GitHub, VS Code, etc.)*

---

## 1. Diagramme de cas d'utilisation

```mermaid
graph TB
    Admin([Administrateur])
    Manager([Manager])
    Collab([Collaborateur])
    Lecteur([Lecture seule])

    subgraph ERP["ERP Fiscal & Social LaMethode"]
        UC1[Gérer les contribuables]
        UC2[Suivre les déclarations]
        UC3[Générer les échéances]
        UC4[Suivre CNPS]
        UC5[Suivre les ACF & blocages]
        UC6[Gérer le coffre documentaire]
        UC7[Consulter le dashboard & analytics]
        UC8[Exporter rapports PDF/Excel]
        UC9[Gérer utilisateurs & rôles]
        UC10[Configurer les paramètres]
        UC11[Consulter le journal d'audit]
    end

    Lecteur --> UC7
    Collab --> UC1 & UC2 & UC4 & UC5 & UC6 & UC7 & UC8
    Manager --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8
    Admin --> UC9 & UC10 & UC11
    Admin --> Manager
```

> Admin hérite des droits Manager ; Manager hérite des droits Collaborateur ; tous héritent
> de la lecture. Les liens ci-dessus montrent les cas **spécifiques** à chaque niveau.

---

## 2. Diagramme de classes (modèle du domaine)

```mermaid
classDiagram
    class User {
        +int id
        +string nom
        +string email
        +Role role
        +bool actif
    }
    class Role {
        +int id
        +string nom
        +json permissions
    }
    class Contribuable {
        +int id
        +string nom
        +string niu
        +RegimeFiscal regime
        +string centreImpots
        +bool actif
    }
    class Declaration {
        +int id
        +DeclarationType type
        +Periodicite periodicite
        +string periode
        +date dateEcheance
        +StatutDeclaration statut
        +decimal montant
        +bool estEnRetard()
    }
    class CnpsCotisation {
        +int id
        +string periode
        +decimal masseSalariale
        +decimal montantEmployeur
        +date dateEcheance
    }
    class AcfSuivi {
        +int id
        +string objet
        +date dateDemande
        +StatutAcf statut
        +string motifBlocage
    }
    class Document {
        +int id
        +string nomFichier
        +string categorie
        +int version
    }
    class Penalite {
        +int id
        +decimal montant
        +string statut
    }
    class Notification {
        +int id
        +string type
        +string canal
        +bool lu
    }
    class AuditLog {
        +int id
        +string action
        +string entite
        +json diff
    }

    Role "1" --> "*" User
    User "1" --> "*" Declaration : assignee
    User "1" --> "*" Contribuable : responsable
    User "1" --> "*" AuditLog
    User "1" --> "*" Notification
    Contribuable "1" --> "*" Declaration
    Contribuable "1" --> "*" AcfSuivi
    Contribuable "1" --> "*" CnpsCotisation
    Contribuable "1" --> "*" Document
    Declaration "1" --> "*" Penalite
    Declaration "1" --> "0..1" Document : justificatif
    Declaration "1" --> "0..1" CnpsCotisation
```

---

## 3. Diagramme d'état — cycle de vie d'une déclaration

```mermaid
stateDiagram-v2
    [*] --> A_FAIRE : création / génération
    A_FAIRE --> DEPOSEE : dépôt
    A_FAIRE --> EN_RETARD : échéance dépassée
    A_FAIRE --> EXONERE : exonération
    EN_RETARD --> DEPOSEE : dépôt tardif (+ pénalité)
    DEPOSEE --> PAYEE : paiement
    EN_RETARD --> PAYEE : régularisation
    PAYEE --> [*]
    EXONERE --> [*]
```

---

## 4. Séquence — génération automatique des échéances mensuelles

```mermaid
sequenceDiagram
    actor M as Manager
    participant UI as Interface
    participant API as /api/declarations/generate
    participant SVC as Service Échéances
    participant DB as PostgreSQL

    M->>UI: Choisir contribuable + année
    UI->>API: POST { contribuableId, annee }
    API->>API: Auth + RBAC + validation Zod
    API->>SVC: genererEcheances(contribuable, annee)
    SVC->>SVC: Déduire obligations selon régime fiscal
    SVC->>DB: INSERT 12 déclarations mensuelles + annuelles
    DB-->>SVC: OK
    SVC-->>API: liste créée
    API-->>UI: 201 { data }
    UI-->>M: Échéances affichées dans le tableau
```

---

## 5. Séquence — passage automatique en retard + pénalité

```mermaid
sequenceDiagram
    participant CRON as Tâche planifiée
    participant SVC as Service Retards
    participant DB as PostgreSQL
    participant NOTIF as Service Notifications

    CRON->>SVC: verifierRetards() (quotidien)
    SVC->>DB: SELECT déclarations échéance<auj. et statut=A_FAIRE
    DB-->>SVC: liste
    loop chaque déclaration
        SVC->>DB: UPDATE statut = EN_RETARD
        SVC->>DB: INSERT penalite (estimée, barème)
        SVC->>NOTIF: créer alerte (dashboard + email)
    end
    NOTIF-->>SVC: OK
```
