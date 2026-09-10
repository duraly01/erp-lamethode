# Phase 5 — Composants réutilisables

**Statut :** livré & vérifié · *(réalisée après coup : les primitives existaient, mais la
factorisation transverse des modules restait à faire — c'est l'objet de cette phase.)*

---

## 1. Composants créés

| Composant | Fichier | Rôle |
|-----------|---------|------|
| **DataTable** | [`ui/data-table.tsx`](../src/components/ui/data-table.tsx) | Tableau générique : rendu, chargement, état vide, pagination (consolide `useReactTable`) |
| **ConfirmDialog** | [`ui/confirm-dialog.tsx`](../src/components/ui/confirm-dialog.tsx) | Dialogue de confirmation (suppression / désactivation) |
| **StatusBadge** | [`ui/status-badge.tsx`](../src/components/ui/status-badge.tsx) | `DeclarationStatusBadge` (recalcule le retard), `AcfStatusBadge`, `RegimeBadge`, `ActifBadge` |
| **SearchInput** | [`ui/search-input.tsx`](../src/components/ui/search-input.tsx) | Barre de recherche avec icône |

## 2. Modules refactorisés

Les **6 clients** (Contribuables, Déclarations, ACF, CNPS, Documents, Utilisateurs) **et le
Dashboard** consomment désormais ces composants au lieu de dupliquer :

- l'échafaudage `<Card><table>…thead/tbody/chargement/vide…</table><Pagination/></Card>` → **`DataTable`** ;
- les dialogues de suppression → **`ConfirmDialog`** ;
- les badges de statut/régime ad hoc → **`StatusBadge`** ;
- la barre de recherche → **`SearchInput`**.

### Bénéfices mesurés
- Chaque client perd ~60–100 lignes de code répété.
- Les **avertissements React Compiler** (`useReactTable` non mémoïsable) passent de **9 à 5** :
  la logique de table n'existe plus qu'à **un seul endroit** (`DataTable`).
- Un changement d'apparence du tableau (ligne, en-tête, pagination) se fait une fois pour tous.

## 3. Vérifications

✅ `typecheck` 0 erreur · ✅ `lint` **0 erreur** (5 avertissements React Compiler résiduels,
sans impact) · ✅ **32/32** tests · ✅ rendu navigateur des modules refactorisés (données,
tri, badges, pagination) conforme.

---

## ✅ Avec cette phase, les 8 phases (1→8) du plan initial sont toutes livrées.
