"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useContribuableOptions } from "@/hooks/useContribuableOptions";
import { PeriodesPanel } from "./PeriodesPanel";
import { SalariesPanel } from "./SalariesPanel";

/**
 * Écran de la paie (E4).
 *
 * Un seul cadre : le contribuable dont on fait la paie. Le mois, lui, se
 * choisit dans l'onglet des bulletins — la paie n'est pas liée à un exercice
 * comptable, elle court de mois en mois.
 */

type Onglet = "bulletins" | "salaries";

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "bulletins", libelle: "Mois de paie" },
  { cle: "salaries", libelle: "Salariés" },
];

export function PaieClient() {
  const { data: contribuables, isLoading } = useContribuableOptions();
  const [contribuableChoisi, setContribuableChoisi] = useState<number>();
  const [onglet, setOnglet] = useState<Onglet>("bulletins");

  const contribuableId = contribuables?.find((c) => c.id === contribuableChoisi)?.id ?? contribuables?.[0]?.id;

  if (isLoading) {
    return (
      <Card className="p-10 text-center">
        <Spinner />
      </Card>
    );
  }

  if (!contribuables?.length || contribuableId === undefined) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Aucun contribuable actif : créez-en un avant de faire une paie.</Card>;
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="w-72">
          <Label htmlFor="paie-contribuable">Contribuable</Label>
          <Select id="paie-contribuable" value={contribuableId} onChange={(e) => setContribuableChoisi(Number(e.target.value))}>
            {contribuables.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div role="tablist" className="flex gap-1 border-b border-border" aria-label="Vues de la paie">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            role="tab"
            aria-selected={onglet === o.cle}
            onClick={() => setOnglet(o.cle)}
            className={
              onglet === o.cle
                ? "-mb-px border-b-2 border-primary px-4 py-2 text-sm font-medium text-foreground"
                : "-mb-px border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {o.libelle}
          </button>
        ))}
      </div>

      {onglet === "bulletins" && <PeriodesPanel contribuableId={contribuableId} />}
      {onglet === "salaries" && <SalariesPanel contribuableId={contribuableId} />}
    </div>
  );
}
