"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Plus, Save, Trash2 } from "lucide-react";
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
import { formatMontantAffichage } from "@/lib/comptable/money";
import { formatDateFR } from "@/lib/constants";
import { jourAuCameroun } from "@/lib/dates";
import {
  useAxesAnalytiques,
  useBudget,
  useBudgets,
  useControleBudget,
  useExercices,
  type BudgetDetail,
  type Compte,
  type Exercice,
  type TotauxControle,
} from "./data";

/**
 * Budget et contrôle budgétaire (E6).
 *
 * Un budget se bâtit ligne par ligne — compte de charge ou de produit,
 * section de l'axe s'il en a un, montant annuel — puis se valide et ne
 * bouge plus ; pour réviser, on en crée un autre. Le contrôle le confronte
 * au réalisé à une date : prévu jusque-là, constaté, écart.
 */

const CLES = ["cpta-budgets", "cpta-budget", "cpta-budget-controle"];

function francs(numeric: string | number | null | undefined) {
  if (numeric === null || numeric === undefined || numeric === "") return "—";
  return formatMontantAffichage(Math.round(Number(numeric) * 100));
}

function pourcent(p: number | null) {
  if (p === null) return "—";
  return `${p > 0 ? "+" : ""}${String(p).replace(".", ",")} %`;
}

// ---------------------------------------------------------------------------
// Édition des lignes
// ---------------------------------------------------------------------------

type LigneSaisie = { cle: number; compteId: string; sectionId: string; montantAnnuel: string; commentaire: string; mensualisation: number[] | null };

function LignesEditeur({ budget, contribuableId, comptes, onEnregistre }: { budget: BudgetDetail; contribuableId: number; comptes: Compte[]; onEnregistre: () => void }) {
  const [lignes, setLignes] = useState<LigneSaisie[]>(() =>
    budget.lignes.map((l, i) => ({ cle: i, compteId: String(l.compteId), sectionId: l.sectionId ? String(l.sectionId) : "", montantAnnuel: String(Number(l.montantAnnuel)), commentaire: l.commentaire ?? "", mensualisation: l.mensualisation })),
  );
  const [prochaineCle, setProchaineCle] = useState(budget.lignes.length);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const gestion = useMemo(() => comptes.filter((c) => c.actif && /^[678]/.test(c.numero)), [comptes]);
  const compteParId = useMemo(() => new Map(comptes.map((c) => [c.id, c])), [comptes]);
  const total = (prefixe: string) => lignes.reduce((t, l) => t + ((compteParId.get(Number(l.compteId))?.numero ?? "").startsWith(prefixe) ? Number(l.montantAnnuel) || 0 : 0), 0);

  async function enregistrer() {
    setEnCours(true);
    setErreur(null);
    try {
      await apiSend(`/api/comptabilite/budgets/${budget.id}/lignes`, "PUT", {
        lignes: lignes
          .filter((l) => l.compteId)
          .map((l) => ({
            compteId: Number(l.compteId),
            sectionId: l.sectionId ? Number(l.sectionId) : null,
            montantAnnuel: l.montantAnnuel || "0",
            commentaire: l.commentaire || null,
            mensualisation: l.mensualisation,
          })),
      });
      onEnregistre();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <BudgetSections budget={budget} contribuableId={contribuableId}>
      {(sections) => (
        <div className="space-y-3">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left font-medium">Compte</th>
                  {budget.axeId && <th className="p-2 text-left font-medium">Section</th>}
                  <th className="p-2 text-right font-medium">Montant annuel</th>
                  <th className="p-2 text-left font-medium">Commentaire</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.cle} className="border-t border-border">
                    <td className="p-2 min-w-64">
                      <Select aria-label="Compte" value={l.compteId} onChange={(e) => setLignes(lignes.map((x) => (x.cle === l.cle ? { ...x, compteId: e.target.value } : x)))}>
                        <option value="">— compte —</option>
                        {gestion.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} — {c.libelle}
                          </option>
                        ))}
                      </Select>
                    </td>
                    {budget.axeId && (
                      <td className="p-2 min-w-40">
                        <Select aria-label="Section" value={l.sectionId} onChange={(e) => setLignes(lignes.map((x) => (x.cle === l.cle ? { ...x, sectionId: e.target.value } : x)))}>
                          <option value="">— toutes —</option>
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.code} — {s.libelle}
                            </option>
                          ))}
                        </Select>
                      </td>
                    )}
                    <td className="p-2 w-44">
                      <Input aria-label="Montant annuel" inputMode="numeric" className="text-right" value={l.montantAnnuel} onChange={(e) => setLignes(lignes.map((x) => (x.cle === l.cle ? { ...x, montantAnnuel: e.target.value } : x)))} />
                    </td>
                    <td className="p-2">
                      <Input aria-label="Commentaire" value={l.commentaire} onChange={(e) => setLignes(lignes.map((x) => (x.cle === l.cle ? { ...x, commentaire: e.target.value } : x)))} maxLength={500} />
                    </td>
                    <td className="p-2">
                      <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => setLignes(lignes.filter((x) => x.cle !== l.cle))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border text-sm font-medium">
                <tr>
                  <td className="p-2" colSpan={budget.axeId ? 2 : 1}>
                    Charges {francs(total("6"))} · Produits {francs(total("7"))} · Résultat {francs(total("7") - total("6"))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </Card>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLignes([...lignes, { cle: prochaineCle, compteId: "", sectionId: "", montantAnnuel: "", commentaire: "", mensualisation: null }]);
                setProchaineCle(prochaineCle + 1);
              }}
            >
              <Plus className="h-4 w-4" />
              Ligne
            </Button>
            {erreur && <p className="text-sm text-danger">{erreur}</p>}
            <Button className="ml-auto" size="sm" disabled={enCours} onClick={enregistrer}>
              {enCours && <Spinner />}
              <Save className="h-4 w-4" />
              Enregistrer les lignes
            </Button>
          </div>
        </div>
      )}
    </BudgetSections>
  );
}

/** Les sections de l'axe du budget, chargées une fois pour l'éditeur. */
function BudgetSections({
  budget,
  contribuableId,
  children,
}: {
  budget: BudgetDetail;
  contribuableId: number;
  children: (sections: { id: number; code: string; libelle: string }[]) => React.ReactNode;
}) {
  const { data: axes, isLoading } = useAxesAnalytiques(budget.axeId ? contribuableId : undefined);
  if (budget.axeId && isLoading) return <Spinner />;
  const sections = axes?.find((a) => a.id === budget.axeId)?.sections.filter((s) => s.actif) ?? [];
  return <>{children(sections)}</>;
}

// ---------------------------------------------------------------------------
// Contrôle
// ---------------------------------------------------------------------------

function LigneTotaux({ libelle, t, negatifBon, avecSection }: { libelle: string; t: TotauxControle; negatifBon: boolean; avecSection: boolean }) {
  const ecart = Number(t.ecart);
  return (
    <tr className="border-t-2 border-border font-medium">
      <td className="p-2" colSpan={avecSection ? 2 : 1}>
        {libelle}
      </td>
      <td className="p-2 text-right tabular-nums">{francs(t.budgetAnnuel)}</td>
      <td className="p-2 text-right tabular-nums">{francs(t.budgetADate)}</td>
      <td className="p-2 text-right tabular-nums">{francs(t.realise)}</td>
      <td className={"p-2 text-right tabular-nums " + (ecart === 0 ? "" : (ecart < 0) === negatifBon ? "text-success" : "text-danger")}>{francs(t.ecart)}</td>
      <td colSpan={2} />
    </tr>
  );
}

function ControleVue({ budgetId, exercice }: { budgetId: number; exercice: Exercice }) {
  const aujourdhui = jourAuCameroun();
  const [jusquAu, setJusquAu] = useState(aujourdhui < exercice.dateFin ? (aujourdhui > exercice.dateDebut ? aujourdhui : exercice.dateDebut) : exercice.dateFin);
  const { data, isLoading } = useControleBudget(budgetId, jusquAu);
  const sectionParId = useMemo(() => new Map((data?.sections ?? []).map((s) => [s.id, s])), [data]);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <Label htmlFor="bc-date">Jusqu&apos;au</Label>
          <Input id="bc-date" type="date" value={jusquAu} min={exercice.dateDebut} max={exercice.dateFin} onChange={(e) => e.target.value && setJusquAu(e.target.value)} />
        </div>
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.moisEcoules} mois sur {data.nbMois} · le mois en cours compte entier · écart = réalisé − budget à date
          </p>
        )}
      </Card>
      {isLoading && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}
      {data && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Compte</th>
                {data.budget.axeId && <th className="p-2 text-left font-medium">Section</th>}
                <th className="p-2 text-right font-medium">Budget annuel</th>
                <th className="p-2 text-right font-medium">Budget à date</th>
                <th className="p-2 text-right font-medium">Réalisé</th>
                <th className="p-2 text-right font-medium">Écart</th>
                <th className="p-2 text-right font-medium">Écart %</th>
                <th className="p-2 text-right font-medium">Consommé</th>
              </tr>
            </thead>
            <tbody>
              {(["CHARGE", "PRODUIT"] as const).map((nature) => [
                <tr key={nature} className="bg-muted/20 text-xs uppercase text-muted-foreground">
                  <td className="p-2" colSpan={8}>
                    {nature === "CHARGE" ? "Charges" : "Produits"}
                  </td>
                </tr>,
                ...data.lignes
                  .filter((l) => l.nature === nature)
                  .map((l) => {
                    const ecart = Number(l.ecart);
                    const bon = nature === "CHARGE" ? ecart <= 0 : ecart >= 0;
                    return (
                      <tr key={`${l.compteNumero}|${l.sectionId ?? ""}`} className="border-t border-border">
                        <td className="p-2">
                          <span className="font-mono text-xs">{l.compteNumero}</span> {l.compteLibelle}
                          {l.horsBudget && <Badge className="ml-2 border-transparent bg-warning/15 text-warning">hors budget</Badge>}
                        </td>
                        {data.budget.axeId && <td className="p-2">{l.sectionId ? <span className="font-mono text-xs">{sectionParId.get(l.sectionId)?.code ?? l.sectionId}</span> : <span className="italic text-muted-foreground">non ventilé</span>}</td>}
                        <td className="p-2 text-right tabular-nums">{francs(l.budgetAnnuel)}</td>
                        <td className="p-2 text-right tabular-nums">{francs(l.budgetADate)}</td>
                        <td className="p-2 text-right tabular-nums">{francs(l.realise)}</td>
                        <td className={"p-2 text-right tabular-nums " + (ecart === 0 ? "text-muted-foreground" : bon ? "text-success" : "text-danger")}>{francs(l.ecart)}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{pourcent(l.ecartPct)}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{l.consommationPct === null ? "—" : `${String(l.consommationPct).replace(".", ",")} %`}</td>
                      </tr>
                    );
                  }),
                <LigneTotaux key={`${nature}-total`} libelle={nature === "CHARGE" ? "Total charges" : "Total produits"} t={nature === "CHARGE" ? data.charges : data.produits} negatifBon={nature === "CHARGE"} avecSection={!!data.budget.axeId} />,
              ])}
              <LigneTotaux libelle="Résultat" t={data.resultat} negatifBon={false} avecSection={!!data.budget.axeId} />
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau
// ---------------------------------------------------------------------------

export function BudgetPanel({ exercice, comptes }: { exercice: Exercice; comptes: Compte[] }) {
  const can = useCan();
  const qc = useQueryClient();
  const { data: budgets, isLoading } = useBudgets(exercice.id);
  const { data: axes } = useAxesAnalytiques(exercice.contribuableId);
  const { data: exercices } = useExercices(exercice.contribuableId);
  const [choisi, setChoisi] = useState<number>();
  const [vue, setVue] = useState<"lignes" | "controle">("controle");
  const [creation, setCreation] = useState(false);
  const [initialisation, setInitialisation] = useState(false);
  const [aValider, setAValider] = useState(false);
  const [aSupprimer, setASupprimer] = useState(false);
  const [nouveau, setNouveau] = useState({ libelle: `Budget ${exercice.libelle.replace(/^Exercice\s*/i, "")}`, axeId: "" });
  const [init, setInit] = useState({ exerciceSourceId: "", coefficientPct: "100" });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const budgetId = budgets?.find((b) => b.id === choisi)?.id ?? budgets?.[0]?.id;
  const { data: budget } = useBudget(budgetId);
  const rafraichir = () => CLES.forEach((c) => qc.invalidateQueries({ queryKey: [c] }));

  async function agir(action: () => Promise<unknown>, apres?: () => void) {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      rafraichir();
      apres?.();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  const brouillon = budget?.statut === "BROUILLON";
  const modifiable = brouillon && can("comptabilite", "update");

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-72">
          <Label htmlFor="bg-budget">Budget</Label>
          <Select id="bg-budget" value={budgetId ?? ""} disabled={!budgets?.length} onChange={(e) => setChoisi(Number(e.target.value))}>
            {!budgets?.length && <option value="">Aucun budget</option>}
            {budgets?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.libelle}
                {b.axeCode ? ` · ${b.axeCode}` : ""} · {b.statut === "VALIDE" ? "validé" : "brouillon"}
              </option>
            ))}
          </Select>
        </div>
        {budget && (
          <div className="flex gap-1 pb-1" role="tablist" aria-label="Vue budget">
            {(
              [
                ["controle", "Contrôle"],
                ["lignes", "Lignes"],
              ] as const
            ).map(([cle, libelle]) => (
              <button
                key={cle}
                role="tab"
                aria-selected={vue === cle}
                onClick={() => setVue(cle)}
                className={vue === cle ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"}
              >
                {libelle}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2 pb-1">
          {modifiable && (
            <Button variant="outline" size="sm" disabled={enCours} onClick={() => setInitialisation(true)}>
              <Copy className="h-4 w-4" />
              Depuis un réalisé
            </Button>
          )}
          {modifiable && can("comptabilite", "delete") && (
            <Button variant="outline" size="sm" disabled={enCours} onClick={() => setASupprimer(true)}>
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          )}
          {modifiable && (
            <Button size="sm" disabled={enCours || budget!.lignes.length === 0} onClick={() => setAValider(true)}>
              <CheckCircle2 className="h-4 w-4" />
              Valider le budget
            </Button>
          )}
          {can("comptabilite", "create") && (
            <Button variant={budgets?.length ? "outline" : "primary"} size="sm" onClick={() => setCreation(true)}>
              <Plus className="h-4 w-4" />
              Nouveau budget
            </Button>
          )}
        </div>
      </Card>

      {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}
      {isLoading && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}
      {!isLoading && !budgets?.length && (
        <Card className="p-8 text-center text-sm text-muted-foreground">Aucun budget sur cet exercice. Créez-en un, par compte seul ou détaillé par section d&apos;un axe analytique, puis remplissez-le à la main ou depuis le réalisé d&apos;un exercice.</Card>
      )}
      {budget && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className={"border-transparent " + (brouillon ? "bg-muted text-muted-foreground" : "bg-success/15 text-success")}>{brouillon ? "Brouillon" : "Validé"}</Badge>
          <span className="text-muted-foreground">
            {budget.lignes.length} ligne{budget.lignes.length > 1 ? "s" : ""} · charges {francs(budget.totaux.charges)} · produits {francs(budget.totaux.produits)} · résultat prévu {francs(budget.totaux.resultat)}
            {budget.axeId ? " · détaillé par section" : ""}
          </span>
        </div>
      )}
      {budget && vue === "lignes" && modifiable && <LignesEditeur key={String(budget.updatedAt)} budget={budget} contribuableId={exercice.contribuableId} comptes={comptes} onEnregistre={rafraichir} />}
      {budget && vue === "lignes" && !modifiable && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Compte</th>
                {budget.axeId && <th className="p-2 text-left font-medium">Section</th>}
                <th className="p-2 text-right font-medium">Montant annuel</th>
                <th className="p-2 text-left font-medium">Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {budget.lignes.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-2">
                    <span className="font-mono text-xs">{l.compteNumero}</span> {l.compteLibelle}
                  </td>
                  {budget.axeId && <td className="p-2 font-mono text-xs">{l.sectionCode ?? "—"}</td>}
                  <td className="p-2 text-right tabular-nums">{francs(l.montantAnnuel)}</td>
                  <td className="p-2 text-muted-foreground">{l.commentaire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {budget && vue === "controle" && <ControleVue budgetId={budget.id} exercice={exercice} />}

      <Dialog open={creation} onClose={() => setCreation(false)} title="Nouveau budget" description="Par compte seul, ou détaillé par section d'un axe analytique : le contrôle comparera alors le réalisé ventilé sur cet axe.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            agir(
              async () => {
                const b = await apiSend<BudgetDetail>("/api/comptabilite/budgets", "POST", { exerciceId: exercice.id, libelle: nouveau.libelle, axeId: nouveau.axeId ? Number(nouveau.axeId) : null });
                setChoisi(b!.id);
                setVue("lignes");
              },
              () => setCreation(false),
            );
          }}
        >
          <div>
            <Label htmlFor="bg-libelle">Libellé</Label>
            <Input id="bg-libelle" value={nouveau.libelle} onChange={(e) => setNouveau({ ...nouveau, libelle: e.target.value })} required maxLength={120} />
          </div>
          <div>
            <Label htmlFor="bg-axe">Axe analytique</Label>
            <Select id="bg-axe" value={nouveau.axeId} onChange={(e) => setNouveau({ ...nouveau, axeId: e.target.value })}>
              <option value="">Aucun — par compte seul</option>
              {axes?.filter((a) => a.actif).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.libelle}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreation(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={enCours}>
              {enCours && <Spinner />}
              Créer
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={initialisation} onClose={() => setInitialisation(false)} title="Remplir depuis un réalisé" description="Les lignes actuelles sont remplacées par le réalisé de l'exercice choisi, multiplié par le coefficient : 100 reprend tel quel, 105 ajoute 5 %.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            agir(() => apiSend(`/api/comptabilite/budgets/${budget!.id}/initialiser`, "POST", { exerciceSourceId: Number(init.exerciceSourceId), coefficientPct: Number(init.coefficientPct) }), () => {
              setInitialisation(false);
              setVue("lignes");
            });
          }}
        >
          <div>
            <Label htmlFor="bi-source">Exercice source</Label>
            <Select id="bi-source" value={init.exerciceSourceId} onChange={(e) => setInit({ ...init, exerciceSourceId: e.target.value })} required>
              <option value="">— choisir —</option>
              {exercices?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.libelle}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bi-coef">Coefficient (%)</Label>
            <Input id="bi-coef" type="number" min={0} max={1000} step={0.5} value={init.coefficientPct} onChange={(e) => setInit({ ...init, coefficientPct: e.target.value })} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setInitialisation(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={enCours || !init.exerciceSourceId}>
              {enCours && <Spinner />}
              Remplir
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={aValider}
        onClose={() => setAValider(false)}
        title="Valider ce budget ?"
        description="Il ne se modifiera plus. Pour le réviser plus tard, vous en créerez un autre."
        confirmLabel="Valider"
        loading={enCours}
        onConfirm={() => agir(() => apiSend(`/api/comptabilite/budgets/${budget!.id}/valider`, "POST"), () => setAValider(false))}
      />
      <ConfirmDialog
        open={aSupprimer}
        onClose={() => setASupprimer(false)}
        title="Supprimer ce budget ?"
        description="Le brouillon et ses lignes sont jetés."
        loading={enCours}
        onConfirm={() =>
          agir(() => apiSend(`/api/comptabilite/budgets/${budget!.id}`, "DELETE"), () => {
            setASupprimer(false);
            setChoisi(undefined);
          })
        }
      />
    </div>
  );
}
