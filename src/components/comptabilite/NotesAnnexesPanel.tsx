"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, PenLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { useNotesAnnexes, type Exercice, type Note } from "./data";

/**
 * Notes annexes chiffrées.
 *
 * Chaque note détaille un ou plusieurs postes compte par compte. Une note vide
 * reste listée mais repliée, marquée « néant » : sur une liasse, une note
 * absente et une note à néant ne se lisent pas de la même façon.
 */

function montant(centimes: number, toujours = false) {
  if (centimes === 0 && !toujours) return "";
  return formatMontantAffichage(centimes);
}

const EN_TETES: Record<Note["forme"], string[]> = {
  MOUVEMENTS: ["Début d'exercice", "Augmentations", "Diminutions", "Fin d'exercice"],
  SOLDES: ["Début d'exercice", "Fin d'exercice", "Variation"],
  CHARGES_PRODUITS: ["Exercice"],
};

function cellules(n: Note, l: Note["lignes"][number]): number[] {
  if (n.forme === "MOUVEMENTS") {
    const x = l as (typeof n.lignes)[number];
    return [x.debut, x.augmentations, x.diminutions, x.fin];
  }
  if (n.forme === "SOLDES") {
    const x = l as (typeof n.lignes)[number];
    return [x.debut, x.fin, x.variation];
  }
  return [(l as (typeof n.lignes)[number]).montant];
}

function totaux(n: Note): number[] {
  if (n.forme === "MOUVEMENTS") {
    return [n.total.debut, n.total.augmentations, n.total.diminutions, n.total.fin];
  }
  if (n.forme === "SOLDES") return [n.total.debut, n.total.fin, n.total.variation];
  return [n.total];
}

function NoteCard({ note }: { note: Note }) {
  const neant = note.lignes.length === 0;
  const [ouverte, setOuverte] = useState(!neant);
  const Fleche = ouverte ? ChevronDown : ChevronRight;
  const colonnes = EN_TETES[note.forme];

  return (
    <Card className="overflow-x-auto">
      <button
        onClick={() => setOuverte((v) => !v)}
        aria-expanded={ouverte}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <Fleche className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">
          Note {note.definition.numero}
        </span>
        <span className="font-semibold">{note.definition.libelle}</span>
        {neant && (
          <span className="ml-auto text-xs uppercase text-muted-foreground">
            néant
          </span>
        )}
      </button>

      {ouverte && !neant && (
        <table className="w-full border-t border-border text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left font-medium">Compte</th>
              <th className="p-2 text-left font-medium">Intitulé</th>
              {colonnes.map((c) => (
                <th key={c} className="p-2 text-right font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {note.lignes.map((l) => (
              <tr key={l.compteNumero} className="border-t border-border">
                <td className="p-2 font-mono text-xs">{l.compteNumero}</td>
                <td className="p-2">{l.compteLibelle}</td>
                {cellules(note, l).map((v, i) => (
                  <td key={i} className="p-2 text-right tabular-nums">
                    {montant(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
            <tr>
              <td className="p-2" colSpan={2}>
                Total
              </td>
              {totaux(note).map((v, i) => (
                <td key={i} className="p-2 text-right tabular-nums">
                  {montant(v, true)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  );
}

export function NotesAnnexesPanel({ exercice }: { exercice: Exercice }) {
  const { data, isLoading } = useNotesAnnexes(exercice.id);

  if (isLoading) {
    return (
      <Card className="p-10 text-center">
        <Spinner />
      </Card>
    );
  }
  if (!data) return null;

  const remplies = data.notes.filter((n) => n.lignes.length > 0).length;

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        {remplies} note{remplies > 1 ? "s" : ""} chiffrée
        {remplies > 1 ? "s" : ""} sur {data.notes.length}, calculée
        {remplies > 1 ? "s" : ""}
        {" depuis les livres. La numérotation suit le modèle du système normal à titre indicatif et reste à confirmer par l'expert-comptable."}
        {data.sansANouveaux &&
          " Sans à-nouveaux, les colonnes de début d'exercice sont à zéro."}
      </p>

      {data.notes.map((n) => (
        <NoteCard key={n.definition.code} note={n} />
      ))}

      <Card className="p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <PenLine className="h-4 w-4 text-muted-foreground" />
          Notes à rédiger
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ces notes font partie de la liasse mais ne se déduisent pas des
          écritures. Elles sont rappelées ici pour ne pas être oubliées.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {data.aRediger.map((n) => (
            <li key={n.numero} className="flex gap-3">
              <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                {n.numero}
              </span>
              <span>{n.libelle}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
