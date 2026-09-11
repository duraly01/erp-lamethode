"use client";

import { useState } from "react";
import type { Exercice } from "./data";
import { EtatsFinanciersPanel } from "./EtatsFinanciersPanel";
import { FluxTresoreriePanel } from "./FluxTresoreriePanel";
import { NotesAnnexesPanel } from "./NotesAnnexesPanel";

/**
 * La liasse : bilan et compte de résultat, tableau des flux, notes annexes.
 *
 * Trois états qui se lisent ensemble et se déposent ensemble. Les regrouper
 * sous un seul onglet tient la barre de navigation à une longueur lisible, et
 * dit quelque chose de vrai : ce sont les pièces d'un même document.
 */

type Etat = "etats" | "flux" | "notes";

const ETATS: { cle: Etat; libelle: string }[] = [
  { cle: "etats", libelle: "Bilan et compte de résultat" },
  { cle: "flux", libelle: "Flux de trésorerie" },
  { cle: "notes", libelle: "Notes annexes" },
];

export function LiassePanel({ exercice }: { exercice: Exercice }) {
  const [etat, setEtat] = useState<Etat>("etats");

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="États de la liasse"
        className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1"
      >
        {ETATS.map((e) => (
          <button
            key={e.cle}
            role="tab"
            aria-selected={etat === e.cle}
            onClick={() => setEtat(e.cle)}
            className={
              etat === e.cle
                ? "rounded px-3 py-1.5 text-sm font-medium bg-card text-foreground shadow-sm"
                : "rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {e.libelle}
          </button>
        ))}
      </div>

      {etat === "etats" && <EtatsFinanciersPanel exercice={exercice} />}
      {etat === "flux" && <FluxTresoreriePanel exercice={exercice} />}
      {etat === "notes" && <NotesAnnexesPanel exercice={exercice} />}
    </div>
  );
}
