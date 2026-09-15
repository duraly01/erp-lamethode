"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, LogOut, Pencil, Plus, Table2, Trash2 } from "lucide-react";
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
  useImmobilisation,
  useImmobilisations,
  usePrevisionDotations,
  useTableauImmobilisations,
  type Compte,
  type Exercice,
  type ImmobilisationDetail,
  type ImmobilisationResume,
  type ModeAmortissement,
  type StatutImmobilisation,
  type Tiers,
} from "./data";

/**
 * Registre des immobilisations (E5).
 *
 * Le bien entre dans les livres par sa facture d'achat ; la fiche dit
 * comment il s'amortit. Le plan se lit sur la fiche, exercice par exercice,
 * avec ce qui en a été passé. Les dotations de l'exercice se passent d'un
 * geste, pour tous les biens qui les attendent ; la sortie d'un bien —
 * cession ou mise au rebut — solde ses comptes.
 */

const STATUT: Record<StatutImmobilisation, { libelle: string; classe: string }> = {
  EN_SERVICE: { libelle: "En service", classe: "bg-success/15 text-success" },
  CEDEE: { libelle: "Cédé", classe: "bg-warning/15 text-warning" },
  REBUT: { libelle: "Rebut", classe: "bg-muted text-muted-foreground" },
};

const MODE: Record<ModeAmortissement, string> = {
  LINEAIRE: "Linéaire",
  DEGRESSIF: "Dégressif",
};

const CLES = ["cpta-immobilisations", "cpta-immobilisation", "cpta-dotations", "cpta-tableau-immobilisations", "cpta-ecritures", "cpta-balance"];

function francs(numeric: string | number | null | undefined) {
  if (numeric === null || numeric === undefined || numeric === "") return "—";
  return formatMontantAffichage(Math.round(Number(numeric) * 100));
}

function optionsComptes(comptes: Compte[], prefixe: RegExp) {
  return comptes.filter((c) => c.actif && prefixe.test(c.numero));
}

// ---------------------------------------------------------------------------
// Fiche
// ---------------------------------------------------------------------------

type Valeurs = {
  code: string;
  libelle: string;
  description: string;
  compteId: string;
  compteAmortissementId: string;
  compteDotationId: string;
  dateAcquisition: string;
  dateMiseEnService: string;
  valeurOrigine: string;
  valeurResiduelle: string;
  mode: ModeAmortissement;
  amortissable: boolean;
  dureeAnnees: string;
  fournisseurId: string;
  referenceFacture: string;
  notes: string;
};

function valeursInitiales(i?: ImmobilisationDetail): Valeurs {
  const aujourdhui = jourAuCameroun();
  return {
    code: i?.code ?? "",
    libelle: i?.libelle ?? "",
    description: i?.description ?? "",
    compteId: i ? String(i.compteId) : "",
    compteAmortissementId: i?.compteAmortissementId ? String(i.compteAmortissementId) : "",
    compteDotationId: i?.compteDotationId ? String(i.compteDotationId) : "",
    dateAcquisition: i?.dateAcquisition ?? aujourdhui,
    dateMiseEnService: i?.dateMiseEnService ?? aujourdhui,
    valeurOrigine: i ? String(Number(i.valeurOrigine)) : "",
    valeurResiduelle: i && Number(i.valeurResiduelle) > 0 ? String(Number(i.valeurResiduelle)) : "",
    mode: i?.mode ?? "LINEAIRE",
    amortissable: i ? i.dureeMois !== null : true,
    dureeAnnees: i?.dureeMois ? String(i.dureeMois / 12) : "5",
    fournisseurId: i?.fournisseurId ? String(i.fournisseurId) : "",
    referenceFacture: i?.referenceFacture ?? "",
    notes: i?.notes ?? "",
  };
}

/** Le compte d'amortissement (28) et de dotation (68) qui vont d'ordinaire avec un compte d'immobilisation. */
function comptesSuggeres(numero: string, comptes: Compte[]) {
  const trouve = (candidats: string[]) => comptes.find((c) => c.actif && candidats.includes(c.numero));
  const amortissement = trouve([`28${numero.slice(1)}`, `28${numero.slice(1, 3)}`, `28${numero.slice(1, 2)}`]);
  const dotation = trouve(numero.startsWith("21") ? ["6811", "681"] : ["6813", "681"]);
  return { amortissement, dotation };
}

function FicheForm({
  contribuableId,
  comptes,
  tiers,
  existante,
  onAnnule,
  onEnregistree,
}: {
  contribuableId: number;
  comptes: Compte[];
  tiers: Tiers[];
  existante?: ImmobilisationDetail;
  onAnnule: () => void;
  onEnregistree: (i: ImmobilisationDetail) => void;
}) {
  const [v, setV] = useState<Valeurs>(() => valeursInitiales(existante));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const fige = existante ? !existante.modifiable : false;
  const immobilisations = useMemo(() => optionsComptes(comptes, /^2[0-7]/), [comptes]);
  const amortissements = useMemo(() => optionsComptes(comptes, /^28/), [comptes]);
  const dotations = useMemo(() => optionsComptes(comptes, /^68/), [comptes]);
  const fournisseurs = useMemo(() => tiers.filter((t) => t.types.includes("FOURNISSEUR")), [tiers]);

  function choisirCompte(compteId: string) {
    const compte = comptes.find((c) => c.id === Number(compteId));
    const s: Partial<ReturnType<typeof comptesSuggeres>> = compte ? comptesSuggeres(compte.numero, comptes) : {};
    setV((x) => ({
      ...x,
      compteId,
      compteAmortissementId: s.amortissement ? String(s.amortissement.id) : x.compteAmortissementId,
      compteDotationId: s.dotation ? String(s.dotation.id) : x.compteDotationId,
      // Un terrain ne s'amortit pas : la case se décoche d'elle-même.
      amortissable: compte ? !compte.numero.startsWith("22") : x.amortissable,
    }));
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const corps = {
        contribuableId,
        code: v.code,
        libelle: v.libelle,
        description: v.description || null,
        compteId: Number(v.compteId),
        compteAmortissementId: v.amortissable && v.compteAmortissementId ? Number(v.compteAmortissementId) : null,
        compteDotationId: v.amortissable && v.compteDotationId ? Number(v.compteDotationId) : null,
        dateAcquisition: v.dateAcquisition,
        dateMiseEnService: v.dateMiseEnService,
        valeurOrigine: v.valeurOrigine,
        valeurResiduelle: v.valeurResiduelle || null,
        mode: v.mode,
        dureeMois: v.amortissable ? Math.round(Number(v.dureeAnnees) * 12) : null,
        fournisseurId: v.fournisseurId ? Number(v.fournisseurId) : null,
        referenceFacture: v.referenceFacture || null,
        notes: v.notes || null,
      };
      const r = existante
        ? await apiSend<ImmobilisationDetail>(`/api/comptabilite/immobilisations/${existante.id}`, "PUT", corps)
        : await apiSend<ImmobilisationDetail>("/api/comptabilite/immobilisations", "POST", corps);
      onEnregistree(r!);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-4">
      {fige && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Une dotation a déjà été passée sur ce bien : ses paramètres d&apos;amortissement ne se modifient plus, seuls le libellé, le fournisseur et les notes restent libres.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div>
          <Label htmlFor="im-code">Code</Label>
          <Input id="im-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} required maxLength={30} placeholder="VEH-001" />
        </div>
        <div>
          <Label htmlFor="im-libelle">Libellé</Label>
          <Input id="im-libelle" value={v.libelle} onChange={(e) => setV({ ...v, libelle: e.target.value })} required maxLength={200} />
        </div>
      </div>

      <div>
        <Label htmlFor="im-compte">Compte d&apos;immobilisation</Label>
        <Select id="im-compte" value={v.compteId} onChange={(e) => choisirCompte(e.target.value)} required disabled={fige}>
          <option value="">— choisir —</option>
          {immobilisations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.numero} — {c.libelle}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="im-acq">Date d&apos;acquisition</Label>
          <Input id="im-acq" type="date" value={v.dateAcquisition} onChange={(e) => setV({ ...v, dateAcquisition: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor="im-mes">Mise en service</Label>
          <Input id="im-mes" type="date" value={v.dateMiseEnService} onChange={(e) => setV({ ...v, dateMiseEnService: e.target.value })} required disabled={fige} />
        </div>
        <div>
          <Label htmlFor="im-vo">Valeur d&apos;origine (HT)</Label>
          <Input id="im-vo" inputMode="numeric" value={v.valeurOrigine} onChange={(e) => setV({ ...v, valeurOrigine: e.target.value })} required disabled={fige} />
        </div>
        <div>
          <Label htmlFor="im-vr">Valeur résiduelle</Label>
          <Input id="im-vr" inputMode="numeric" value={v.valeurResiduelle} onChange={(e) => setV({ ...v, valeurResiduelle: e.target.value })} placeholder="0" disabled={fige} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={v.amortissable} onChange={(e) => setV({ ...v, amortissable: e.target.checked })} disabled={fige} />
        Ce bien s&apos;amortit
      </label>

      {v.amortissable && (
        <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="im-mode">Mode</Label>
            <Select id="im-mode" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as ModeAmortissement })} disabled={fige}>
              <option value="LINEAIRE">Linéaire — prorata en jours</option>
              <option value="DEGRESSIF">Dégressif — coefficient fiscal</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="im-duree">Durée d&apos;utilité (années)</Label>
            <Input id="im-duree" type="number" min={0.5} step={0.5} max={100} value={v.dureeAnnees} onChange={(e) => setV({ ...v, dureeAnnees: e.target.value })} required disabled={fige} />
          </div>
          <div>
            <Label htmlFor="im-amort">Compte d&apos;amortissement</Label>
            <Select id="im-amort" value={v.compteAmortissementId} onChange={(e) => setV({ ...v, compteAmortissementId: e.target.value })} required disabled={fige}>
              <option value="">— choisir —</option>
              {amortissements.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} — {c.libelle}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="im-dot">Compte de dotation</Label>
            <Select id="im-dot" value={v.compteDotationId} onChange={(e) => setV({ ...v, compteDotationId: e.target.value })} required disabled={fige}>
              <option value="">— choisir —</option>
              {dotations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} — {c.libelle}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="im-fourn">Fournisseur</Label>
          <Select id="im-fourn" value={v.fournisseurId} onChange={(e) => setV({ ...v, fournisseurId: e.target.value })}>
            <option value="">—</option>
            {fournisseurs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.raisonSociale}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="im-ref">Référence de la facture</Label>
          <Input id="im-ref" value={v.referenceFacture} onChange={(e) => setV({ ...v, referenceFacture: e.target.value })} maxLength={120} />
        </div>
      </div>
      <div>
        <Label htmlFor="im-notes">Notes</Label>
        <Input id="im-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={2000} placeholder="Immatriculation, numéro de série, emplacement…" />
      </div>

      {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onAnnule}>
          Annuler
        </Button>
        <Button type="submit" disabled={enCours}>
          {enCours && <Spinner />}
          {existante ? "Enregistrer" : "Créer la fiche"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Détail et plan
// ---------------------------------------------------------------------------

function SortieForm({ immobilisation, onAnnule, onSortie }: { immobilisation: ImmobilisationDetail; onAnnule: () => void; onSortie: (r: { numeroPiece: string | null }) => void }) {
  const [date, setDate] = useState(jourAuCameroun());
  const [prix, setPrix] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const r = await apiSend<{ ecriture: { numeroPiece: string | null } }>(`/api/comptabilite/immobilisations/${immobilisation.id}/sortie`, "POST", {
        dateSortie: date,
        prixCession: prix || null,
      });
      onSortie(r!.ecriture);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-4 rounded-md border border-border bg-muted/20 p-4 text-sm">
      <p className="font-medium">Sortir le bien de l&apos;actif</p>
      <p className="text-muted-foreground">
        Une écriture d&apos;opérations diverses solde le compte d&apos;immobilisation et ses amortissements — dotation complémentaire jusqu&apos;à la date comprise —, porte la valeur nette en charge et, s&apos;il y a un prix, le produit de cession.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="so-date">Date de sortie</Label>
          <Input id="so-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="so-prix">Prix de cession HT (vide : mise au rebut)</Label>
          <Input id="so-prix" inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="0" />
        </div>
      </div>
      {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-danger">{erreur}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onAnnule}>
          Annuler
        </Button>
        <Button type="submit" disabled={enCours}>
          {enCours && <Spinner />}
          {prix && Number(prix) > 0 ? "Céder" : "Mettre au rebut"}
        </Button>
      </div>
    </form>
  );
}

function DetailDialog({
  id,
  contribuableId,
  comptes,
  tiers,
  onFerme,
}: {
  id: number;
  contribuableId: number;
  comptes: Compte[];
  tiers: Tiers[];
  onFerme: () => void;
}) {
  const can = useCan();
  const qc = useQueryClient();
  const { data, isLoading } = useImmobilisation(id);
  const [edition, setEdition] = useState(false);
  const [sortie, setSortie] = useState(false);
  const [aSupprimer, setASupprimer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const rafraichir = () => CLES.forEach((c) => qc.invalidateQueries({ queryKey: [c] }));

  async function supprimer() {
    setEnCours(true);
    setErreur(null);
    try {
      await apiSend(`/api/comptabilite/immobilisations/${id}`, "DELETE");
      rafraichir();
      onFerme();
    } catch (e) {
      setErreur(messageErreur(e));
      setASupprimer(false);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onFerme}
      title={data ? `${data.code} — ${data.libelle}` : "Immobilisation"}
      description={data ? `${data.compteNumero} ${data.compteLibelle} · acquis le ${formatDateFR(data.dateAcquisition)} · en service le ${formatDateFR(data.dateMiseEnService)}` : undefined}
      className="max-w-4xl"
    >
      {isLoading && (
        <div className="p-6 text-center">
          <Spinner />
        </div>
      )}
      {data && edition && (
        <FicheForm
          contribuableId={contribuableId}
          comptes={comptes}
          tiers={tiers}
          existante={data}
          onAnnule={() => setEdition(false)}
          onEnregistree={() => {
            setEdition(false);
            rafraichir();
          }}
        />
      )}
      {data && !edition && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={"border-transparent " + STATUT[data.statut].classe}>{STATUT[data.statut].libelle}</Badge>
            <span className="text-sm text-muted-foreground">
              {data.dureeMois === null ? "Non amortissable" : `${MODE[data.mode]} sur ${data.dureeMois / 12} an${data.dureeMois > 12 ? "s" : ""}`}
              {data.fournisseur ? ` · ${data.fournisseur.raisonSociale}` : ""}
              {data.referenceFacture ? ` · facture ${data.referenceFacture}` : ""}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {data.statut === "EN_SERVICE" && can("comptabilite", "update") && (
                <Button variant="outline" size="sm" onClick={() => setEdition(true)}>
                  <Pencil className="h-4 w-4" />
                  Modifier
                </Button>
              )}
              {data.statut === "EN_SERVICE" && can("comptabilite", "update") && (
                <Button variant="outline" size="sm" onClick={() => setSortie((s) => !s)}>
                  <LogOut className="h-4 w-4" />
                  Céder / rebut
                </Button>
              )}
              {data.modifiable && can("comptabilite", "delete") && (
                <Button variant="outline" size="sm" onClick={() => setASupprimer(true)}>
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
              )}
            </div>
          </div>

          {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}
          {info && <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">{info}</p>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-3">
              <p className="text-xs uppercase text-muted-foreground">Valeur d&apos;origine</p>
              <p className="text-lg font-semibold tabular-nums">{francs(data.valeurOrigine)}</p>
              {Number(data.valeurResiduelle) > 0 && <p className="text-xs text-muted-foreground">résiduelle {francs(data.valeurResiduelle)}</p>}
            </Card>
            {data.statut !== "EN_SERVICE" && (
              <Card className="p-3">
                <p className="text-xs uppercase text-muted-foreground">{data.statut === "CEDEE" ? "Cédé le" : "Rebut le"}</p>
                <p className="text-lg font-semibold">{formatDateFR(data.dateSortie)}</p>
                <p className="text-xs text-muted-foreground">
                  {data.statut === "CEDEE" ? `pour ${francs(data.prixCession)} · ` : ""}
                  écriture {data.ecritureSortie?.numeroPiece ?? "—"}
                </p>
              </Card>
            )}
            {data.notes && (
              <Card className="p-3 sm:col-span-2">
                <p className="text-xs uppercase text-muted-foreground">Notes</p>
                <p className="text-sm">{data.notes}</p>
              </Card>
            )}
          </div>

          {sortie && (
            <SortieForm
              immobilisation={data}
              onAnnule={() => setSortie(false)}
              onSortie={(e) => {
                setSortie(false);
                setInfo(`Bien sorti de l'actif — écriture ${e.numeroPiece ?? ""}.`);
                rafraichir();
              }}
            />
          )}

          {data.plan.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Période</th>
                    <th className="p-2 text-left font-medium">Exercice</th>
                    <th className="p-2 text-right font-medium">Dotation</th>
                    <th className="p-2 text-right font-medium">Cumul</th>
                    <th className="p-2 text-right font-medium">Valeur nette</th>
                    <th className="p-2 text-left font-medium">Passée</th>
                  </tr>
                </thead>
                <tbody>
                  {data.plan.map((l) => (
                    <tr key={l.dateDebut} className={"border-t border-border" + (Number(l.dotation) === 0 ? " text-muted-foreground" : "")}>
                      <td className="p-2 whitespace-nowrap">
                        {formatDateFR(l.dateDebut)} → {formatDateFR(l.dateFin)}
                      </td>
                      <td className="p-2">{l.exercice ? l.exercice.libelle : <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2 text-right tabular-nums">{francs(l.dotation)}</td>
                      <td className="p-2 text-right tabular-nums">{francs(l.cumulFin)}</td>
                      <td className="p-2 text-right tabular-nums">{francs(l.vncFin)}</td>
                      <td className="p-2">
                        {l.passee ? (
                          <Badge className="border-transparent bg-success/15 text-success">{l.passee.numeroPiece ?? "passée"}</Badge>
                        ) : l.exercice && Number(l.dotation) > 0 ? (
                          <Badge className="border-transparent bg-warning/15 text-warning">à passer</Badge>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={aSupprimer}
        onClose={() => setASupprimer(false)}
        title="Supprimer cette fiche ?"
        description="La fiche n'a laissé aucune écriture : elle disparaît sans trace comptable."
        onConfirm={supprimer}
        loading={enCours}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Dotations de l'exercice
// ---------------------------------------------------------------------------

function DotationsDialog({ exercice, onFerme, onPassees }: { exercice: Exercice; onFerme: () => void; onPassees: (numero: string | null, n: number) => void }) {
  const { data, isLoading } = usePrevisionDotations(exercice.id);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const total = (data?.lignes ?? []).reduce((t, l) => t + Number(l.dotation), 0);

  async function passer() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await apiSend<{ ecriture: { numeroPiece: string | null }; dotations: unknown[] }>("/api/comptabilite/immobilisations/dotations", "POST", { exerciceId: exercice.id });
      onPassees(r!.ecriture.numeroPiece, r!.dotations.length);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog open onClose={onFerme} title={`Dotations ${exercice.libelle}`} description={`Une écriture d'opérations diverses au ${formatDateFR(exercice.dateFin)}, une ligne de dotation et une d'amortissement par bien.`} className="max-w-2xl">
      {isLoading && (
        <div className="p-6 text-center">
          <Spinner />
        </div>
      )}
      {data && data.lignes.length === 0 && <p className="text-sm text-muted-foreground">Tous les biens amortissables ont leur dotation pour cet exercice.</p>}
      {data && data.lignes.length > 0 && (
        <div className="space-y-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left font-medium">Bien</th>
                  <th className="p-2 text-right font-medium">Dotation</th>
                </tr>
              </thead>
              <tbody>
                {data.lignes.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="p-2">
                      <span className="font-mono text-xs">{l.code}</span> {l.libelle}
                    </td>
                    <td className="p-2 text-right tabular-nums">{francs(l.dotation)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-medium">
                <tr>
                  <td className="p-2">
                    {data.lignes.length} bien{data.lignes.length > 1 ? "s" : ""}
                  </td>
                  <td className="p-2 text-right tabular-nums">{francs(total)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
          {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onFerme}>
              Annuler
            </Button>
            <Button onClick={passer} disabled={enCours || exercice.statut !== "OUVERT"}>
              {enCours && <Spinner />}
              Passer les dotations
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tableau des immobilisations
// ---------------------------------------------------------------------------

function TableauDialog({ exercice, onFerme }: { exercice: Exercice; onFerme: () => void }) {
  const { data, isLoading } = useTableauImmobilisations(exercice.id);
  const colonnes: { cle: keyof NonNullable<typeof data>["totaux"]; libelle: string }[] = [
    { cle: "brutDebut", libelle: "Brut ouverture" },
    { cle: "acquisitions", libelle: "Acquisitions" },
    { cle: "sorties", libelle: "Sorties" },
    { cle: "brutFin", libelle: "Brut clôture" },
    { cle: "amortDebut", libelle: "Amort. ouverture" },
    { cle: "dotation", libelle: "Dotation" },
    { cle: "amortSorties", libelle: "Amort. sorties" },
    { cle: "amortFin", libelle: "Amort. clôture" },
    { cle: "vncFin", libelle: "Valeur nette" },
  ];
  return (
    <Dialog open onClose={onFerme} title={`Tableau des immobilisations — ${exercice.libelle}`} description="Calculé sur les fiches et leurs plans : ce que les livres devraient porter, à confronter à la balance et à la note 3 de la liasse." className="max-w-6xl">
      {isLoading && (
        <div className="p-6 text-center">
          <Spinner />
        </div>
      )}
      {data && data.lignes.length === 0 && <p className="text-sm text-muted-foreground">Aucune immobilisation sur cet exercice.</p>}
      {data && data.lignes.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Bien</th>
                {colonnes.map((c) => (
                  <th key={c.cle} className="p-2 text-right font-medium">
                    {c.libelle}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lignes.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">
                    <span className="font-mono">{l.compteNumero}</span> · <span className="font-mono">{l.code}</span> {l.libelle}
                    {!l.dotee && Number(l.dotation) > 0 && <Badge className="ml-2 border-transparent bg-warning/15 text-warning">à passer</Badge>}
                  </td>
                  {colonnes.map((c) => (
                    <td key={c.cle} className="p-2 text-right tabular-nums">
                      {Number(l[c.cle]) === 0 ? <span className="text-muted-foreground">—</span> : francs(l[c.cle])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border font-medium">
              <tr>
                <td className="p-2">Total</td>
                {colonnes.map((c) => (
                  <td key={c.cle} className="p-2 text-right tabular-nums">
                    {francs(data.totaux[c.cle])}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Panneau
// ---------------------------------------------------------------------------

export function ImmobilisationsPanel({ exercice, comptes, tiers }: { exercice: Exercice; comptes: Compte[]; tiers: Tiers[] }) {
  const can = useCan();
  const qc = useQueryClient();
  const { data, isLoading } = useImmobilisations(exercice.contribuableId, exercice.id);
  const [creation, setCreation] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  const [dotations, setDotations] = useState(false);
  const [tableau, setTableau] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"TOUTES" | "EN_SERVICE" | "SORTIES">("EN_SERVICE");
  const rafraichir = () => CLES.forEach((c) => qc.invalidateQueries({ queryKey: [c] }));

  const lignes = useMemo(
    () => (data ?? []).filter((i) => (filtre === "TOUTES" ? true : filtre === "EN_SERVICE" ? i.statut === "EN_SERVICE" : i.statut !== "EN_SERVICE")),
    [data, filtre],
  );
  const aDoter = (data ?? []).filter((i) => i.statut === "EN_SERVICE" && i.dureeMois !== null && i.doteeDansExercice === false && i.dateMiseEnService <= exercice.dateFin);
  const totalBrut = lignes.reduce((t, i) => t + (i.statut === "EN_SERVICE" ? Number(i.valeurOrigine) : 0), 0);
  const totalNet = lignes.reduce((t, i) => t + (i.statut === "EN_SERVICE" ? Number(i.valeurNette) : 0), 0);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex gap-1" role="tablist" aria-label="Filtre des immobilisations">
          {(
            [
              ["EN_SERVICE", "En service"],
              ["SORTIES", "Sorties"],
              ["TOUTES", "Toutes"],
            ] as const
          ).map(([cle, libelle]) => (
            <button
              key={cle}
              role="tab"
              aria-selected={filtre === cle}
              onClick={() => setFiltre(cle)}
              className={filtre === cle ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"}
            >
              {libelle}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTableau(true)}>
            <Table2 className="h-4 w-4" />
            Tableau des immobilisations
          </Button>
          {can("comptabilite", "create") && exercice.statut === "OUVERT" && (
            <Button variant={aDoter.length > 0 ? "primary" : "outline"} onClick={() => setDotations(true)}>
              <BookOpen className="h-4 w-4" />
              Dotations {exercice.libelle.replace(/^Exercice\s*/i, "")}
              {aDoter.length > 0 && <Badge className="ml-1 border-transparent bg-warning/20 text-warning">{aDoter.length}</Badge>}
            </Button>
          )}
          {can("comptabilite", "create") && (
            <Button onClick={() => setCreation(true)}>
              <Plus className="h-4 w-4" />
              Nouvelle fiche
            </Button>
          )}
        </div>
      </Card>

      {info && <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">{info}</p>}

      {isLoading && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}
      {!isLoading && lignes.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {data?.length ? "Aucun bien dans ce filtre." : "Aucune immobilisation. Le bien entre dans les livres par sa facture d'achat ; la fiche dit comment il s'amortit."}
        </Card>
      )}
      {lignes.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">Compte</th>
                <th className="p-3 text-left font-medium">Code</th>
                <th className="p-3 text-left font-medium">Bien</th>
                <th className="p-3 text-left font-medium">Mise en service</th>
                <th className="p-3 text-left font-medium">Amortissement</th>
                <th className="p-3 text-right font-medium">Valeur d&apos;origine</th>
                <th className="p-3 text-right font-medium">Amorti au {formatDateFR(exercice.dateFin)}</th>
                <th className="p-3 text-right font-medium">Valeur nette</th>
                <th className="p-3 text-left font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((i: ImmobilisationResume) => (
                <tr key={i.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => setDetail(i.id)}>
                  <td className="p-3 font-mono text-xs">{i.compteNumero}</td>
                  <td className="p-3 font-mono text-xs">{i.code}</td>
                  <td className="p-3 font-medium">{i.libelle}</td>
                  <td className="p-3 whitespace-nowrap">{formatDateFR(i.dateMiseEnService)}</td>
                  <td className="p-3 text-muted-foreground">{i.dureeMois === null ? "—" : `${MODE[i.mode]} ${i.dureeMois / 12} ans`}</td>
                  <td className="p-3 text-right tabular-nums">{francs(i.valeurOrigine)}</td>
                  <td className="p-3 text-right tabular-nums">{francs(i.cumulAmortissements)}</td>
                  <td className="p-3 text-right font-medium tabular-nums">{francs(i.valeurNette)}</td>
                  <td className="p-3">
                    <Badge className={"border-transparent " + STATUT[i.statut].classe}>{STATUT[i.statut].libelle}</Badge>
                    {i.statut === "EN_SERVICE" && i.dureeMois !== null && i.doteeDansExercice === false && i.dateMiseEnService <= exercice.dateFin && (
                      <Badge className="ml-1 border-transparent bg-warning/15 text-warning">dotation à passer</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border font-medium">
              <tr>
                <td className="p-3" colSpan={5}>
                  {lignes.length} bien{lignes.length > 1 ? "s" : ""} · en service
                </td>
                <td className="p-3 text-right tabular-nums">{francs(totalBrut)}</td>
                <td className="p-3 text-right tabular-nums">{francs(totalBrut - totalNet)}</td>
                <td className="p-3 text-right tabular-nums">{francs(totalNet)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      <Dialog open={creation} onClose={() => setCreation(false)} title="Nouvelle immobilisation" description="Le bien est déjà dans les livres par sa facture d'achat ; la fiche dit comment l'amortir." className="max-w-2xl">
        {creation && (
          <FicheForm
            contribuableId={exercice.contribuableId}
            comptes={comptes}
            tiers={tiers}
            onAnnule={() => setCreation(false)}
            onEnregistree={(i) => {
              setCreation(false);
              rafraichir();
              setDetail(i.id);
            }}
          />
        )}
      </Dialog>

      {detail !== null && <DetailDialog id={detail} contribuableId={exercice.contribuableId} comptes={comptes} tiers={tiers} onFerme={() => setDetail(null)} />}
      {dotations && (
        <DotationsDialog
          exercice={exercice}
          onFerme={() => setDotations(false)}
          onPassees={(numero, n) => {
            setDotations(false);
            rafraichir();
            setInfo(`Dotations passées pour ${n} bien${n > 1 ? "s" : ""} — écriture ${numero ?? ""}.`);
          }}
        />
      )}
      {tableau && <TableauDialog exercice={exercice} onFerme={() => setTableau(false)} />}
    </div>
  );
}
