# Phase 11 — Facturation (honoraires + refacturation des impôts)

## Objet

Le cabinet adresse à ses clients une note mensuelle qui mélange trois choses :
les sommes à reverser au Trésor et à la CNPS, les frais avancés, et ses propres
honoraires. Cette phase industrialise ce document, à partir du prototype papier
fourni (`adn.pdf`), en corrigeant ses manques : ni numéro, ni TVA, ni suivi du
règlement.

## Modèle de données — `drizzle/0004_conscious_scarlet_witch.sql`

| Table            | Rôle                                                        |
| ---------------- | ----------------------------------------------------------- |
| `factures`       | En-tête : numéro, période, dates, statut, totaux, encaissé   |
| `facture_lignes` | Détail par nature, avec lien facultatif vers la déclaration  |
| `reglements`     | Encaissements successifs (mode, référence, date)             |

Ajout de `contribuables.honoraire_mensuel` : le montant convenu avec le client,
saisi à l'enregistrement du contribuable et **révisable à tout moment**.

Deux garanties d'intégrité portées par la base :

- `factures_numero_unique` — la numérotation ne peut pas produire de doublon,
  même si deux collaborateurs créent une facture au même instant ;
- `factures_ctb_periode_unique` — un contribuable n'a qu'une facture par
  période, ce qui rend la génération mensuelle **idempotente** : la relancer ne
  crée rien de nouveau.

## Règles retenues

- **TVA 19,25 % sur les seuls honoraires.** Les impôts, cotisations et frais
  bancaires sont des débours : ils transitent sans TVA. Le taux reste
  modifiable ligne à ligne.
- **Honoraires proposés, jamais imposés.** L'ERP pré-remplit le montant convenu
  et les échéances chiffrées de la période ; le collaborateur ajuste avant
  émission.
- **Brouillon puis validation.** La génération mensuelle ne produit que des
  brouillons — rien n'est envoyé sans relecture.
- **Une pièce émise ne se modifie ni ne se supprime.** Toute retouche de fond
  est refusée (409) au-delà du brouillon, et la suppression devient une
  annulation, pour que la numérotation reste continue et vérifiable.
- **Pas de sur-encaissement.** Un règlement supérieur au reste dû est rejeté.

## Logique pure — `src/lib/facturation.ts`

Totaux ligne à ligne (juste même avec plusieurs taux), reste à payer, statut
déduit du règlement et de l'échéance, numérotation `FA-2026-0001` remise à zéro
chaque année, et **montant en toutes lettres** avec les accords français
(« quatre-vingts », « deux cents », « mille » invariable, « soixante et onze »).

## API

| Route                                | Droit            |
| ------------------------------------ | ---------------- |
| `GET/POST /api/factures`             | `factures:read` / `create` |
| `GET/PATCH/DELETE /api/factures/{id}`| `read` / `update` / `delete` |
| `POST /api/factures/{id}/reglements` | `factures:update` |
| `POST /api/factures/generate`        | `factures:create` |
| `GET /api/factures/proposition`      | `factures:create` |
| `GET /api/exports/facture/{id}`      | `factures:read`  |

Nouvelle ressource RBAC `factures`, accordée aux profils Manager (complet) et
Collaborateur (sans suppression) par le seed.

## PDF sur papier entête

Le bandeau d'en-tête du papier entête est embarqué **en base64** dans le bundle
(`src/lib/exports/assets/entete.ts`) plutôt que lu sur disque : l'hébergement
cPanel ne conserve pas de façon fiable les fichiers non-JS hors du bundle.

> **Le bandeau de pied d'origine n'est pas repris.** Il imprime
> `NIU : M121700012100C` et `RCCM/RC/YDE/2021/B/12345`, qui ne sont pas les
> identifiants du cabinet. Le pied est redessiné dans la même charte à partir du
> paramètre `cabinet_identite`, avec le NIU **M082217553824H** et le RCCM
> **RC/YAO/2022/B/1538**.

## Vérifications

| Contrôle    | Résultat                                  |
| ----------- | ----------------------------------------- |
| `typecheck` | 0 erreur                                  |
| `lint`      | 0 erreur, 7 avertissements React-Compiler |
| `test`      | **99/99** (+26 sur la facturation)        |

**Le PDF a été rendu et inspecté visuellement** en rejouant le prototype
(41 140 F de débours + 25 000 F d'honoraires). Trois défauts ont été trouvés et
corrigés par ce contrôle :

1. `toLocaleString("fr-FR")` insère une espace fine insécable (U+202F) absente
   des polices Helvetica de pdfkit : les montants s'imprimaient `7 /540`.
   Corrigé par `formatNombre`.
2. Le bandeau de pied descendait sous la marge basse, ce qui faisait ajouter à
   pdfkit une **deuxième page vierge**.
3. « du mois de avril » — élision manquante devant les mois à initiale vocalique.

Un test compare par ailleurs le montant en lettres à celui du prototype
(« quarante et un mille cent quarante francs CFA »).

**Non vérifié** : l'exécution en base (migration, unicité, garde-fous 409).
Aucune base PostgreSQL n'est accessible depuis le poste.

## Reste à faire (Phase 12)

L'envoi automatique par email et WhatsApp à date fixe : les colonnes
`envoyee_le` et `canaux_envoi` sont en place et attendent leur service.
