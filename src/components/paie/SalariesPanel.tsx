"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { apiSend, messageErreur } from "@/lib/api-client";
import { formatDateFR } from "@/lib/constants";
import {
  AVANTAGES,
  GROUPE_LABELS,
  MODE_PAIEMENT_LABELS,
  REGIME_LABELS,
  francs,
  useSalarie,
  useSalaries,
  type RubriqueFixe,
  type Salarie,
  type SalarieDetail,
} from "./data";

/**
 * Fiches des salariés d'un contribuable.
 *
 * La fiche porte le fixe : salaire de base, régime, primes récurrentes,
 * avantages en nature. Une fiche sortie reste — ses bulletins y renvoient —
 * et cesse de recevoir des bulletins à partir du mois qui suit sa sortie.
 */

type Formulaire = {
  matricule: string;
  nom: string;
  prenoms: string;
  niu: string;
  numeroCnps: string;
  dateNaissance: string;
  dateEmbauche: string;
  dateSortie: string;
  poste: string;
  categorie: string;
  echelon: string;
  salaireBase: string;
  regimeCnps: Salarie["regimeCnps"];
  groupeRisque: Salarie["groupeRisque"];
  modePaiement: Salarie["modePaiement"];
  banque: string;
  avantagesNature: string[];
  actif: boolean;
  notes: string;
  rubriquesFixes: RubriqueFixe[];
};

const VIDE: Formulaire = {
  matricule: "",
  nom: "",
  prenoms: "",
  niu: "",
  numeroCnps: "",
  dateNaissance: "",
  dateEmbauche: "",
  dateSortie: "",
  poste: "",
  categorie: "",
  echelon: "",
  salaireBase: "",
  regimeCnps: "GENERAL",
  groupeRisque: "A",
  modePaiement: "VIREMENT",
  banque: "",
  avantagesNature: [],
  actif: true,
  notes: "",
  rubriquesFixes: [],
};

function depuisFiche(s: SalarieDetail): Formulaire {
  return {
    matricule: s.matricule,
    nom: s.nom,
    prenoms: s.prenoms ?? "",
    niu: s.niu ?? "",
    numeroCnps: s.numeroCnps ?? "",
    dateNaissance: s.dateNaissance ?? "",
    dateEmbauche: s.dateEmbauche,
    dateSortie: s.dateSortie ?? "",
    poste: s.poste ?? "",
    categorie: s.categorie ?? "",
    echelon: s.echelon ?? "",
    salaireBase: String(Math.round(Number(s.salaireBase))),
    regimeCnps: s.regimeCnps,
    groupeRisque: s.groupeRisque,
    modePaiement: s.modePaiement,
    banque: s.banque ?? "",
    avantagesNature: s.avantagesNature,
    actif: s.actif,
    notes: s.notes ?? "",
    rubriquesFixes: s.rubriquesFixes.map((r) => ({ ...r, montant: String(Math.round(Number(r.montant))) })),
  };
}

function Champ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function SalarieForm({
  contribuableId,
  salarie,
  onFerme,
}: {
  contribuableId: number;
  salarie: SalarieDetail | null;
  onFerme: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<Formulaire>(() => (salarie ? depuisFiche(salarie) : VIDE));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const set = <K extends keyof Formulaire>(cle: K, valeur: Formulaire[K]) => setF((x) => ({ ...x, [cle]: valeur }));

  function setRubrique(i: number, patch: Partial<RubriqueFixe>) {
    setF((x) => ({ ...x, rubriquesFixes: x.rubriquesFixes.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const corps = {
      ...f,
      prenoms: f.prenoms || null,
      niu: f.niu || null,
      numeroCnps: f.numeroCnps || null,
      dateNaissance: f.dateNaissance || null,
      dateSortie: f.dateSortie || null,
      poste: f.poste || null,
      categorie: f.categorie || null,
      echelon: f.echelon || null,
      banque: f.banque || null,
      notes: f.notes || null,
      rubriquesFixes: f.rubriquesFixes.filter((r) => r.libelle.trim() !== ""),
    };
    try {
      if (salarie) await apiSend(`/api/paie/salaries/${salarie.id}`, "PUT", corps);
      else await apiSend("/api/paie/salaries", "POST", { contribuableId, ...corps });
      qc.invalidateQueries({ queryKey: ["paie-salaries"] });
      qc.invalidateQueries({ queryKey: ["paie-salarie"] });
      onFerme();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="space-y-5 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <Champ id="s-matricule" label="Matricule *">
          <Input id="s-matricule" value={f.matricule} onChange={(e) => set("matricule", e.target.value)} required />
        </Champ>
        <Champ id="s-nom" label="Nom *">
          <Input id="s-nom" value={f.nom} onChange={(e) => set("nom", e.target.value)} required />
        </Champ>
        <Champ id="s-prenoms" label="Prénoms">
          <Input id="s-prenoms" value={f.prenoms} onChange={(e) => set("prenoms", e.target.value)} />
        </Champ>
        <Champ id="s-niu" label="NIU">
          <Input id="s-niu" value={f.niu} onChange={(e) => set("niu", e.target.value)} />
        </Champ>
        <Champ id="s-cnps" label="N° CNPS">
          <Input id="s-cnps" value={f.numeroCnps} onChange={(e) => set("numeroCnps", e.target.value)} />
        </Champ>
        <Champ id="s-naissance" label="Date de naissance">
          <Input id="s-naissance" type="date" value={f.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)} />
        </Champ>
        <Champ id="s-embauche" label="Date d'embauche *">
          <Input id="s-embauche" type="date" value={f.dateEmbauche} onChange={(e) => set("dateEmbauche", e.target.value)} required />
        </Champ>
        <Champ id="s-sortie" label="Date de sortie">
          <Input id="s-sortie" type="date" value={f.dateSortie} onChange={(e) => set("dateSortie", e.target.value)} />
        </Champ>
        <Champ id="s-poste" label="Poste">
          <Input id="s-poste" value={f.poste} onChange={(e) => set("poste", e.target.value)} />
        </Champ>
        <Champ id="s-categorie" label="Catégorie">
          <Input id="s-categorie" value={f.categorie} onChange={(e) => set("categorie", e.target.value)} />
        </Champ>
        <Champ id="s-echelon" label="Échelon">
          <Input id="s-echelon" value={f.echelon} onChange={(e) => set("echelon", e.target.value)} />
        </Champ>
        <Champ id="s-salaire" label="Salaire de base mensuel (FCFA) *">
          <Input id="s-salaire" inputMode="numeric" value={f.salaireBase} onChange={(e) => set("salaireBase", e.target.value)} required />
        </Champ>
        <Champ id="s-regime" label="Régime CNPS">
          <Select id="s-regime" value={f.regimeCnps} onChange={(e) => set("regimeCnps", e.target.value as Formulaire["regimeCnps"])}>
            {Object.entries(REGIME_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Champ>
        <Champ id="s-groupe" label="Risque professionnel">
          <Select id="s-groupe" value={f.groupeRisque} onChange={(e) => set("groupeRisque", e.target.value as Formulaire["groupeRisque"])}>
            {Object.entries(GROUPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Champ>
        <Champ id="s-mode" label="Mode de paiement">
          <Select id="s-mode" value={f.modePaiement} onChange={(e) => set("modePaiement", e.target.value as Formulaire["modePaiement"])}>
            {Object.entries(MODE_PAIEMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Champ>
        <Champ id="s-banque" label="Banque / compte">
          <Input id="s-banque" value={f.banque} onChange={(e) => set("banque", e.target.value)} />
        </Champ>
      </div>

      <fieldset className="space-y-2">
        <legend className="font-medium">Avantages en nature</legend>
        <p className="text-xs text-muted-foreground">
          Évalués forfaitairement au barème, en pourcentage du brut : ils entrent dans les bases, pas dans le net versé.
        </p>
        <div className="flex flex-wrap gap-3">
          {AVANTAGES.map((a) => (
            <label key={a.code} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={f.avantagesNature.includes(a.code)}
                onChange={(e) =>
                  set("avantagesNature", e.target.checked ? [...f.avantagesNature, a.code] : f.avantagesNature.filter((x) => x !== a.code))
                }
              />
              {a.libelle}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">Primes et indemnités fixes</legend>
        <p className="text-xs text-muted-foreground">Reprises chaque mois. Cochez ce qui entre dans la base CNPS et dans la base imposable.</p>
        {f.rubriquesFixes.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-1 text-left font-medium">Libellé</th>
                <th className="p-1 text-left font-medium">Montant</th>
                <th className="p-1 text-center font-medium">Cotisable</th>
                <th className="p-1 text-center font-medium">Imposable</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {f.rubriquesFixes.map((r, i) => (
                <tr key={i}>
                  <td className="p-1">
                    <Input aria-label="Libellé de la prime" value={r.libelle} onChange={(e) => setRubrique(i, { libelle: e.target.value })} />
                  </td>
                  <td className="p-1">
                    <Input aria-label="Montant de la prime" inputMode="numeric" value={r.montant} onChange={(e) => setRubrique(i, { montant: e.target.value })} />
                  </td>
                  <td className="p-1 text-center">
                    <input type="checkbox" className="h-4 w-4 accent-primary" aria-label="Cotisable" checked={r.cotisable} onChange={(e) => setRubrique(i, { cotisable: e.target.checked })} />
                  </td>
                  <td className="p-1 text-center">
                    <input type="checkbox" className="h-4 w-4 accent-primary" aria-label="Imposable" checked={r.imposable} onChange={(e) => setRubrique(i, { imposable: e.target.checked })} />
                  </td>
                  <td className="p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Retirer la prime"
                      onClick={() => set("rubriquesFixes", f.rubriquesFixes.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set("rubriquesFixes", [...f.rubriquesFixes, { libelle: "", montant: "", cotisable: true, imposable: true }])}
        >
          <Plus className="h-4 w-4" />
          Ajouter une prime
        </Button>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Champ id="s-notes" label="Notes">
          <Input id="s-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Champ>
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.actif} onChange={(e) => set("actif", e.target.checked)} />
          Fiche active
        </label>
      </div>

      {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-danger">{erreur}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onFerme}>
          Annuler
        </Button>
        <Button type="submit" disabled={enCours}>
          {enCours && <Spinner />}
          {salarie ? "Enregistrer" : "Créer la fiche"}
        </Button>
      </div>
    </form>
  );
}

function EditionSalarie({ contribuableId, id, onFerme }: { contribuableId: number; id: number | "nouveau"; onFerme: () => void }) {
  const { data, isLoading } = useSalarie(id === "nouveau" ? null : id);
  return (
    <Dialog
      open
      onClose={onFerme}
      title={id === "nouveau" ? "Nouveau salarié" : data ? `${data.matricule} — ${data.nom} ${data.prenoms ?? ""}` : "Salarié"}
      className="max-w-4xl"
    >
      {isLoading && (
        <div className="p-6 text-center">
          <Spinner />
        </div>
      )}
      {(id === "nouveau" || data) && <SalarieForm contribuableId={contribuableId} salarie={data ?? null} onFerme={onFerme} />}
    </Dialog>
  );
}

export function SalariesPanel({ contribuableId }: { contribuableId: number }) {
  const can = useCan();
  const qc = useQueryClient();
  const { data, isLoading } = useSalaries(contribuableId);
  const [edition, setEdition] = useState<number | "nouveau" | null>(null);
  const [aSupprimer, setASupprimer] = useState<Salarie | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function supprimer() {
    if (!aSupprimer) return;
    setEnCours(true);
    setErreur(null);
    try {
      await apiSend(`/api/paie/salaries/${aSupprimer.id}`, "DELETE");
      qc.invalidateQueries({ queryKey: ["paie-salaries"] });
      setASupprimer(null);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.length} salarié${data.length > 1 ? "s" : ""}, dont ${data.filter((s) => s.actif).length} actif${data.filter((s) => s.actif).length > 1 ? "s" : ""}` : ""}
        </p>
        {can("paie", "create") && (
          <Button onClick={() => setEdition("nouveau")}>
            <UserPlus className="h-4 w-4" />
            Nouveau salarié
          </Button>
        )}
      </div>

      {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Matricule</th>
              <th className="p-3 text-left font-medium">Nom</th>
              <th className="p-3 text-left font-medium">Poste</th>
              <th className="p-3 text-right font-medium">Salaire de base</th>
              <th className="p-3 text-left font-medium">Régime</th>
              <th className="p-3 text-left font-medium">Embauche</th>
              <th className="p-3 text-left font-medium">Statut</th>
              <th />
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
                  Aucun salarié : créez les fiches avant d&apos;ouvrir un mois de paie.
                </td>
              </tr>
            )}
            {data?.map((s) => (
              <tr key={s.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => setEdition(s.id)}>
                <td className="p-3 font-mono text-xs">{s.matricule}</td>
                <td className="p-3 font-medium">
                  {s.nom} {s.prenoms ?? ""}
                </td>
                <td className="p-3 text-muted-foreground">{s.poste ?? "—"}</td>
                <td className="p-3 text-right tabular-nums">{francs(s.salaireBase)}</td>
                <td className="p-3 text-muted-foreground">
                  {REGIME_LABELS[s.regimeCnps]} · {s.groupeRisque}
                </td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">{formatDateFR(s.dateEmbauche)}</td>
                <td className="p-3">
                  {s.dateSortie ? (
                    <Badge className="border-transparent bg-warning/15 text-warning">Sorti le {formatDateFR(s.dateSortie)}</Badge>
                  ) : s.actif ? (
                    <Badge className="border-transparent bg-success/15 text-success">Actif</Badge>
                  ) : (
                    <Badge className="border-transparent bg-muted text-muted-foreground">Inactif</Badge>
                  )}
                </td>
                <td className="p-3 text-right">
                  {can("paie", "delete") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Supprimer la fiche"
                      onClick={(e) => {
                        e.stopPropagation();
                        setASupprimer(s);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {edition !== null && <EditionSalarie contribuableId={contribuableId} id={edition} onFerme={() => setEdition(null)} />}

      <ConfirmDialog
        open={aSupprimer !== null}
        onClose={() => setASupprimer(null)}
        title="Supprimer la fiche"
        description={
          <>
            Supprimer {aSupprimer?.matricule} — {aSupprimer?.nom} ? Une fiche qui a déjà des bulletins ne se supprime pas :
            renseignez plutôt sa date de sortie.
          </>
        }
        onConfirm={supprimer}
        loading={enCours}
      />
    </div>
  );
}
