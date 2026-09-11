"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { apiSend, messageErreur } from "@/lib/api-client";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { formatDateFR } from "@/lib/constants";
import { useDsf, type Exercice, type RetraitementsSaisis } from "./data";

/**
 * DSF : liquidation de l'impôt sur le résultat.
 *
 * Les états financiers ne sont pas répétés ici — ils ont leur propre onglet, et
 * les dupliquer exposerait à en lire une version pendant que l'autre change.
 * Cet écran traite la seule chose que la comptabilité ne donne pas
 * directement : le passage du résultat comptable à l'impôt dû.
 */

const RIEN: RetraitementsSaisis = { reintegrations: "", deductions: "" };

/** Un montant inconnu se présente vide, jamais à zéro. */
function montant(centimes: number | null) {
  if (centimes === null) return <span className="text-muted-foreground">—</span>;
  return formatMontantAffichage(centimes);
}

function Ligne({
  libelle,
  aide,
  valeur,
  signe,
  fort,
}: {
  libelle: string;
  aide?: string;
  valeur: React.ReactNode;
  signe?: "+" | "−";
  fort?: boolean;
}) {
  return (
    <tr
      className={
        fort
          ? "border-t-2 border-border bg-muted/30 text-base font-semibold"
          : "border-t border-border"
      }
    >
      <td className="p-3">
        {libelle}
        {aide && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {aide}
          </span>
        )}
      </td>
      <td className="p-3 text-right tabular-nums">
        {signe && <span className="mr-1 text-muted-foreground">{signe}</span>}
        {valeur}
      </td>
    </tr>
  );
}

export function DsfPanel({ exercice }: { exercice: Exercice }) {
  const can = useCan();
  const qc = useQueryClient();

  // Les retraitements saisis ne partent au serveur qu'une fois appliqués : une
  // requête par frappe donnerait des montants qui dansent pendant la saisie.
  const [saisie, setSaisie] = useState<RetraitementsSaisis>(RIEN);
  const [appliques, setAppliques] = useState<RetraitementsSaisis>(RIEN);
  const { data, isLoading } = useDsf(exercice.id, appliques);

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reporte, setReporte] = useState(false);

  const enAttente =
    saisie.reintegrations !== appliques.reintegrations ||
    saisie.deductions !== appliques.deductions;

  async function reporter() {
    setEnCours(true);
    setErreur(null);
    setReporte(false);
    try {
      await apiSend("/api/comptabilite/dsf", "POST", {
        exerciceId: exercice.id,
        reintegrations: appliques.reintegrations || "0",
        deductions: appliques.deductions || "0",
      });
      qc.invalidateQueries({ queryKey: ["cpta-dsf"] });
      setReporte(true);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  const l = data?.liquidation;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="w-48">
          <Label htmlFor="dsf-reint">Réintégrations</Label>
          <Input
            id="dsf-reint"
            inputMode="decimal"
            placeholder="0"
            value={saisie.reintegrations}
            onChange={(e) =>
              setSaisie((s) => ({ ...s, reintegrations: e.target.value }))
            }
          />
        </div>
        <div className="w-48">
          <Label htmlFor="dsf-deduc">Déductions</Label>
          <Input
            id="dsf-deduc"
            inputMode="decimal"
            placeholder="0"
            value={saisie.deductions}
            onChange={(e) =>
              setSaisie((s) => ({ ...s, deductions: e.target.value }))
            }
          />
        </div>

        <Button
          variant="outline"
          disabled={!enAttente}
          onClick={() => {
            setAppliques(saisie);
            setReporte(false);
          }}
        >
          Appliquer
        </Button>

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
            disabled={enCours || !data || !!l?.baremeManquant}
            onClick={reporter}
          >
            {enCours ? <Spinner /> : <FileUp className="h-4 w-4" />}
            Reporter sur la déclaration
          </Button>
        )}
      </Card>

      <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Les retraitements relèvent de votre appréciation — charges non
        déductibles, produits exonérés — et ne se déduisent d&apos;aucune
        écriture. Ils ne sont pas encore conservés d&apos;une consultation à
        l&apos;autre : notez-les si vous devez y revenir.
      </p>

      {erreur && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      {reporte && (
        <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
          Solde reporté sur l&apos;échéance DSF. Le statut de la déclaration
          n&apos;a pas changé.
        </p>
      )}

      {isLoading && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}

      {data && l && (
        <>
          {l.baremeManquant && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <Settings className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Le barème de l&apos;impôt sur le résultat n&apos;est pas
                paramétré : l&apos;impôt n&apos;est pas calculable et le report
                est bloqué. Renseignez la clé{" "}
                <span className="font-mono text-xs">
                  impot_resultat_bareme
                </span>{" "}
                dans les paramètres, avec le taux d&apos;impôt et le taux du
                minimum de perception en vigueur pour l&apos;exercice{" "}
                {data.annee}.
              </span>
            </p>
          )}

          {!l.baremeManquant && l.minimumApplique && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Le minimum de perception dépasse l&apos;impôt calculé sur le
                résultat : c&apos;est lui qui est dû. Il est assis sur le
                chiffre d&apos;affaires, et reste donc exigible même sur un
                exercice déficitaire.
              </span>
            </p>
          )}

          <Card className="overflow-hidden">
            <h3 className="border-b border-border p-3 font-semibold">
              Du résultat comptable à l&apos;impôt — exercice {data.annee}
            </h3>
            <table className="w-full text-sm">
              <tbody>
                <Ligne
                  libelle="Résultat comptable"
                  aide="compte de résultat"
                  valeur={formatMontantAffichage(l.resultatComptable)}
                />
                <Ligne
                  libelle="Réintégrations"
                  signe="+"
                  valeur={formatMontantAffichage(l.reintegrations)}
                />
                <Ligne
                  libelle="Déductions"
                  signe="−"
                  valeur={formatMontantAffichage(l.deductions)}
                />
                <Ligne
                  libelle="Résultat fiscal"
                  valeur={formatMontantAffichage(l.resultatFiscal)}
                  fort
                />
                <Ligne
                  libelle="Impôt sur le résultat"
                  valeur={montant(l.impotSurResultat)}
                />
                <Ligne
                  libelle="Minimum de perception"
                  aide={`assis sur un chiffre d'affaires de ${formatMontantAffichage(l.chiffreAffaires)}`}
                  valeur={montant(l.minimumPerception)}
                />
                <Ligne
                  libelle="Impôt de l'exercice"
                  aide="le plus élevé des deux"
                  valeur={montant(l.impotRetenu)}
                  fort
                />
                <Ligne
                  libelle="Acomptes versés"
                  aide="comptes 4473 et 441"
                  signe="−"
                  valeur={formatMontantAffichage(l.acomptesVerses)}
                />
                <Ligne
                  libelle={
                    (l.creditImpot ?? 0) > 0
                      ? "Crédit d'impôt"
                      : "Solde à payer"
                  }
                  valeur={montant(
                    (l.creditImpot ?? 0) > 0 ? l.creditImpot : l.soldeAPayer,
                  )}
                  fort
                />
              </tbody>
            </table>
          </Card>

          {!data.etats.bilan.equilibre && (
            <p className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Le bilan de l&apos;exercice n&apos;est pas équilibré : la liasse
                n&apos;est pas déposable en l&apos;état. Voyez l&apos;onglet
                États financiers.
              </span>
            </p>
          )}

          {!data.declaration && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Aucune échéance DSF n&apos;existe pour {data.annee}. Générez
              d&apos;abord les échéances du contribuable depuis l&apos;écran
              Déclarations.
            </p>
          )}
        </>
      )}
    </div>
  );
}
