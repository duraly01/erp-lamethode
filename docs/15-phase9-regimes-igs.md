# Phase 9 — Régimes fiscaux camerounais : Réel et IGS

## Objet

L'ERP portait les régimes hérités `REEL / SIMPLIFIE / IFU`. Les régimes
réellement applicables au Cameroun sont le **Réel** et l'**Impôt Général
Synthétique (IGS)**, ce dernier découpé en classes selon le chiffre d'affaires
annuel. Cette phase remplace l'ancien référentiel et câble toute la chaîne :
base, API, écrans, exports, génération d'échéances.

## Règles métier retenues

- **Deux régimes** : `REEL`, `IGS`. L'IGS a remplacé le régime simplifié et
  l'impôt libératoire.
- **Classes 1 à 12** (CGI art. C40), chacune définie par une tranche de CA
  annuel et un montant forfaitaire annuel en FCFA.
- **Abattement CGA** : les adhérents d'un Centre de Gestion Agréé tenant une
  comptabilité bénéficient d'une réduction de 50 % sur le montant du barème.
- **Paiement trimestriel** : le forfait annuel est payé par quarts, au plus
  tard les **15 mars, 15 juin, 15 septembre et 15 décembre** de l'année
  d'imposition.
- **Seuil de sortie** : au-delà de 50 000 000 FCFA de CA, le contribuable
  bascule obligatoirement au régime du Réel. Le formulaire l'affiche en
  avertissement.
- **Caractère libératoire** : l'IGS remplace l'impôt sur le revenu, la patente
  et la TVA. Un contribuable à l'IGS n'a donc **pas** de déclarations
  mensuelles TVA/IRPP/Acompte IS ni d'obligations annuelles DSF/BEF/Patente.

## Barème livré

| Classe | CA annuel (FCFA)          | Montant annuel |
| ------ | ------------------------- | -------------- |
| 1      | 0 – 500 000               | Exonéré        |
| 2      | 500 001 – 1 000 000       | 20 000         |
| 3      | 1 000 001 – 1 500 000     | 30 000         |
| 4      | 1 500 001 – 2 000 000     | 40 000         |
| 5      | 2 000 001 – 2 500 000     | 50 000         |
| 6      | 2 500 001 – 5 000 000     | 100 000        |
| 7      | 5 000 001 – 10 000 000    | 200 000        |
| 8      | 10 000 001 – 15 000 000   | 400 000        |
| 9      | 15 000 001 – 20 000 000   | 700 000        |
| 10     | 20 000 001 – 30 000 000   | 1 000 000      |
| 11     | 30 000 001 – 40 000 000   | 1 500 000      |
| 12     | 40 000 001 – 50 000 000   | 2 000 000      |

> **Borne de la classe 1.** Le texte publié dit « moins de 500 000 » puis fait
> démarrer la classe 2 à 500 001, laissant le montant exact de 500 000 sans
> classe. La borne haute est fixée à 500 000 **inclus** pour supprimer ce trou,
> dans le sens le plus favorable au contribuable.

Un barème dont une classe reste à zéro est traité comme incomplet : cette
classe est ignorée par les calculs (`classeForCa` ne la retourne jamais,
`montantAnnuel` renvoie `null`) et l'écran Paramètres l'affiche en
avertissement. Le barème est stocké dans le paramètre `igs_bareme` et reste
modifiable à chaque loi de finances sans redéploiement.

## Ce qui a été livré

### Base de données — `drizzle/0002_loose_lily_hollister.sql`

Migration **reprise à la main**. La version générée par drizzle-kit castait
`regime_fiscal` en énumération sans convertir les anciennes valeurs, ce qui
aurait échoué sur toute ligne portant `SIMPLIFIE` ou `IFU`. Ont été ajoutés :

- deux `UPDATE` de reprise (`SIMPLIFIE`/`IFU` → `IGS`, tout autre → `REEL`) ;
- l'ordre correct `DROP DEFAULT` → cast → `SET DEFAULT` ;
- l'insertion idempotente du barème par défaut (`ON CONFLICT DO NOTHING`).

Nouvelles colonnes sur `contribuables` : `igs_classe` (contrainte CHECK 1..12),
`cga_adherent`, `chiffre_affaires_annuel`. Nouvelles valeurs d'énumération :
`declaration_type.IGS`, `periodicite.TRIMESTRIELLE`.

### Logique métier — `src/lib/igs.ts`

Module pur et testable : `classeForCa`, `montantAnnuel` (abattement CGA),
`montantTrimestriel`, `depasseSeuilIgs`, `periodeTrimestre`,
`echeanceTrimestre`, `echeancesAnnee`, `classesACompleter`, `isBaremeComplet`.

### API

- `POST /api/declarations/generate` accepte désormais le mode
  `TRIMESTRIELLE` et **lit le régime du contribuable** pour décider des
  obligations à créer (`obligationsPourRegime`).
- `POST` / `PATCH /api/contribuables` normalisent la cohérence régime/classe :
  un basculement IGS → Réel efface la classe devenue caduque.

### Interface

- Formulaire contribuable : bloc **Paramètres IGS** conditionnel (classe,
  adhésion CGA), champ chiffre d'affaires, alerte de dépassement du seuil.
- Badge de régime affichant la classe (« IGS — classe 3 »).
- **Paramètres → Barème IGS** : éditeur tabulaire dédié (au lieu de l'éditeur
  JSON générique), avec bandeau listant les classes à compléter.
- Dialogue de génération : périodicité trimestrielle.

### Exports

Fiche PDF et export Excel des contribuables reprennent la classe IGS,
l'adhésion CGA et le chiffre d'affaires.

## Vérifications

| Contrôle    | Résultat                                    |
| ----------- | ------------------------------------------- |
| `typecheck` | 0 erreur                                    |
| `lint`      | 0 erreur, 6 avertissements React-Compiler   |
| `test`      | **64/64** (32 existants + 32 nouveaux)      |

Les nouveaux tests couvrent les bornes de tranches, l'abattement CGA,
l'arrondi du quart trimestriel, le rejet des classes non renseignées, le seuil
de sortie, la continuité des 12 tranches et les quatre échéances légales.

**Non vérifié à ce stade** : l'exécution réelle de la migration. Aucune base
PostgreSQL n'est accessible depuis le poste ; elle sera jouée sur la base de
production cPanel une fois l'accès distant ouvert.
