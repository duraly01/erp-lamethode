"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { apiSend, messageErreur } from "@/lib/api-client";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { formatDateFR } from "@/lib/constants";
import { useTva, type Exercice, type LigneTva } from "./data";

/**
 * Déclaration de TVA du mois, lue dans les comptes.
 *
 * Aucun taux n'intervient : les montants sont ceux que portent les comptes de
 * TVA. Le détail par compte accompagne les totaux, car c'est par là qu'on
 * retrouve l'écriture à l'origine d'un montant inattendu.
 */

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Les mois de l'exercice, seules périodes déclarables ici. */
function moisDeLExercice(exercice: Exercice): { code: string; libelle: string }[] {
  const [anneeDebut, moisDebut] = exercice.dateDebut.split("-").map(Number);
  const [anneeFin, moisFin] = exercice.dateFin.split("-").map(Number);

  const periodes: { code: string; libelle: string }[] = [];
  let annee = anneeDebut;
  let mois = moisDebut;

  // Un exercice peut ne pas coïncider avec l'année civile : on parcourt du
  // premier au dernier mois qu'il couvre, sans présumer de douze.
  while (annee < anneeFin || (annee === anneeFin && mois <= moisFin)) {
    periodes.push({
      code: `${annee}-${String(mois).padStart(2, "0")}`,
      libelle: `${MOIS[mois - 1]} ${annee}`,
    });
    mois += 1;
    if (mois > 12) {
      mois = 1;
      annee += 1;
    }
  }

  return periodes;
}

function TableauTva({
  titre,
  lignes,
  total,
  sens,
}: {
  titre: string;
  lignes: LigneTva[];
  total: number;
  sens: string;
}) {
  return (
    <Card className="overflow-x-auto">
      <h3 className="border-b border-border p-3 font-semibold">{titre}</h3>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left font-medium">Compte</th>
            <th className="p-2 text-left font-medium">Intitulé</th>
            <th className="p-2 text-right font-medium">Débit</th>
            <th className="p-2 text-right font-medium">Crédit</th>
            <th className="p-2 text-right font-medium">{sens}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="p-6 text-center text-sm text-muted-foreground"
              >
                Aucun mouvement sur la période.
              </td>
            </tr>
          )}
          {lignes.map((l) => (
            <tr key={l.compteNumero} className="border-t border-border">
              <td className="p-2 font-mono text-xs">{l.compteNumero}</td>
              <td className="p-2">{l.compteLibelle}</td>
              <td className="p-2 text-right tabular-nums text-muted-foreground">
                {l.totalDebit === 0 ? "" : formatMontantAffichage(l.totalDebit)}
              </td>
              <td className="p-2 text-right tabular-nums text-muted-foreground">
                {l.totalCredit === 0
                  ? ""
                  : formatMontantAffichage(l.totalCredit)}
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatMontantAffichage(l.montant)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
          <tr>
            <td className="p-2" colSpan={4}>
              Total
            </td>
            <td className="p-2 text-right tabular-nums">
              {formatMontantAffichage(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

export function TvaPanel({ exercice }: { exercice: Exercice }) {
  const can = useCan();
  const qc = useQueryClient();

  const periodes = useMemo(() => moisDeLExercice(exercice), [exercice]);
  const [periode, setPeriode] = useState(periodes[0]?.code ?? "");
  const { data, isLoading } = useTva(exercice.id, periode);

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reporte, setReporte] = useState<string | null>(null);

  async function reporter() {
    setEnCours(true);
    setErreur(null);
    setReporte(null);
    try {
      await apiSend("/api/comptabilite/tva", "POST", {
        exerciceId: exercice.id,
        periode,
      });
      qc.invalidateQueries({ queryKey: ["cpta-tva"] });
      setReporte(periode);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="w-64">
          <Label htmlFor="tva-periode">Période déclarée</Label>
          <Select
            id="tva-periode"
            value={periode}
            onChange={(e) => {
              setPeriode(e.target.value);
              setReporte(null);
              setErreur(null);
            }}
          >
            {periodes.map((p) => (
              <option key={p.code} value={p.code}>
                {p.libelle}
              </option>
            ))}
          </Select>
        </div>

        {data?.declaration && (
          <p className="pb-1.5 text-sm text-muted-foreground">
            Échéance du {formatDateFR(data.declaration.dateEcheance)} ·{" "}
            {data.declaration.montant
              ? `montant suivi : ${formatMontantAffichage(Math.round(Number(data.declaration.montant) * 100))}`
              : "aucun montant reporté"}
          </p>
        )}

        {can("comptabilite", "update") && (
          <Button
            className="ml-auto"
            disabled={enCours || !data}
            onClick={reporter}
          >
            {enCours ? <Spinner /> : <FileUp className="h-4 w-4" />}
            Reporter sur la déclaration
          </Button>
        )}
      </Card>

      {erreur && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      {reporte === periode && (
        <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
          Montant reporté sur l&apos;échéance. Le statut de la déclaration
          n&apos;a pas changé : le montant est connu, la déclaration reste à
          déposer.
        </p>
      )}

      {isLoading && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}

      {data && (
        <>
          {data.tvaAnterieureNonLiquidee !== 0 && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Les comptes de TVA portent{" "}
                {formatMontantAffichage(data.tvaAnterieureNonLiquidee)}
                {" venus des périodes antérieures, qui n'ont donc pas été "}
                {"liquidées. Le calcul de ce mois reste juste, mais le crédit "}
                {"reporté se lit sur le compte 4449, qu'aucune écriture de "}
                {"liquidation n'alimente : il peut manquer."}
              </span>
            </p>
          )}

          <TableauTva
            titre="TVA collectée"
            lignes={data.collectee}
            total={data.totalCollectee}
            sens="Collectée"
          />
          <TableauTva
            titre="TVA déductible"
            lignes={data.deductible}
            total={data.totalDeductible}
            sens="Déductible"
          />

          <Card className="overflow-hidden">
            <h3 className="border-b border-border p-3 font-semibold">
              Liquidation du mois
            </h3>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-border">
                  <td className="p-3">TVA collectée</td>
                  <td className="p-3 text-right tabular-nums">
                    {formatMontantAffichage(data.totalCollectee)}
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="p-3">TVA déductible</td>
                  <td className="p-3 text-right tabular-nums">
                    − {formatMontantAffichage(data.totalDeductible)}
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="p-3">
                    Crédit de TVA antérieur
                    <span className="ml-2 text-xs text-muted-foreground">
                      compte 4449
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    − {formatMontantAffichage(data.creditAnterieur)}
                  </td>
                </tr>
                <tr className="bg-muted/30 text-base font-semibold">
                  <td className="p-3">
                    {data.creditAReporter > 0
                      ? "Crédit de TVA à reporter"
                      : "TVA à décaisser"}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatMontantAffichage(
                      data.creditAReporter > 0
                        ? data.creditAReporter
                        : data.tvaDue,
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          {data.creditAReporter > 0 && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              La période dégage un crédit : rien n&apos;est à payer, et le
              montant reporté sur l&apos;échéance sera nul. Le crédit
              s&apos;impute sur la période suivante une fois l&apos;écriture de
              liquidation passée.
            </p>
          )}
        </>
      )}

      {!isLoading && data && !data.declaration && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Aucune échéance de TVA n&apos;existe pour cette période. Générez
          d&apos;abord les échéances du contribuable depuis l&apos;écran
          Déclarations : les obligations découlent de son régime, elles ne se
          créent pas depuis la comptabilité.
        </p>
      )}
    </div>
  );
}
