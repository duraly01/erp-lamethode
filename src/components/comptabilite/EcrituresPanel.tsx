"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Check, Pencil, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { apiGet, apiSend, messageErreur } from "@/lib/api-client";
import {
  CLES_A_RAFRAICHIR,
  useEcritures,
  type Compte,
  type Ecriture,
  type EcritureComplete,
  type Exercice,
  type Journal,
  type Tiers,
} from "./data";
import { EcritureForm } from "./EcritureForm";

const COULEUR_STATUT: Record<Ecriture["statut"], string> = {
  BROUILLON: "border-transparent bg-muted text-muted-foreground",
  VALIDEE: "border-transparent bg-success/15 text-success",
  CONTREPASSEE: "border-transparent bg-warning/15 text-warning",
};

const LIBELLE_STATUT: Record<Ecriture["statut"], string> = {
  BROUILLON: "Brouillon",
  VALIDEE: "Validée",
  CONTREPASSEE: "Contre-passée",
};

export function EcrituresPanel({
  exercice,
  comptes,
  journaux,
  tiers,
}: {
  exercice: Exercice;
  comptes: Compte[];
  journaux: Journal[];
  tiers: Tiers[];
}) {
  const can = useCan();
  const qc = useQueryClient();

  const [journalId, setJournalId] = useState<string>("");
  const [formOuvert, setFormOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<EcritureComplete | null>(null);
  const [aSupprimer, setASupprimer] = useState<Ecriture | null>(null);
  const [aContrepasser, setAContrepasser] = useState<Ecriture | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data: ecritures, isLoading } = useEcritures(
    exercice.id,
    journalId ? Number(journalId) : undefined,
  );

  const journalParId = new Map(journaux.map((j) => [j.id, j]));
  const exerciceOuvert = exercice.statut === "OUVERT";

  function rafraichir() {
    for (const cle of CLES_A_RAFRAICHIR) {
      qc.invalidateQueries({ queryKey: [cle] });
    }
  }

  async function agir(action: () => Promise<unknown>) {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      rafraichir();
      setASupprimer(null);
      setAContrepasser(null);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  async function ouvrirEdition(ecriture: Ecriture) {
    const complete = await apiGet<EcritureComplete>(
      `/api/comptabilite/ecritures/${ecriture.id}`,
    );
    setEnEdition(complete);
    setFormOuvert(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-56">
          <Select
            aria-label="Filtrer par journal"
            value={journalId}
            onChange={(e) => setJournalId(e.target.value)}
          >
            <option value="">Tous les journaux</option>
            {journaux.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} — {j.libelle}
              </option>
            ))}
          </Select>
        </div>

        {can("comptabilite", "create") && exerciceOuvert && (
          <Button
            onClick={() => {
              setEnEdition(null);
              setFormOuvert(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvelle écriture
          </Button>
        )}
      </div>

      {!exerciceOuvert && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Cet exercice est {exercice.statut === "CLOS" ? "clos" : "verrouillé"} :
          la saisie y est fermée. Les écritures restent consultables.
        </p>
      )}

      {erreur && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Date</th>
              <th className="p-3 text-left font-medium">Pièce</th>
              <th className="p-3 text-left font-medium">Journal</th>
              <th className="p-3 text-left font-medium">Libellé</th>
              <th className="p-3 text-left font-medium">Statut</th>
              <th className="p-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  <Spinner />
                </td>
              </tr>
            )}
            {!isLoading && (ecritures?.length ?? 0) === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  Aucune écriture sur cet exercice.
                </td>
              </tr>
            )}
            {ecritures?.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{e.dateEcriture}</td>
                <td className="p-3 font-mono text-xs">
                  {e.numeroPiece ?? "—"}
                </td>
                <td className="p-3">{journalParId.get(e.journalId)?.code}</td>
                <td className="p-3">{e.libelle}</td>
                <td className="p-3">
                  <Badge className={COULEUR_STATUT[e.statut]}>
                    {LIBELLE_STATUT[e.statut]}
                  </Badge>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    {e.statut === "BROUILLON" && exerciceOuvert && (
                      <>
                        {can("comptabilite", "update") && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => ouvrirEdition(e)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Modifier
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={enCours}
                              onClick={() =>
                                agir(() =>
                                  apiSend(
                                    `/api/comptabilite/ecritures/${e.id}/valider`,
                                    "POST",
                                  ),
                                )
                              }
                            >
                              <Check className="h-3.5 w-3.5" />
                              Valider
                            </Button>
                          </>
                        )}
                        {can("comptabilite", "delete") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setASupprimer(e)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                    {e.statut === "VALIDEE" &&
                      exerciceOuvert &&
                      can("comptabilite", "delete") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAContrepasser(e)}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Contre-passer
                        </Button>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog
        open={formOuvert}
        onClose={() => setFormOuvert(false)}
        title={enEdition ? "Modifier le brouillon" : "Nouvelle écriture"}
        description={`${exercice.libelle} — du ${exercice.dateDebut} au ${exercice.dateFin}`}
        className="max-w-5xl"
      >
        {formOuvert && (
          <EcritureForm
            exerciceId={exercice.id}
            comptes={comptes}
            journaux={journaux}
            tiers={tiers}
            bornes={{
              dateDebut: exercice.dateDebut,
              dateFin: exercice.dateFin,
            }}
            ecriture={enEdition ?? undefined}
            onAnnule={() => setFormOuvert(false)}
            onEnregistre={() => {
              setFormOuvert(false);
              rafraichir();
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={!!aSupprimer}
        onClose={() => setASupprimer(null)}
        title="Supprimer ce brouillon ?"
        description="Un brouillon n'a pas encore de numéro de pièce : sa suppression ne laisse aucun trou dans la numérotation."
        loading={enCours}
        onConfirm={() =>
          agir(() =>
            apiSend(`/api/comptabilite/ecritures/${aSupprimer!.id}`, "DELETE"),
          )
        }
      />

      <ConfirmDialog
        open={!!aContrepasser}
        onClose={() => setAContrepasser(null)}
        title="Contre-passer cette écriture ?"
        confirmLabel="Contre-passer"
        description={
          <>
            Une écriture validée ne se modifie pas : on enregistre son inverse.
            Les deux resteront visibles au grand livre, avec le lien entre
            elles. La contre-passation sera datée d&apos;aujourd&apos;hui.
          </>
        }
        loading={enCours}
        onConfirm={() =>
          agir(() =>
            apiSend(
              `/api/comptabilite/ecritures/${aContrepasser!.id}/contrepasser`,
              "POST",
              {},
            ),
          )
        }
      />
    </div>
  );
}
