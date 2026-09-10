// Calcul de pénalité — module pur (aucune dépendance serveur), testable unitairement.

export type Bareme =
  | { type: "pct"; valeur: number; minimum?: number }
  | { type: "fixe"; valeur: number };

export const DEFAULT_BAREME: Bareme = {
  type: "pct",
  valeur: 0.1,
  minimum: 50000,
};

/**
 * Calcule le montant d'une pénalité de retard.
 * - `fixe` : montant forfaitaire.
 * - `pct`  : pourcentage du montant dû, avec un minimum plancher.
 */
export function computePenalty(
  bareme: Bareme,
  montant: string | number | null,
): number {
  if (bareme.type === "fixe") return bareme.valeur;
  const base = montant == null || montant === "" ? 0 : Number(montant);
  const pct = base * bareme.valeur;
  return Math.max(pct, bareme.minimum ?? 0);
}
