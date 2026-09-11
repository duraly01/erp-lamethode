"use client";

import { useState } from "react";
import type { Compte, Exercice, Journal, Taxe, Tiers } from "./data";
import { PiecesPanel } from "./PiecesPanel";
import { PiecesListe } from "./PiecesListe";

/**
 * Saisie assistée : saisir une pièce, ou retrouver celles qui l'ont été.
 *
 * Les deux vont ensemble — on revient sur une facture pour suivre son
 * règlement ou vérifier ce qu'elle a produit — sans que la barre d'onglets
 * n'ait à s'allonger.
 */

type Vue = "nouvelle" | "liste";

export function SaisieAssisteePanel(props: {
  exercice: Exercice;
  comptes: Compte[];
  journaux: Journal[];
  tiers: Tiers[];
  taxes: Taxe[];
}) {
  const [vue, setVue] = useState<Vue>("nouvelle");

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Saisie assistée"
        className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1"
      >
        {(
          [
            ["nouvelle", "Nouvelle pièce"],
            ["liste", "Pièces enregistrées"],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            role="tab"
            aria-selected={vue === cle}
            onClick={() => setVue(cle)}
            className={
              vue === cle
                ? "rounded bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
                : "rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {libelle}
          </button>
        ))}
      </div>

      {vue === "nouvelle" && <PiecesPanel {...props} />}
      {vue === "liste" && <PiecesListe exercice={props.exercice} tiers={props.tiers} />}
    </div>
  );
}
