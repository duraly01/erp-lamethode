"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Lock, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { useContribuableOptions } from "@/hooks/useContribuableOptions";
import { apiSend, messageErreur } from "@/lib/api-client";
import { jourAuCameroun } from "@/lib/dates";
import {
  useComptes,
  useExercices,
  useJournaux,
  useTaxes,
  useTiers,
  type Exercice,
} from "./data";
import { EcrituresPanel } from "./EcrituresPanel";
import {
  BalancePanel,
  GrandLivrePanel,
  PlanComptablePanel,
} from "./RestitutionsPanels";
import { LiassePanel } from "./LiassePanel";
import { SaisieAssisteePanel } from "./SaisieAssisteePanel";
import { RapprochementPanel } from "./RapprochementPanel";
import { ImmobilisationsPanel } from "./ImmobilisationsPanel";
import { AnalytiquePanel } from "./AnalytiquePanel";
import { BudgetPanel } from "./BudgetPanel";
import { PilotagePanel } from "./PilotagePanel";
import { TvaPanel } from "./TvaPanel";
import { DsfPanel } from "./DsfPanel";
import { ClotureDialog } from "./ClotureDialog";

/**
 * Écran de la comptabilité générale (E1).
 *
 * Tout est cadré par deux choix : le contribuable dont on tient les livres, et
 * l'exercice sur lequel on travaille. Ils restent visibles en permanence —
 * saisir dans le mauvais exercice est l'erreur la plus coûteuse à rattraper,
 * puisqu'une écriture validée ne se corrige que par contre-passation.
 */

type Onglet =
  | "ecritures"
  | "pieces"
  | "banque"
  | "immobilisations"
  | "analytique"
  | "budget"
  | "pilotage"
  | "balance"
  | "grand-livre"
  | "liasse"
  | "tva"
  | "dsf"
  | "plan";

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "ecritures", libelle: "Écritures" },
  { cle: "pieces", libelle: "Saisie assistée" },
  { cle: "banque", libelle: "Banque" },
  { cle: "immobilisations", libelle: "Immobilisations" },
  { cle: "analytique", libelle: "Analytique" },
  { cle: "budget", libelle: "Budget" },
  { cle: "pilotage", libelle: "Pilotage" },
  { cle: "balance", libelle: "Balance" },
  { cle: "grand-livre", libelle: "Grand livre" },
  { cle: "liasse", libelle: "Liasse" },
  { cle: "tva", libelle: "TVA" },
  { cle: "dsf", libelle: "DSF" },
  { cle: "plan", libelle: "Plan comptable" },
];

const COULEUR_STATUT: Record<Exercice["statut"], string> = {
  OUVERT: "border-transparent bg-success/15 text-success",
  CLOS: "border-transparent bg-warning/15 text-warning",
  VERROUILLE: "border-transparent bg-muted text-muted-foreground",
};

const LIBELLE_STATUT: Record<Exercice["statut"], string> = {
  OUVERT: "Ouvert",
  CLOS: "Clos",
  VERROUILLE: "Verrouillé",
};

export function ComptabiliteClient() {
  const can = useCan();
  const qc = useQueryClient();

  const { data: contribuables, isLoading: chargeContribuables } =
    useContribuableOptions();

  // Les deux sélections se **dérivent** du choix de l'utilisateur et des listes
  // chargées, plutôt que d'être recalées par un effet : le premier rendu montre
  // déjà la bonne valeur, et changer de contribuable retombe tout seul sur son
  // exercice le plus récent puisque l'ancien identifiant ne s'y trouve pas.
  const [contribuableChoisi, setContribuableChoisi] = useState<number>();
  const [exerciceChoisi, setExerciceChoisi] = useState<number>();
  const [onglet, setOnglet] = useState<Onglet>("ecritures");

  const contribuableId =
    contribuables?.find((c) => c.id === contribuableChoisi)?.id ??
    contribuables?.[0]?.id;

  const { data: exercices, isLoading: chargeExercices } =
    useExercices(contribuableId);
  const { data: comptes } = useComptes(contribuableId);
  const { data: journaux } = useJournaux(contribuableId);
  const { data: tiers } = useTiers(contribuableId);
  const { data: taxes } = useTaxes(contribuableId);

  const [ouvertureOuverte, setOuvertureOuverte] = useState(false);
  const [aVerrouiller, setAVerrouiller] = useState(false);
  const [clotureOuverte, setClotureOuverte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Les exercices arrivent du plus récent au plus ancien : à défaut de choix
  // explicite, on ouvre celui sur lequel on saisit presque toujours.
  const exercice = useMemo(
    () =>
      exercices?.find((e) => e.id === exerciceChoisi) ?? exercices?.[0],
    [exercices, exerciceChoisi],
  );

  async function changerStatut(statut: Exercice["statut"]) {
    if (!exercice) return;
    setEnCours(true);
    setErreur(null);
    try {
      await apiSend(`/api/comptabilite/exercices/${exercice.id}`, "PATCH", {
        statut,
      });
      qc.invalidateQueries({ queryKey: ["cpta-exercices"] });
      setAVerrouiller(false);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  if (chargeContribuables) {
    return (
      <Card className="p-10 text-center">
        <Spinner />
      </Card>
    );
  }

  if (!contribuables?.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Aucun contribuable actif : créez-en un avant d&apos;ouvrir une
        comptabilité.
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="w-72">
          <Label htmlFor="cpta-contribuable">Contribuable</Label>
          <Select
            id="cpta-contribuable"
            value={contribuableId ?? ""}
            onChange={(e) => {
              setContribuableChoisi(Number(e.target.value));
              setExerciceChoisi(undefined);
            }}
          >
            {contribuables.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-64">
          <Label htmlFor="cpta-exercice">Exercice</Label>
          <Select
            id="cpta-exercice"
            value={exercice?.id ?? ""}
            disabled={!exercices?.length}
            onChange={(e) => setExerciceChoisi(Number(e.target.value))}
          >
            {!exercices?.length && <option value="">Aucun exercice</option>}
            {exercices?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.libelle}
              </option>
            ))}
          </Select>
        </div>

        {exercice && (
          <div className="flex items-center gap-2 pb-1.5">
            <Badge className={COULEUR_STATUT[exercice.statut]}>
              {LIBELLE_STATUT[exercice.statut]}
            </Badge>
            <span className="text-sm text-muted-foreground">
              du {exercice.dateDebut} au {exercice.dateFin} · système{" "}
              {exercice.systeme === "SMT" ? "minimal de trésorerie" : "normal"}
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 pb-1">
          {exercice?.statut === "OUVERT" && can("comptabilite", "delete") && (
            <Button variant="outline" onClick={() => setClotureOuverte(true)}>
              <Archive className="h-4 w-4" />
              Clôturer
            </Button>
          )}
          {exercice?.statut === "CLOS" && can("comptabilite", "delete") && (
            <Button
              variant="outline"
              onClick={() => setAVerrouiller(true)}
            >
              <Lock className="h-4 w-4" />
              Verrouiller
            </Button>
          )}
          {can("comptabilite", "create") && (
            <Button onClick={() => setOuvertureOuverte(true)}>
              <CalendarPlus className="h-4 w-4" />
              Ouvrir un exercice
            </Button>
          )}
        </div>
      </Card>

      {erreur && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      {chargeExercices && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}

      {!chargeExercices && !exercice && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ce contribuable n&apos;a pas encore d&apos;exercice comptable. Le
          premier ouvert dépose aussi son plan de comptes SYSCOHADA, ses
          journaux et ses taux de taxe.
        </Card>
      )}

      {exercice && (
        <>
          <div
            role="tablist"
            // Sept onglets ne tiennent pas sur un téléphone : sans défilement,
            // les derniers seraient rognés et inatteignables.
            className="flex gap-1 overflow-x-auto border-b border-border"
            aria-label="Vues comptables"
          >
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                role="tab"
                aria-selected={onglet === o.cle}
                onClick={() => setOnglet(o.cle)}
                className={
                  onglet === o.cle
                    ? "-mb-px shrink-0 whitespace-nowrap border-b-2 border-primary px-4 py-2 text-sm font-medium text-foreground"
                    : "-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {o.libelle}
              </button>
            ))}
          </div>

          {onglet === "ecritures" && (
            <EcrituresPanel
              exercice={exercice}
              comptes={comptes ?? []}
              journaux={journaux ?? []}
              tiers={tiers ?? []}
            />
          )}
          {onglet === "pieces" && (
            <SaisieAssisteePanel
              exercice={exercice}
              comptes={comptes ?? []}
              journaux={journaux ?? []}
              tiers={tiers ?? []}
              taxes={taxes ?? []}
            />
          )}
          {onglet === "banque" && (
            <RapprochementPanel exercice={exercice} comptes={comptes ?? []} />
          )}
          {onglet === "immobilisations" && (
            <ImmobilisationsPanel exercice={exercice} comptes={comptes ?? []} tiers={tiers ?? []} />
          )}
          {onglet === "analytique" && <AnalytiquePanel exercice={exercice} />}
          {onglet === "budget" && <BudgetPanel exercice={exercice} comptes={comptes ?? []} />}
          {onglet === "pilotage" && <PilotagePanel key={exercice.id} exercice={exercice} />}
          {onglet === "balance" && <BalancePanel exercice={exercice} />}
          {onglet === "grand-livre" && (
            <GrandLivrePanel exercice={exercice} comptes={comptes ?? []} />
          )}
          {onglet === "liasse" && <LiassePanel exercice={exercice} />}
          {onglet === "tva" && <TvaPanel exercice={exercice} />}
          {onglet === "dsf" && <DsfPanel exercice={exercice} />}
          {onglet === "plan" && <PlanComptablePanel comptes={comptes ?? []} />}
        </>
      )}

      <Dialog
        open={ouvertureOuverte}
        onClose={() => setOuvertureOuverte(false)}
        title="Ouvrir un exercice"
        description="Un exercice couvre une période close : ses dates ne se modifient plus ensuite."
      >
        {contribuableId !== undefined && (
          <ExerciceForm
            contribuableId={contribuableId}
            onAnnule={() => setOuvertureOuverte(false)}
            onOuvert={(nouveau) => {
              setOuvertureOuverte(false);
              qc.invalidateQueries({ queryKey: ["cpta-exercices"] });
              qc.invalidateQueries({ queryKey: ["cpta-comptes"] });
              qc.invalidateQueries({ queryKey: ["cpta-journaux"] });
              setExerciceChoisi(nouveau.id);
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={aVerrouiller}
        onClose={() => setAVerrouiller(false)}
        title="Verrouiller cet exercice ?"
        confirmLabel="Verrouiller"
        description="Plus aucune écriture ne pourra y être portée, et l'exercice ne pourra plus être rouvert depuis cet écran."
        loading={enCours}
        onConfirm={() => changerStatut("VERROUILLE")}
      />

      {clotureOuverte && exercice && (
        <ClotureDialog
          exercice={exercice}
          onClose={() => setClotureOuverte(false)}
          onClos={(suivantId) => {
            setClotureOuverte(false);
            setExerciceChoisi(suivantId);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ouverture d'exercice
// ---------------------------------------------------------------------------

/** Par défaut l'année civile en cours : c'est l'exercice de la quasi-totalité des dossiers. */
function anneeParDefaut() {
  const annee = Number(jourAuCameroun().slice(0, 4));
  return {
    libelle: `Exercice ${annee}`,
    dateDebut: `${annee}-01-01`,
    dateFin: `${annee}-12-31`,
  };
}

function ExerciceForm({
  contribuableId,
  onAnnule,
  onOuvert,
}: {
  contribuableId: number;
  onAnnule: () => void;
  onOuvert: (exercice: Exercice) => void;
}) {
  const [valeurs, setValeurs] = useState(anneeParDefaut);
  const [systeme, setSysteme] = useState<Exercice["systeme"]>("NORMAL");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const exercice = await apiSend<Exercice>(
        "/api/comptabilite/exercices",
        "POST",
        { contribuableId, systeme, ...valeurs },
      );
      if (exercice) onOuvert(exercice);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-4">
      <div>
        <Label htmlFor="ex-libelle">Libellé</Label>
        <Input
          id="ex-libelle"
          value={valeurs.libelle}
          onChange={(e) =>
            setValeurs((v) => ({ ...v, libelle: e.target.value }))
          }
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ex-debut">Début</Label>
          <Input
            id="ex-debut"
            type="date"
            value={valeurs.dateDebut}
            onChange={(e) =>
              setValeurs((v) => ({ ...v, dateDebut: e.target.value }))
            }
            required
          />
        </div>
        <div>
          <Label htmlFor="ex-fin">Fin</Label>
          <Input
            id="ex-fin"
            type="date"
            value={valeurs.dateFin}
            onChange={(e) =>
              setValeurs((v) => ({ ...v, dateFin: e.target.value }))
            }
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="ex-systeme">Système</Label>
        <Select
          id="ex-systeme"
          value={systeme}
          onChange={(e) => setSysteme(e.target.value as Exercice["systeme"])}
        >
          <option value="NORMAL">Système normal</option>
          <option value="SMT">Système minimal de trésorerie</option>
        </Select>
      </div>

      {erreur && (
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onAnnule}>
          Annuler
        </Button>
        <Button type="submit" disabled={enCours}>
          {enCours ? "Ouverture…" : "Ouvrir"}
        </Button>
      </div>
    </form>
  );
}
