"use client";

import { useState } from "react";
import { FileText, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { formatDateFR } from "@/lib/constants";
import {
  usePieces,
  usePiece,
  type Exercice,
  type Piece,
  type StatutComptable,
  type StatutReglement,
  type Tiers,
  type TypePiece,
} from "./data";

/**
 * Pièces enregistrées de l'exercice.
 *
 * Deux statuts par pièce, tous deux dérivés et jamais stockés : celui de la
 * comptabilisation se lit sur l'écriture liée, celui du règlement sur le
 * lettrage. Un statut recopié finirait par diverger de ce qu'il résume.
 */

const TYPE: Record<TypePiece, string> = {
  FACTURE_VENTE: "Vente",
  FACTURE_ACHAT: "Achat",
};

const COMPTABLE: Record<StatutComptable, { libelle: string; classe: string }> = {
  NON_COMPTABILISEE: { libelle: "À comptabiliser", classe: "bg-danger/10 text-danger" },
  BROUILLON: { libelle: "Brouillon", classe: "bg-muted text-muted-foreground" },
  VALIDEE: { libelle: "Comptabilisée", classe: "bg-success/15 text-success" },
  CONTREPASSEE: { libelle: "Contre-passée", classe: "bg-warning/15 text-warning" },
};

const REGLEMENT: Record<StatutReglement, { libelle: string; classe: string }> = {
  SANS_OBJET: { libelle: "—", classe: "bg-transparent text-muted-foreground" },
  EN_ATTENTE: { libelle: "En attente", classe: "bg-muted text-muted-foreground" },
  EN_RETARD: { libelle: "En retard", classe: "bg-danger/10 text-danger" },
  REGLEE: { libelle: "Réglée", classe: "bg-success/15 text-success" },
};

/** Un lien qui s'ouvre dans un onglet, habillé comme un bouton « outline ». */
const LIEN_BOUTON =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted";

function francs(numeric: string) {
  return formatMontantAffichage(Math.round(Number(numeric) * 100));
}

function DetailPiece({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = usePiece(id);

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        data
          ? `${TYPE[data.type]} ${data.reference ?? ""} — ${data.tiers.raisonSociale}`.replace(/\s+—/, " —")
          : "Pièce"
      }
      description={
        data
          ? `${formatDateFR(data.datePiece)}${data.dateEcheance ? ` · échéance ${formatDateFR(data.dateEcheance)}` : ""}${data.numeroPiece ? ` · écriture ${data.numeroPiece}` : ""}`
          : undefined
      }
      className="max-w-3xl"
    >
      {isLoading && (
        <div className="p-6 text-center">
          <Spinner />
        </div>
      )}
      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={"border-transparent " + COMPTABLE[data.statutComptable].classe}>
              {COMPTABLE[data.statutComptable].libelle}
            </Badge>
            {data.statutReglement !== "SANS_OBJET" && (
              <Badge className={"border-transparent " + REGLEMENT[data.statutReglement].classe}>
                {REGLEMENT[data.statutReglement].libelle}
              </Badge>
            )}
            {/* La facture ne s'imprime que pour une vente : un achat, c'est le fournisseur qui l'a émis. */}
            <div className="ml-auto flex gap-2">
              {data.type === "FACTURE_VENTE" && (
                <a href={`/api/comptabilite/pieces/${data.id}/pdf?modele=facture`} target="_blank" rel="noreferrer" className={LIEN_BOUTON}>
                  <Printer className="h-4 w-4" />
                  Imprimer la facture
                </a>
              )}
              <a href={`/api/comptabilite/pieces/${data.id}/pdf?modele=comptable`} target="_blank" rel="noreferrer" className={LIEN_BOUTON}>
                <FileText className="h-4 w-4" />
                Fiche d&apos;imputation
              </a>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Compte</th>
                <th className="p-2 text-left font-medium">Libellé</th>
                <th className="p-2 text-right font-medium">Montant HT</th>
                <th className="p-2 text-left font-medium">TVA</th>
              </tr>
            </thead>
            <tbody>
              {data.lignes.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-2">
                    <span className="font-mono text-xs">{l.compteNumero}</span> {l.compteLibelle}
                  </td>
                  <td className="p-2 text-muted-foreground">{l.libelle ?? ""}</td>
                  <td className="p-2 text-right tabular-nums">{francs(l.montantHt)}</td>
                  <td className="p-2 text-muted-foreground">{l.taxeLibelle ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border font-medium">
              <tr>
                <td className="p-2" colSpan={2}>
                  Total HT
                </td>
                <td className="p-2 text-right tabular-nums">{francs(data.totalHt)}</td>
                <td />
              </tr>
              <tr>
                <td className="p-2" colSpan={2}>
                  TVA
                </td>
                <td className="p-2 text-right tabular-nums">{francs(data.totalTva)}</td>
                <td />
              </tr>
              <tr className="bg-muted/30 text-base font-semibold">
                <td className="p-2" colSpan={2}>
                  Total TTC
                </td>
                <td className="p-2 text-right tabular-nums">{francs(data.totalTtc)}</td>
                <td />
              </tr>
            </tfoot>
          </table>

          {data.statutComptable === "NON_COMPTABILISEE" && (
            <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              Le brouillon de cette pièce a été supprimé : elle n&apos;est plus dans
              les livres. Ressaisissez-la depuis « Nouvelle pièce » pour la
              recomptabiliser.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

export function PiecesListe({ exercice, tiers }: { exercice: Exercice; tiers: Tiers[] }) {
  const [type, setType] = useState<"" | TypePiece>("");
  const [tiersId, setTiersId] = useState("");
  const [ouverte, setOuverte] = useState<number | null>(null);

  const { data, isLoading } = usePieces(exercice.id, {
    type: type || undefined,
    tiersId: tiersId ? Number(tiersId) : undefined,
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="w-44">
          <Label htmlFor="pieces-type">Type</Label>
          <Select id="pieces-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="">Toutes</option>
            <option value="FACTURE_VENTE">Ventes</option>
            <option value="FACTURE_ACHAT">Achats</option>
          </Select>
        </div>
        <div className="w-72">
          <Label htmlFor="pieces-tiers">Tiers</Label>
          <Select id="pieces-tiers" value={tiersId} onChange={(e) => setTiersId(e.target.value)}>
            <option value="">Tous</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.raisonSociale}
              </option>
            ))}
          </Select>
        </div>
        {data && (
          <p className="pb-2 text-sm text-muted-foreground">
            {data.length} pièce{data.length > 1 ? "s" : ""}
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Date</th>
              <th className="p-3 text-left font-medium">Type</th>
              <th className="p-3 text-left font-medium">Référence</th>
              <th className="p-3 text-left font-medium">Tiers</th>
              <th className="p-3 text-right font-medium">TTC</th>
              <th className="p-3 text-left font-medium">Échéance</th>
              <th className="p-3 text-left font-medium">Comptabilité</th>
              <th className="p-3 text-left font-medium">Règlement</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-8 text-center">
                  <Spinner />
                </td>
              </tr>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                  Aucune pièce sur cet exercice.
                </td>
              </tr>
            )}
            {data?.map((p: Piece) => (
              <tr
                key={p.id}
                className="cursor-pointer border-t border-border hover:bg-muted/30"
                onClick={() => setOuverte(p.id)}
              >
                <td className="p-3 whitespace-nowrap">{formatDateFR(p.datePiece)}</td>
                <td className="p-3">{TYPE[p.type]}</td>
                <td className="p-3 font-mono text-xs">{p.reference ?? "—"}</td>
                <td className="p-3">{p.tiers.raisonSociale}</td>
                <td className="p-3 text-right tabular-nums">{francs(p.totalTtc)}</td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {p.dateEcheance ? formatDateFR(p.dateEcheance) : ""}
                </td>
                <td className="p-3">
                  <Badge className={"border-transparent " + COMPTABLE[p.statutComptable].classe}>
                    {COMPTABLE[p.statutComptable].libelle}
                  </Badge>
                </td>
                <td className="p-3">
                  {p.statutReglement !== "SANS_OBJET" && (
                    <Badge className={"border-transparent " + REGLEMENT[p.statutReglement].classe}>
                      {REGLEMENT[p.statutReglement].libelle}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {ouverte !== null && <DetailPiece id={ouverte} onClose={() => setOuverte(null)} />}
    </div>
  );
}
