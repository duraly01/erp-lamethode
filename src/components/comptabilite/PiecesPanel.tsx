"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { apiSend, messageErreur } from "@/lib/api-client";
import { parseMontant, formatMontantAffichage } from "@/lib/comptable/money";
import {
  genererFactureVente,
  genererFactureAchat,
  genererReglement,
  PieceInvalideError,
  type EcritureGeneree,
} from "@/lib/comptable/generation";
import {
  CLES_A_RAFRAICHIR,
  type Compte,
  type Exercice,
  type Journal,
  type Taxe,
  type Tiers,
} from "./data";

/**
 * Saisie assistée : une facture ou un règlement, et l'écriture en sort.
 *
 * Le moteur de génération est pur : il tourne ici, dans le navigateur, pour
 * montrer **l'écriture exacte** qui sera enregistrée, à mesure que la pièce se
 * remplit. Ce que l'on voit est ce que le serveur produira — même code, mêmes
 * arrondis. Le serveur, lui, recharge tiers et taxes et refait le calcul : la
 * prévisualisation n'est pas une source de confiance, c'est une aide à la
 * lecture.
 */

type TypePiece = "VENTE" | "ACHAT" | "REGLEMENT";

const TYPES: { cle: TypePiece; libelle: string }[] = [
  { cle: "VENTE", libelle: "Facture de vente" },
  { cle: "ACHAT", libelle: "Facture d'achat" },
  { cle: "REGLEMENT", libelle: "Règlement" },
];

type LigneSaisie = {
  compteId: string;
  libelle: string;
  montantHt: string;
  taxeId: string;
};

const LIGNE_VIDE: LigneSaisie = { compteId: "", libelle: "", montantHt: "", taxeId: "" };

/** Une taxe est proposée si elle est en vigueur à la date de la pièce. */
function enVigueur(t: Taxe, date: string) {
  return t.valideDu <= date && (t.valideAu === null || t.valideAu >= date);
}

export function PiecesPanel({
  exercice,
  comptes,
  journaux,
  tiers,
  taxes,
}: {
  exercice: Exercice;
  comptes: Compte[];
  journaux: Journal[];
  tiers: Tiers[];
  taxes: Taxe[];
}) {
  const can = useCan();
  const qc = useQueryClient();

  const [type, setType] = useState<TypePiece>("VENTE");
  const [date, setDate] = useState(exercice.dateDebut);
  const [reference, setReference] = useState("");
  const [dateEcheance, setDateEcheance] = useState("");
  const [tiersId, setTiersId] = useState("");
  const [lignes, setLignes] = useState<LigneSaisie[]>([LIGNE_VIDE]);
  const [journalId, setJournalId] = useState("");
  const [montant, setMontant] = useState("");
  const [sens, setSens] = useState<"ENCAISSEMENT" | "DECAISSEMENT">("ENCAISSEMENT");

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const exerciceOuvert = exercice.statut === "OUVERT";
  const compteParId = useMemo(() => new Map(comptes.map((c) => [c.id, c])), [comptes]);

  // Les tiers qui ont un compte collectif : les autres ne peuvent pas recevoir
  // de pièce, et les proposer ne ferait que promettre une erreur.
  const tiersImputables = useMemo(
    () => tiers.filter((t) => t.compteId !== null),
    [tiers],
  );
  const tiersChoisi = tiers.find((t) => String(t.id) === tiersId);

  const journauxTresorerie = useMemo(
    () => journaux.filter((j) => j.type === "BANQUE" || j.type === "CAISSE"),
    [journaux],
  );

  // Les comptes proposés pour les lignes : produits pour une vente, charges
  // pour un achat. Le plan entier reste accessible plus bas dans la liste.
  const comptesLignes = useMemo(() => {
    const classe = type === "VENTE" ? "7" : "6";
    const prioritaires = comptes.filter((c) => c.numero.startsWith(classe) && c.actif);
    const autres = comptes.filter((c) => !c.numero.startsWith(classe) && c.actif);
    return { prioritaires, autres };
  }, [comptes, type]);

  const taxesProposees = useMemo(() => {
    const typeTaxe = type === "VENTE" ? "TVA_COLLECTEE" : "TVA_DEDUCTIBLE";
    return taxes.filter((t) => t.type === typeTaxe && t.compteId && enVigueur(t, date));
  }, [taxes, type, date]);

  // --- Prévisualisation -------------------------------------------------------

  const apercu = useMemo((): { ecriture: EcritureGeneree | null; probleme: string | null } => {
    if (!tiersChoisi?.compteId) return { ecriture: null, probleme: null };
    const t = { id: tiersChoisi.id, compteId: tiersChoisi.compteId, raisonSociale: tiersChoisi.raisonSociale };

    try {
      if (type === "REGLEMENT") {
        const journal = journaux.find((j) => String(j.id) === journalId);
        if (!journal || !montant) return { ecriture: null, probleme: null };
        if (!journal.compteContrepartieId) {
          return {
            ecriture: null,
            probleme: `Le journal ${journal.code} n'a pas de compte de contrepartie.`,
          };
        }
        return {
          ecriture: genererReglement({
            tiers: t,
            compteTresorerieId: journal.compteContrepartieId,
            montant: parseMontant(montant),
            sens,
            reference: reference || null,
          }),
          probleme: null,
        };
      }

      const pretes = lignes.filter((l) => l.compteId && l.montantHt);
      if (pretes.length === 0) return { ecriture: null, probleme: null };
      const lignesPiece = pretes.map((l) => {
        const taxe = taxes.find((x) => String(x.id) === l.taxeId);
        return {
          compteId: Number(l.compteId),
          libelle: l.libelle || null,
          montantHt: parseMontant(l.montantHt),
          taxe: taxe && taxe.compteId ? { id: taxe.id, taux: taxe.taux, compteId: taxe.compteId } : null,
        };
      });
      const p = { lignes: lignesPiece, reference: reference || null, dateEcheance: dateEcheance || null };
      return {
        ecriture:
          type === "VENTE"
            ? genererFactureVente({ client: t, ...p })
            : genererFactureAchat({ fournisseur: t, ...p }),
        probleme: null,
      };
    } catch (e) {
      return {
        ecriture: null,
        probleme: e instanceof PieceInvalideError ? e.message : "Montant illisible.",
      };
    }
  }, [type, tiersChoisi, lignes, taxes, reference, dateEcheance, journalId, journaux, montant, sens]);

  // --- Enregistrement ---------------------------------------------------------

  function reinitialiser() {
    setReference("");
    setDateEcheance("");
    setLignes([LIGNE_VIDE]);
    setMontant("");
  }

  async function enregistrer(valider: boolean) {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    try {
      const commun = {
        exerciceId: exercice.id,
        dateEcriture: date,
        reference: reference || null,
        tiersId: Number(tiersId),
        valider,
      };
      const res =
        type === "REGLEMENT"
          ? await apiSend<{ ecriture: { numeroPiece: string | null; statut: string } }>(
              "/api/comptabilite/pieces/reglement",
              "POST",
              { ...commun, journalId: Number(journalId), montant, sens },
            )
          : await apiSend<{ ecriture: { numeroPiece: string | null; statut: string } }>(
              `/api/comptabilite/pieces/${type === "VENTE" ? "facture-vente" : "facture-achat"}`,
              "POST",
              {
                ...commun,
                dateEcheance: dateEcheance || null,
                lignes: lignes
                  .filter((l) => l.compteId && l.montantHt)
                  .map((l) => ({
                    compteId: Number(l.compteId),
                    libelle: l.libelle || null,
                    montantHt: l.montantHt,
                    taxeId: l.taxeId ? Number(l.taxeId) : null,
                  })),
              },
            );

      for (const cle of CLES_A_RAFRAICHIR) qc.invalidateQueries({ queryKey: [cle] });
      const e = res!.ecriture;
      setSucces(
        e.statut === "VALIDEE"
          ? `Écriture ${e.numeroPiece} validée.`
          : "Brouillon enregistré : il attend sa validation dans l'onglet Écritures.",
      );
      reinitialiser();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  const pret = !!apercu.ecriture && !!tiersId && exerciceOuvert;

  if (!exerciceOuvert) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        L&apos;exercice est {exercice.statut === "CLOS" ? "clos" : "verrouillé"} :
        aucune pièce ne peut y être saisie.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Type de pièce"
        className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1"
      >
        {TYPES.map((t) => (
          <button
            key={t.cle}
            role="tab"
            aria-selected={type === t.cle}
            onClick={() => {
              setType(t.cle);
              setSucces(null);
              setErreur(null);
            }}
            className={
              type === t.cle
                ? "rounded bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
                : "rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {t.libelle}
          </button>
        ))}
      </div>

      {tiersImputables.length === 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Aucun tiers rattaché à un compte collectif : créez un client (411) ou
          un fournisseur (401) avant de saisir une pièce.
        </p>
      )}

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="piece-date">Date</Label>
            <Input
              id="piece-date"
              type="date"
              value={date}
              min={exercice.dateDebut}
              max={exercice.dateFin}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="piece-ref">Référence</Label>
            <Input
              id="piece-ref"
              value={reference}
              placeholder={type === "REGLEMENT" ? "N° de virement, de chèque" : "N° de facture"}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="piece-tiers">
              {type === "VENTE" ? "Client" : type === "ACHAT" ? "Fournisseur" : "Tiers"}
            </Label>
            <Select id="piece-tiers" value={tiersId} onChange={(e) => setTiersId(e.target.value)}>
              <option value="">— choisir —</option>
              {tiersImputables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.raisonSociale}
                  {t.compteId ? ` (${compteParId.get(t.compteId)?.numero ?? ""})` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {type !== "REGLEMENT" && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="piece-echeance">Échéance</Label>
                <Input
                  id="piece-echeance"
                  type="date"
                  value={dateEcheance}
                  min={date}
                  onChange={(e) => setDateEcheance(e.target.value)}
                />
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left font-medium">Compte</th>
                  <th className="p-2 text-left font-medium">Libellé</th>
                  <th className="p-2 text-right font-medium">Montant HT</th>
                  <th className="p-2 text-left font-medium">TVA</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">
                      <Select
                        aria-label={`Compte ligne ${i + 1}`}
                        value={l.compteId}
                        onChange={(e) =>
                          setLignes((ls) => ls.map((x, j) => (j === i ? { ...x, compteId: e.target.value } : x)))
                        }
                      >
                        <option value="">— choisir —</option>
                        <optgroup label={type === "VENTE" ? "Produits" : "Charges"}>
                          {comptesLignes.prioritaires.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.numero} — {c.libelle}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Autres comptes">
                          {comptesLignes.autres.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.numero} — {c.libelle}
                            </option>
                          ))}
                        </optgroup>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        aria-label={`Libellé ligne ${i + 1}`}
                        value={l.libelle}
                        onChange={(e) =>
                          setLignes((ls) => ls.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        aria-label={`Montant HT ligne ${i + 1}`}
                        inputMode="decimal"
                        className="text-right"
                        value={l.montantHt}
                        onChange={(e) =>
                          setLignes((ls) => ls.map((x, j) => (j === i ? { ...x, montantHt: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Select
                        aria-label={`TVA ligne ${i + 1}`}
                        value={l.taxeId}
                        onChange={(e) =>
                          setLignes((ls) => ls.map((x, j) => (j === i ? { ...x, taxeId: e.target.value } : x)))
                        }
                      >
                        <option value="">Sans TVA</option>
                        {taxesProposees.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.libelle}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Supprimer la ligne ${i + 1}`}
                        disabled={lignes.length === 1}
                        onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button variant="outline" size="sm" onClick={() => setLignes((ls) => [...ls, LIGNE_VIDE])}>
              <Plus className="h-3.5 w-3.5" />
              Ajouter une ligne
            </Button>
          </>
        )}

        {type === "REGLEMENT" && (
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="piece-journal">Journal de trésorerie</Label>
              <Select id="piece-journal" value={journalId} onChange={(e) => setJournalId(e.target.value)}>
                <option value="">— choisir —</option>
                {journauxTresorerie.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} — {j.libelle}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="piece-sens">Sens</Label>
              <Select
                id="piece-sens"
                value={sens}
                onChange={(e) => setSens(e.target.value as typeof sens)}
              >
                <option value="ENCAISSEMENT">Encaissement (le tiers paie)</option>
                <option value="DECAISSEMENT">Décaissement (on paie le tiers)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="piece-montant">Montant</Label>
              <Input
                id="piece-montant"
                inputMode="decimal"
                className="text-right"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
              />
            </div>
          </div>
        )}
      </Card>

      {apercu.probleme && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {apercu.probleme}
        </p>
      )}

      {apercu.ecriture && (
        <Card className="overflow-x-auto">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border p-3">
            <h3 className="font-semibold">Écriture qui sera enregistrée</h3>
            <p className="text-sm text-muted-foreground">
              {type !== "REGLEMENT" && (
                <>
                  HT {formatMontantAffichage(apercu.ecriture.totalHt)} · TVA{" "}
                  {formatMontantAffichage(apercu.ecriture.totalTva)} ·{" "}
                </>
              )}
              <span className="font-semibold text-foreground">
                {type === "REGLEMENT" ? "Montant" : "TTC"}{" "}
                {formatMontantAffichage(apercu.ecriture.totalTtc)}
              </span>
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Compte</th>
                <th className="p-2 text-left font-medium">Libellé</th>
                <th className="p-2 text-right font-medium">Débit</th>
                <th className="p-2 text-right font-medium">Crédit</th>
              </tr>
            </thead>
            <tbody>
              {apercu.ecriture.lignes.map((l, i) => {
                const c = compteParId.get(l.compteId);
                return (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2 font-mono text-xs">
                      {c ? `${c.numero} ${c.libelle}` : `#${l.compteId}`}
                    </td>
                    <td className="p-2 text-muted-foreground">{l.libelle}</td>
                    <td className="p-2 text-right tabular-nums">
                      {l.debit ? formatMontantAffichage(parseMontant(l.debit)) : ""}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {l.credit ? formatMontantAffichage(parseMontant(l.credit)) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {erreur && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erreur}
        </p>
      )}
      {succes && (
        <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
          {succes}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {can("comptabilite", "create") && (
          <Button variant="outline" disabled={!pret || enCours} onClick={() => enregistrer(false)}>
            {enCours ? <Spinner /> : <Save className="h-4 w-4" />}
            Enregistrer le brouillon
          </Button>
        )}
        {can("comptabilite", "update") && (
          <Button disabled={!pret || enCours} onClick={() => enregistrer(true)}>
            {enCours ? <Spinner /> : <Check className="h-4 w-4" />}
            Enregistrer et valider
          </Button>
        )}
      </div>
    </div>
  );
}
