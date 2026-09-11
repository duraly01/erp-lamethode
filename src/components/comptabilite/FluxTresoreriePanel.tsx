"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { useFluxTresorerie, type Exercice, type LigneFlux } from "./data";

/**
 * Tableau des flux de trésorerie SYSCOHADA révisé.
 *
 * Comme le bilan, il porte son propre contrôle : la trésorerie reconstituée
 * par les flux doit retrouver celle de la balance. Quand ce n'est pas le cas,
 * l'écart est affiché en tête, avec les comptes qui l'expliquent.
 */

const TITRES: Record<LigneFlux["section"], string> = {
  OUVERTURE: "",
  OPERATIONNEL: "Flux de trésorerie provenant des activités opérationnelles",
  INVESTISSEMENT: "Flux de trésorerie provenant des activités d'investissement",
  FINANCEMENT: "Flux de trésorerie provenant des activités de financement",
  CLOTURE: "",
};

/**
 * Un flux nul reste vide, un total s'imprime toujours. Les décaissements
 * gardent leur signe : c'est la lecture du modèle officiel, où la colonne
 * s'additionne de haut en bas.
 */
function montant(l: LigneFlux) {
  if (l.montant === 0 && !l.estTotal) return "";
  return formatMontantAffichage(l.montant);
}

export function FluxTresoreriePanel({ exercice }: { exercice: Exercice }) {
  const { data, isLoading } = useFluxTresorerie(exercice.id);

  if (isLoading) {
    return (
      <Card className="p-10 text-center">
        <Spinner />
      </Card>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      {!data.coherent && (
        <p className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Les flux ne retrouvent pas la trésorerie de clôture : ils
            reconstituent{" "}
            {formatMontantAffichage(data.tresorerieReconstituee)} pour{" "}
            {formatMontantAffichage(data.tresorerieCloture)} en balance, soit
            un écart de {formatMontantAffichage(data.ecart)}.
            {data.comptesHorsTableau.length > 0 ? (
              <>
                {" "}
                {data.comptesHorsTableau.length} compte
                {data.comptesHorsTableau.length > 1 ? "s" : ""} mouvementé
                {data.comptesHorsTableau.length > 1 ? "s" : ""} hors du tableau :
                <span className="mt-1 block font-mono text-xs">
                  {data.comptesHorsTableau
                    .map(
                      (c) =>
                        `${c.compteNumero} ${c.compteLibelle} (${formatMontantAffichage(c.variation)})`,
                    )
                    .join(" · ")}
                </span>
              </>
            ) : (
              " Tous les comptes sont rattachés : l'écart vient d'une opération passée sur des comptes que le tableau n'attend pas là — une cession, une affectation, une subvention."
            )}
          </span>
        </p>
      )}

      {data.sansANouveaux && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Aucune écriture d&apos;à-nouveaux : l&apos;exercice part d&apos;une
          trésorerie nulle, et tout ce qui a été repris — apport en capital,
          soldes d&apos;ouverture — apparaît ici comme un flux de la période.
          C&apos;est exact pour un premier exercice ; pour une reprise de
          dossier, passez les à-nouveaux sur le journal AN.
        </p>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left font-medium">Réf.</th>
              <th className="p-2 text-left font-medium">Flux</th>
              <th className="p-2 text-right font-medium">Exercice</th>
            </tr>
          </thead>
          <tbody>
            {data.lignes.map((l, i) => {
              // Un titre de section avant sa première ligne : la section
              // change par rapport à la ligne qui précède.
              const precedente = data.lignes[i - 1];
              const titre =
                precedente?.section !== l.section && TITRES[l.section]
                  ? TITRES[l.section]
                  : null;

              return (
                <FragmentLigne key={l.code} ligne={l} titre={titre} />
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FragmentLigne({
  ligne: l,
  titre,
}: {
  ligne: LigneFlux;
  titre: string | null;
}) {
  const estBorne = l.section === "OUVERTURE" || l.section === "CLOTURE";

  return (
    <>
      {titre && (
        <tr>
          <td
            colSpan={3}
            className="border-t border-border bg-muted/20 p-2 pt-4 text-xs font-semibold uppercase text-muted-foreground"
          >
            {titre}
          </td>
        </tr>
      )}
      <tr
        className={
          l.estTotal || estBorne
            ? "border-t border-border bg-muted/30 font-semibold"
            : ""
        }
      >
        <td className="p-2 font-mono text-xs text-muted-foreground">{l.code}</td>
        <td className={l.estTotal || estBorne ? "p-2" : "p-2 pl-6"}>
          {l.libelle}
        </td>
        <td
          className={
            "p-2 text-right tabular-nums" +
            (l.montant < 0 ? " text-danger" : "")
          }
        >
          {montant(l)}
        </td>
      </tr>
    </>
  );
}
