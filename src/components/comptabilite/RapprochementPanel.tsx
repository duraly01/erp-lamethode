"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Lock, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { apiSend, messageErreur } from "@/lib/api-client";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { formatDateFR } from "@/lib/constants";
import {
  useRapprochements,
  useRapprochement,
  type Compte,
  type Exercice,
  type LigneBancaire,
  type Rapprochement,
} from "./data";

/**
 * Rapprochement bancaire.
 *
 * Le comptable a le relevé sous les yeux ; il coche dans les livres ce qu'il
 * y retrouve. À chaque coche l'écart se recalcule. Quand il tombe à zéro, le
 * rapprochement se clôture ; tant qu'il subsiste, l'écran dit combien, et
 * propose les lignes qui l'expliqueraient.
 */

function montant(centimes: number) {
  return centimes === 0 ? "" : formatMontantAffichage(centimes);
}

/** Le solde du relevé se lit en francs, avec son signe. */
function francs(numeric: string) {
  return formatMontantAffichage(Math.round(Number(numeric) * 100));
}

function Ecart({ centimes }: { centimes: number }) {
  if (centimes === 0) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-success">
        <CheckCircle2 className="h-4 w-4" /> Rapprochement juste
      </span>
    );
  }
  return (
    <span className="font-semibold text-danger">
      Écart {formatMontantAffichage(centimes)}
    </span>
  );
}

// ---------------------------------------------------------------------------

function NouveauRapprochement({
  exercice,
  compteId,
  onCree,
}: {
  exercice: Exercice;
  compteId: number;
  onCree: (r: Rapprochement) => void;
}) {
  const [date, setDate] = useState(exercice.dateFin);
  const [soldeReleve, setSoldeReleve] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await apiSend<Rapprochement>("/api/comptabilite/rapprochements", "POST", {
        exerciceId: exercice.id,
        compteId,
        dateRapprochement: date,
        soldeReleve: soldeReleve || "0",
      });
      onCree(r!);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-semibold">Nouveau rapprochement</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="rap-date">Date du relevé</Label>
          <Input
            id="rap-date"
            type="date"
            value={date}
            min={exercice.dateDebut}
            max={exercice.dateFin}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rap-solde">Solde du relevé</Label>
          <Input
            id="rap-solde"
            inputMode="decimal"
            className="text-right"
            placeholder="0"
            value={soldeReleve}
            onChange={(e) => setSoldeReleve(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button disabled={enCours} onClick={creer}>
            {enCours ? <Spinner /> : <Plus className="h-4 w-4" />}
            Ouvrir
          </Button>
        </div>
      </div>
      {erreur && <p className="text-sm text-danger">{erreur}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function TableauLignes({
  titre,
  lignes,
  pointees,
  modifiable,
  onBascule,
  enCours,
}: {
  titre: string;
  lignes: LigneBancaire[];
  pointees: boolean;
  modifiable: boolean;
  onBascule: (ligne: LigneBancaire) => void;
  enCours: boolean;
}) {
  return (
    <Card className="overflow-x-auto">
      <h3 className="border-b border-border p-3 font-semibold">
        {titre}{" "}
        <span className="text-sm font-normal text-muted-foreground">({lignes.length})</span>
      </h3>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="w-10 p-2" />
            <th className="p-2 text-left font-medium">Date</th>
            <th className="p-2 text-left font-medium">Pièce</th>
            <th className="p-2 text-left font-medium">Libellé</th>
            <th className="p-2 text-left font-medium">Tiers</th>
            <th className="p-2 text-right font-medium">Entrées</th>
            <th className="p-2 text-right font-medium">Sorties</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                {pointees ? "Rien n'est encore pointé." : "Tout est pointé."}
              </td>
            </tr>
          )}
          {lignes.map((l) => (
            <tr key={l.ligneId} className="border-t border-border">
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  aria-label={`${pointees ? "Dépointer" : "Pointer"} ${l.numeroPiece ?? l.ligneId}`}
                  checked={pointees}
                  disabled={!modifiable || enCours}
                  onChange={() => onBascule(l)}
                  className="h-4 w-4 accent-primary"
                />
              </td>
              <td className="p-2 whitespace-nowrap">{l.dateEcriture}</td>
              <td className="p-2 font-mono text-xs">{l.numeroPiece ?? "—"}</td>
              <td className="p-2">{l.libelle}</td>
              <td className="p-2 text-muted-foreground">{l.tiersLibelle ?? ""}</td>
              <td className="p-2 text-right tabular-nums">{montant(l.debit)}</td>
              <td className="p-2 text-right tabular-nums">{montant(l.credit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Detail({ id, onSupprime }: { id: number; onSupprime: () => void }) {
  const can = useCan();
  const qc = useQueryClient();
  const { data, isLoading } = useRapprochement(id);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState(false);
  const [soldeSaisi, setSoldeSaisi] = useState<string | null>(null);

  function rafraichir() {
    qc.invalidateQueries({ queryKey: ["cpta-rapprochement", id] });
    qc.invalidateQueries({ queryKey: ["cpta-rapprochements"] });
  }

  async function agir(action: () => Promise<unknown>) {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      rafraichir();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  const pointer = (lignes: LigneBancaire[], valeur: boolean) =>
    agir(() =>
      apiSend(`/api/comptabilite/rapprochements/${id}/pointer`, "POST", {
        ligneIds: lignes.map((l) => l.ligneId),
        pointer: valeur,
      }),
    );

  if (isLoading) {
    return (
      <Card className="p-10 text-center">
        <Spinner />
      </Card>
    );
  }
  if (!data) return null;

  const { rapprochement: r, etat, proposition, compte } = data;
  const modifiable = !r.cloture && can("comptabilite", "update");

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">
              <span className="font-mono text-sm">{compte.numero}</span> {compte.libelle} — relevé au{" "}
              {formatDateFR(r.dateRapprochement)}
            </h3>
            <p className="mt-1 text-sm">
              <Ecart centimes={etat.ecart} />
              {r.cloture && (
                <Badge className="ml-2 border-transparent bg-muted text-muted-foreground">
                  <Lock className="mr-1 h-3 w-3" /> Clôturé
                </Badge>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {modifiable && (
              <Button variant="outline" onClick={() => setASupprimer(true)}>
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            )}
            {modifiable && (
              <Button
                disabled={!etat.juste || enCours}
                onClick={() =>
                  agir(() => apiSend(`/api/comptabilite/rapprochements/${id}/cloturer`, "POST"))
                }
              >
                <Lock className="h-4 w-4" />
                Clôturer
              </Button>
            )}
          </div>
        </div>

        <table className="w-full max-w-xl text-sm">
          <tbody>
            <tr className="border-t border-border">
              <td className="p-2">Solde comptable au {formatDateFR(r.dateRapprochement)}</td>
              <td className="p-2 text-right tabular-nums">{formatMontantAffichage(etat.soldeComptable)}</td>
            </tr>
            <tr className="border-t border-border">
              <td className="p-2 pl-6 text-muted-foreground">− entrées non encore créditées par la banque</td>
              <td className="p-2 text-right tabular-nums text-muted-foreground">
                {formatMontantAffichage(etat.debitsNonPointes)}
              </td>
            </tr>
            <tr className="border-t border-border">
              <td className="p-2 pl-6 text-muted-foreground">+ sorties non encore débitées par la banque</td>
              <td className="p-2 text-right tabular-nums text-muted-foreground">
                {formatMontantAffichage(etat.creditsNonPointes)}
              </td>
            </tr>
            <tr className="border-t border-border font-medium">
              <td className="p-2">Solde que la banque devrait montrer</td>
              <td className="p-2 text-right tabular-nums">{formatMontantAffichage(etat.soldeRapproche)}</td>
            </tr>
            <tr className="border-t border-border font-medium">
              <td className="p-2">
                Solde du relevé
                {modifiable && (
                  <span className="ml-3 inline-flex items-center gap-2 font-normal">
                    <Input
                      aria-label="Solde du relevé"
                      inputMode="decimal"
                      className="h-8 w-40 text-right"
                      value={soldeSaisi ?? francs(r.soldeReleve).replace(/[^\d,.-]/g, "")}
                      onChange={(e) => setSoldeSaisi(e.target.value)}
                    />
                    {soldeSaisi !== null && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={enCours}
                        onClick={() =>
                          agir(async () => {
                            await apiSend(`/api/comptabilite/rapprochements/${id}`, "PATCH", {
                              soldeReleve: soldeSaisi,
                            });
                            setSoldeSaisi(null);
                          })
                        }
                      >
                        Corriger
                      </Button>
                    )}
                  </span>
                )}
              </td>
              <td className="p-2 text-right tabular-nums">{formatMontantAffichage(etat.soldeReleve)}</td>
            </tr>
          </tbody>
        </table>

        {!etat.juste && !r.cloture && (
          <p className="text-sm text-muted-foreground">
            L&apos;écart est ce que les livres ignorent encore — frais, agios,
            un encaissement non saisi — ou une ligne du relevé pas encore
            pointée. Il s&apos;explique par une écriture ou un pointage ; il ne
            se force pas.
          </p>
        )}
      </Card>

      {erreur && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>
      )}

      {proposition && modifiable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <span className="text-warning">
            <Wand2 className="mr-2 inline h-4 w-4" />
            L&apos;écart correspond exactement à{" "}
            {proposition.length === 1 ? "cette ligne" : "ces deux lignes"} :{" "}
            {proposition
              .map((l) => `${l.numeroPiece ?? ""} ${l.libelle ?? ""} (${formatMontantAffichage(l.debit || l.credit)})`)
              .join(" et ")}
            .
          </span>
          <Button size="sm" variant="outline" disabled={enCours} onClick={() => pointer(proposition, true)}>
            Pointer {proposition.length === 1 ? "cette ligne" : "ces lignes"}
          </Button>
        </div>
      )}

      <TableauLignes
        titre="À pointer — dans les livres, pas encore sur le relevé"
        lignes={etat.nonPointees}
        pointees={false}
        modifiable={modifiable}
        enCours={enCours}
        onBascule={(l) => pointer([l], true)}
      />
      <TableauLignes
        titre="Pointées — retrouvées sur le relevé"
        lignes={etat.pointees}
        pointees
        modifiable={modifiable}
        enCours={enCours}
        onBascule={(l) => pointer([l], false)}
      />

      <ConfirmDialog
        open={aSupprimer}
        onClose={() => setASupprimer(false)}
        title="Supprimer ce rapprochement ?"
        description="Les lignes qu'il a pointées redeviendront à pointer. Les écritures elles-mêmes ne sont pas touchées."
        loading={enCours}
        onConfirm={() =>
          agir(async () => {
            await apiSend(`/api/comptabilite/rapprochements/${id}`, "DELETE");
            setASupprimer(false);
            onSupprime();
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RapprochementPanel({ exercice, comptes }: { exercice: Exercice; comptes: Compte[] }) {
  const can = useCan();
  const qc = useQueryClient();

  const rapprochables = useMemo(() => comptes.filter((c) => c.rapprochable && c.actif), [comptes]);
  const [compteChoisi, setCompteChoisi] = useState<number>();
  const compteId = rapprochables.find((c) => c.id === compteChoisi)?.id ?? rapprochables[0]?.id;

  const { data: rapprochements, isLoading } = useRapprochements(exercice.id, compteId);
  const [ouvertChoisi, setOuvertChoisi] = useState<number>();
  const enCours = rapprochements?.find((r) => !r.cloture);
  // Par défaut, celui qui est en cours ; sinon celui que l'on a choisi.
  const actif = rapprochements?.find((r) => r.id === ouvertChoisi) ?? enCours;

  if (rapprochables.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Aucun compte de trésorerie n&apos;est marqué comme rapprochable dans le plan de ce contribuable.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="w-80">
          <Label htmlFor="rap-compte">Compte de banque</Label>
          <Select
            id="rap-compte"
            value={compteId ?? ""}
            onChange={(e) => {
              setCompteChoisi(Number(e.target.value));
              setOuvertChoisi(undefined);
            }}
          >
            {rapprochables.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numero} — {c.libelle}
              </option>
            ))}
          </Select>
        </div>

        {rapprochements && rapprochements.length > 0 && (
          <div className="w-72">
            <Label htmlFor="rap-liste">Rapprochement</Label>
            <Select
              id="rap-liste"
              value={actif?.id ?? ""}
              onChange={(e) => setOuvertChoisi(Number(e.target.value))}
            >
              {rapprochements.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatDateFR(r.dateRapprochement)} · relevé {francs(r.soldeReleve)} ·{" "}
                  {r.cloture ? "clôturé" : "en cours"}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      {isLoading && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}

      {!isLoading && !enCours && can("comptabilite", "update") && compteId && exercice.statut === "OUVERT" && (
        <NouveauRapprochement
          exercice={exercice}
          compteId={compteId}
          onCree={(r) => {
            qc.invalidateQueries({ queryKey: ["cpta-rapprochements"] });
            setOuvertChoisi(r.id);
          }}
        />
      )}

      {actif && (
        <Detail
          id={actif.id}
          onSupprime={() => {
            qc.invalidateQueries({ queryKey: ["cpta-rapprochements"] });
            setOuvertChoisi(undefined);
          }}
        />
      )}
    </div>
  );
}
