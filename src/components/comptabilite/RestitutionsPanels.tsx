"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SearchInput } from "@/components/ui/search-input";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { useBalance, useGrandLivre, type Compte, type Exercice } from "./data";

/**
 * Restitutions comptables : balance, grand livre, plan comptable.
 *
 * Les montants arrivent en centimes entiers du moteur comptable et se
 * présentent tels quels — aucune division ici, qui réintroduirait le flottant
 * que tout le reste s'applique à éviter.
 */

/** Une valeur nulle se présente vide : une colonne de « 0 » ne se lit pas. */
function montant(centimes: number) {
  return centimes === 0 ? "" : formatMontantAffichage(centimes);
}

function Chargement() {
  return (
    <Card className="p-10 text-center">
      <Spinner />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

export function BalancePanel({ exercice }: { exercice: Exercice }) {
  const { data, isLoading } = useBalance(exercice.id);

  if (isLoading) return <Chargement />;
  if (!data) return null;

  const { lignes, totaux } = data;

  return (
    <div className="space-y-4">
      {!totaux.equilibree && (
        <p className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            La balance n&apos;est pas équilibrée. Chaque écriture l&apos;étant à
            sa validation, cela ne peut pas venir d&apos;une saisie : signalez-le
            avant d&apos;aller plus loin.
          </span>
        </p>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Compte</th>
              <th className="p-3 text-left font-medium">Intitulé</th>
              <th className="p-3 text-right font-medium">Mouvement débit</th>
              <th className="p-3 text-right font-medium">Mouvement crédit</th>
              <th className="p-3 text-right font-medium">Solde débiteur</th>
              <th className="p-3 text-right font-medium">Solde créditeur</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  Aucun mouvement sur cet exercice.
                </td>
              </tr>
            )}
            {lignes.map((l) => (
              <tr key={l.compteId} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{l.compteNumero}</td>
                <td className="p-3">{l.compteLibelle}</td>
                <td className="p-3 text-right tabular-nums">
                  {montant(l.totalDebit)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {montant(l.totalCredit)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {montant(l.soldeDebiteur)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {montant(l.soldeCrediteur)}
                </td>
              </tr>
            ))}
          </tbody>
          {lignes.length > 0 && (
            <tfoot className="border-t-2 border-border bg-muted/30 text-sm font-semibold">
              <tr>
                <td className="p-3" colSpan={2}>
                  Totaux
                </td>
                <td className="p-3 text-right tabular-nums">
                  {formatMontantAffichage(totaux.totalDebit)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {formatMontantAffichage(totaux.totalCredit)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {formatMontantAffichage(totaux.totalSoldeDebiteur)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {formatMontantAffichage(totaux.totalSoldeCrediteur)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grand livre
// ---------------------------------------------------------------------------

export function GrandLivrePanel({
  exercice,
  comptes,
}: {
  exercice: Exercice;
  comptes: Compte[];
}) {
  const [compteId, setCompteId] = useState<string>("");
  const { data, isLoading } = useGrandLivre(
    exercice.id,
    compteId ? Number(compteId) : undefined,
  );

  return (
    <div className="space-y-4">
      <div className="w-96">
        <Select
          aria-label="Filtrer par compte"
          value={compteId}
          onChange={(e) => setCompteId(e.target.value)}
        >
          <option value="">Tous les comptes mouvementés</option>
          {comptes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.numero} — {c.libelle}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && <Chargement />}

      {!isLoading && (data?.comptes.length ?? 0) === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Aucun mouvement sur cet exercice.
        </Card>
      )}

      {data?.comptes.map((c) => (
        <Card key={c.compteId} className="overflow-x-auto">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border p-3">
            <h3 className="font-semibold">
              <span className="font-mono text-sm">{c.compteNumero}</span>{" "}
              {c.compteLibelle}
            </h3>
            <p className="text-sm text-muted-foreground">
              Solde final :{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMontantAffichage(Math.abs(c.soldeFinal))}
              </span>{" "}
              {c.soldeFinal >= 0 ? "débiteur" : "créditeur"}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Date</th>
                <th className="p-2 text-left font-medium">Pièce</th>
                <th className="p-2 text-left font-medium">Jal</th>
                <th className="p-2 text-left font-medium">Libellé</th>
                <th className="p-2 text-left font-medium">Tiers</th>
                <th className="p-2 text-center font-medium">Let.</th>
                <th className="p-2 text-right font-medium">Débit</th>
                <th className="p-2 text-right font-medium">Crédit</th>
                <th className="p-2 text-right font-medium">Solde</th>
              </tr>
            </thead>
            <tbody>
              {c.lignes.map((l) => (
                <tr key={l.ligneId} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">{l.dateEcriture}</td>
                  <td className="p-2 font-mono text-xs">
                    {l.numeroPiece ?? "—"}
                  </td>
                  <td className="p-2">{l.journalCode}</td>
                  <td className="p-2">{l.libelle ?? ""}</td>
                  <td className="p-2">{l.tiersLibelle ?? ""}</td>
                  <td className="p-2 text-center font-mono text-xs">
                    {l.lettrage ?? ""}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {montant(l.debit)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {montant(l.credit)}
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {formatMontantAffichage(l.soldeProgressif)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan comptable
// ---------------------------------------------------------------------------

const LIBELLE_TYPE: Record<Compte["type"], string> = {
  ACTIF: "Actif",
  PASSIF: "Passif",
  CHARGE: "Charge",
  PRODUIT: "Produit",
};

export function PlanComptablePanel({ comptes }: { comptes: Compte[] }) {
  const [recherche, setRecherche] = useState("");

  const terme = recherche.trim().toLowerCase();
  const filtres = terme
    ? comptes.filter(
        (c) =>
          c.numero.startsWith(terme) ||
          c.libelle.toLowerCase().includes(terme),
      )
    : comptes;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-80">
          <SearchInput
            value={recherche}
            onChange={setRecherche}
            placeholder="Numéro ou intitulé…"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filtres.length} compte{filtres.length > 1 ? "s" : ""}
          {terme ? ` sur ${comptes.length}` : ""}
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Numéro</th>
              <th className="p-3 text-left font-medium">Intitulé</th>
              <th className="p-3 text-left font-medium">Classe</th>
              <th className="p-3 text-left font-medium">Nature</th>
              <th className="p-3 text-left font-medium">Particularités</th>
            </tr>
          </thead>
          <tbody>
            {filtres.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{c.numero}</td>
                <td className="p-3">{c.libelle}</td>
                <td className="p-3">{c.classe}</td>
                <td className="p-3">{LIBELLE_TYPE[c.type]}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {[
                    c.collectif ? "collectif" : null,
                    c.lettrable ? "lettrable" : null,
                    c.rapprochable ? "rapprochable" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
