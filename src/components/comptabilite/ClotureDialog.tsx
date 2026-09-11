"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { apiGet, apiSend, messageErreur } from "@/lib/api-client";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { CLES_A_RAFRAICHIR, type Exercice } from "./data";

/**
 * Clôture d'un exercice.
 *
 * Le dialogue montre d'abord ce qui doit être vrai pour clôturer, et ce qui
 * ne l'est pas encore. Le bouton n'apparaît qu'une fois tout en ordre : on ne
 * clôture pas un exercice avec des brouillons en suspens ou une banque en
 * cours de rapprochement, et il vaut mieux le voir avant de cliquer qu'après.
 */

type Controles = {
  exercice: { id: number; libelle: string; statut: string };
  suivant: { id: number; libelle: string; statut: string; aNouveauxDeja: boolean } | null;
  brouillons: number;
  rapprochementsOuverts: number;
  balanceEquilibree: boolean;
  obstacles: string[];
};

type Resultat = {
  suivant: { id: number; libelle: string };
  aNouveaux: {
    numeroPiece: string | null;
    lignes: number;
    lignesDetaillees: number;
    resultatNet: number;
  };
};

function Controle({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      )}
      <span className={ok ? "" : "text-danger"}>{children}</span>
    </li>
  );
}

export function ClotureDialog({
  exercice,
  onClose,
  onClos,
}: {
  exercice: Exercice;
  onClose: () => void;
  onClos: (suivantId: number) => void;
}) {
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery({
    queryKey: ["cpta-cloture-controles", exercice.id],
    queryFn: () => apiGet<Controles>(`/api/comptabilite/exercices/${exercice.id}/cloture`),
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  async function cloturer() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await apiSend<Resultat>(`/api/comptabilite/exercices/${exercice.id}/cloture`, "POST");
      qc.invalidateQueries({ queryKey: ["cpta-exercices"] });
      for (const cle of CLES_A_RAFRAICHIR) qc.invalidateQueries({ queryKey: [cle] });
      setResultat(r!);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Clôturer ${exercice.libelle}`}
      description="Les soldes de bilan sont repris en à-nouveaux dans l'exercice suivant, puis l'exercice est fermé à la saisie."
    >
      {isLoading && (
        <div className="p-6 text-center">
          <Spinner />
        </div>
      )}

      {c && !resultat && (
        <div className="space-y-4 text-sm">
          <ul className="space-y-2">
            <Controle ok={c.exercice.statut === "OUVERT"}>L&apos;exercice est ouvert.</Controle>
            <Controle ok={!!c.suivant && c.suivant.statut === "OUVERT"}>
              {c.suivant
                ? `L'exercice suivant, ${c.suivant.libelle}, est ouvert et recevra les à-nouveaux.`
                : "Aucun exercice suivant : ouvrez-le d'abord, il recevra les à-nouveaux."}
            </Controle>
            <Controle ok={!c.suivant?.aNouveauxDeja}>
              {c.suivant?.aNouveauxDeja
                ? "L'exercice suivant porte déjà des à-nouveaux."
                : "L'exercice suivant ne porte pas encore d'à-nouveaux."}
            </Controle>
            <Controle ok={c.brouillons === 0}>
              {c.brouillons === 0
                ? "Aucun brouillon en attente."
                : `${c.brouillons} brouillon${c.brouillons > 1 ? "s" : ""} en attente — à valider ou supprimer depuis l'onglet Écritures.`}
            </Controle>
            <Controle ok={c.rapprochementsOuverts === 0}>
              {c.rapprochementsOuverts === 0
                ? "Aucun rapprochement bancaire en cours."
                : "Un rapprochement bancaire est en cours — à clôturer ou supprimer depuis l'onglet Banque."}
            </Controle>
            <Controle ok={c.balanceEquilibree}>
              {c.balanceEquilibree ? "La balance est équilibrée." : "La balance n'est pas équilibrée."}
            </Controle>
          </ul>

          <p className="rounded-md border border-border bg-muted/40 p-3 text-muted-foreground">
            La reprise est détaillée : chaque facture non lettrée et chaque
            ligne de banque non pointée passent dans l&apos;exercice suivant une
            par une, pour s&apos;y lettrer et s&apos;y pointer. Le résultat de
            l&apos;exercice y entre au bilan. Une fois clôturé, l&apos;exercice
            ne se rouvre plus.
          </p>

          {erreur && (
            <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-danger">{erreur}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button disabled={c.obstacles.length > 0 || enCours} onClick={cloturer}>
              {enCours ? <Spinner /> : <Archive className="h-4 w-4" />}
              Clôturer et reprendre les à-nouveaux
            </Button>
          </div>
        </div>
      )}

      {resultat && (
        <div className="space-y-4 text-sm">
          <p className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {exercice.libelle} est clos.{" "}
              {resultat.aNouveaux.numeroPiece
                ? `Les à-nouveaux ${resultat.aNouveaux.numeroPiece} ont été passés dans ${resultat.suivant.libelle} : ${resultat.aNouveaux.lignes} ligne${resultat.aNouveaux.lignes > 1 ? "s" : ""}, dont ${resultat.aNouveaux.lignesDetaillees} reprise${resultat.aNouveaux.lignesDetaillees > 1 ? "s" : ""} en détail, et un résultat de ${formatMontantAffichage(resultat.aNouveaux.resultatNet)}.`
                : "L'exercice ne portait aucun solde à reprendre."}
            </span>
          </p>
          <div className="flex justify-end">
            <Button onClick={() => onClos(resultat.suivant.id)}>Ouvrir {resultat.suivant.libelle}</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
