"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, RefreshCw, Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { apiSend, messageErreur } from "@/lib/api-client";
import { formatDateFR } from "@/lib/constants";
import {
  francs,
  libelleMois,
  useBulletin,
  usePeriode,
  usePeriodes,
  type Bulletin,
  type ElementsBulletin,
  type LigneBulletin,
  type PeriodeDetail,
  type StatutPeriode,
} from "./data";

/**
 * Mois de paie et bulletins.
 *
 * Ouvrir un mois calcule un bulletin par salarié présent. Tant qu'il est en
 * brouillon, chaque bulletin reçoit ses éléments du mois et se recalcule ;
 * validé, il ne bouge plus.
 */

const STATUT: Record<StatutPeriode, { libelle: string; classe: string }> = {
  BROUILLON: { libelle: "Brouillon", classe: "bg-muted text-muted-foreground" },
  VALIDEE: { libelle: "Validé", classe: "bg-success/15 text-success" },
};

const CLES = ["paie-periodes", "paie-periode", "paie-bulletin"];

function formatTaux(t: string | null) {
  if (!t) return "";
  return `${String(Number(t)).replace(".", ",")} %`;
}

// ---------------------------------------------------------------------------
// Éléments du mois d'un bulletin
// ---------------------------------------------------------------------------

function ElementsForm({ bulletinId, initial, onEnregistre }: { bulletinId: number; initial: Partial<ElementsBulletin>; onEnregistre: () => void }) {
  const [f, setF] = useState<ElementsBulletin>({
    joursAbsence: initial.joursAbsence ?? 0,
    heuresSup: initial.heuresSup ?? "",
    primes: initial.primes ?? [],
    avances: initial.avances ?? "",
    autresRetenues: initial.autresRetenues ?? [],
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await apiSend(`/api/paie/bulletins/${bulletinId}`, "PUT", {
        ...f,
        heuresSup: f.heuresSup || null,
        avances: f.avances || null,
        primes: f.primes.filter((p) => p.libelle.trim() !== ""),
        autresRetenues: f.autresRetenues.filter((r) => r.libelle.trim() !== ""),
      });
      onEnregistre();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4 rounded-md border border-border bg-muted/20 p-4 text-sm">
      <p className="font-medium">Éléments du mois</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="e-absence">Jours d&apos;absence</Label>
          <Input id="e-absence" type="number" min={0} max={30} value={f.joursAbsence} onChange={(e) => setF({ ...f, joursAbsence: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="e-hs">Heures supplémentaires (montant)</Label>
          <Input id="e-hs" inputMode="numeric" value={f.heuresSup ?? ""} onChange={(e) => setF({ ...f, heuresSup: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="e-avances">Acomptes versés</Label>
          <Input id="e-avances" inputMode="numeric" value={f.avances ?? ""} onChange={(e) => setF({ ...f, avances: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase text-muted-foreground">Primes du mois</p>
        {f.primes.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_auto_auto_auto] items-center gap-2">
            <Input aria-label="Libellé de la prime" placeholder="Libellé" value={p.libelle} onChange={(e) => setF({ ...f, primes: f.primes.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)) })} />
            <Input aria-label="Montant de la prime" inputMode="numeric" placeholder="Montant" value={p.montant} onChange={(e) => setF({ ...f, primes: f.primes.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)) })} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={p.cotisable} onChange={(e) => setF({ ...f, primes: f.primes.map((x, j) => (j === i ? { ...x, cotisable: e.target.checked } : x)) })} />
              Cotisable
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={p.imposable} onChange={(e) => setF({ ...f, primes: f.primes.map((x, j) => (j === i ? { ...x, imposable: e.target.checked } : x)) })} />
              Imposable
            </label>
            <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => setF({ ...f, primes: f.primes.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setF({ ...f, primes: [...f.primes, { libelle: "", montant: "", cotisable: true, imposable: true }] })}>
          <Plus className="h-4 w-4" />
          Prime
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase text-muted-foreground">Autres retenues</p>
        {f.autresRetenues.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
            <Input aria-label="Libellé de la retenue" placeholder="Libellé" value={r.libelle} onChange={(e) => setF({ ...f, autresRetenues: f.autresRetenues.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)) })} />
            <Input aria-label="Montant de la retenue" inputMode="numeric" placeholder="Montant" value={r.montant} onChange={(e) => setF({ ...f, autresRetenues: f.autresRetenues.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)) })} />
            <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => setF({ ...f, autresRetenues: f.autresRetenues.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setF({ ...f, autresRetenues: [...f.autresRetenues, { libelle: "", montant: "" }] })}>
          <Plus className="h-4 w-4" />
          Retenue
        </Button>
      </div>

      {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-danger">{erreur}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={enCours}>
          {enCours && <Spinner />}
          Enregistrer et recalculer
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Bulletin
// ---------------------------------------------------------------------------

function TableLignes({ titre, lignes, total }: { titre: string; lignes: LigneBulletin[]; total: string }) {
  if (lignes.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
        <tr>
          <th className="p-2 text-left font-medium">{titre}</th>
          <th className="p-2 text-right font-medium">Base</th>
          <th className="p-2 text-right font-medium">Taux</th>
          <th className="p-2 text-right font-medium">Montant</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.id} className={"border-t border-border" + (l.enNature ? " text-muted-foreground" : "")}>
            <td className="p-2">
              {l.libelle}
              {l.enNature && <span className="ml-1 text-xs">(non versé)</span>}
            </td>
            <td className="p-2 text-right tabular-nums text-muted-foreground">{l.base ? francs(l.base) : ""}</td>
            <td className="p-2 text-right tabular-nums text-muted-foreground">{formatTaux(l.taux)}</td>
            <td className="p-2 text-right tabular-nums">{francs(l.montant)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t-2 border-border font-medium">
        <tr>
          <td className="p-2" colSpan={3}>
            Total
          </td>
          <td className="p-2 text-right tabular-nums">{francs(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function BulletinDialog({ id, modifiable, onFerme }: { id: number; modifiable: boolean; onFerme: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useBulletin(id);
  const rafraichir = () => CLES.forEach((c) => qc.invalidateQueries({ queryKey: [c] }));

  return (
    <Dialog
      open
      onClose={onFerme}
      title={data ? `${data.nomComplet} — ${libelleMois(data.periode.periode)}` : "Bulletin"}
      description={data ? `${data.matricule}${data.poste ? ` · ${data.poste}` : ""}${data.categorie ? ` · catégorie ${data.categorie}` : ""} · salaire de base ${francs(data.salaireBase)}` : undefined}
      className="max-w-4xl"
    >
      {isLoading && (
        <div className="p-6 text-center">
          <Spinner />
        </div>
      )}
      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-3">
              <p className="text-xs uppercase text-muted-foreground">Brut</p>
              <p className="text-lg font-semibold tabular-nums">{francs(data.brut)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs uppercase text-muted-foreground">Net à payer</p>
              <p className="text-lg font-semibold tabular-nums text-success">{francs(data.netAPayer)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs uppercase text-muted-foreground">Coût employeur</p>
              <p className="text-lg font-semibold tabular-nums">{francs(Number(data.brut) + Number(data.chargesEmployeur))}</p>
            </Card>
          </div>

          <TableLignes titre="Gains" lignes={data.lignes.filter((l) => l.type === "GAIN")} total={data.brut} />
          <TableLignes titre="Retenues" lignes={data.lignes.filter((l) => l.type === "RETENUE")} total={data.totalRetenues} />
          <TableLignes titre="Charges de l'employeur" lignes={data.lignes.filter((l) => l.type === "EMPLOYEUR")} total={data.chargesEmployeur} />

          {modifiable && <ElementsForm key={data.id} bulletinId={data.id} initial={data.elements} onEnregistre={rafraichir} />}
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Un mois
// ---------------------------------------------------------------------------

function PeriodeVue({ periode, onSupprimee }: { periode: PeriodeDetail; onSupprimee: () => void }) {
  const can = useCan();
  const qc = useQueryClient();
  const [bulletin, setBulletin] = useState<number | null>(null);
  const [aValider, setAValider] = useState(false);
  const [aSupprimer, setASupprimer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const brouillon = periode.statut === "BROUILLON";
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

  const t = periode.totaux;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold capitalize">{libelleMois(periode.periode)}</h3>
        <Badge className={"border-transparent " + STATUT[periode.statut].classe}>{STATUT[periode.statut].libelle}</Badge>
        <span className="text-xs text-muted-foreground">
          barème du {formatDateFR(periode.baremeValideDu)}
          {periode.valideeLe ? ` · validé le ${formatDateFR(periode.valideeLe)}` : ""}
        </span>
        <div className="ml-auto flex gap-2">
          {brouillon && can("paie", "update") && (
            <Button variant="outline" size="sm" disabled={enCours} onClick={() => agir(() => apiSend(`/api/paie/periodes/${periode.id}/recalculer`, "POST"))}>
              <RefreshCw className="h-4 w-4" />
              Recalculer
            </Button>
          )}
          {brouillon && can("paie", "delete") && (
            <Button variant="outline" size="sm" disabled={enCours} onClick={() => setASupprimer(true)}>
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          )}
          {brouillon && can("paie", "update") && (
            <Button size="sm" disabled={enCours} onClick={() => setAValider(true)}>
              <CheckCircle2 className="h-4 w-4" />
              Valider le mois
            </Button>
          )}
        </div>
      </div>

      {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Masse brute", t.brut],
          ["Net à payer", t.netAPayer],
          ["CNPS (salarié + employeur)", String(Number(t.cnpsSalarie) + Number(t.cnpsEmployeur))],
          ["IRPP + CAC", String(Number(t.irpp) + Number(t.cac))],
        ].map(([l, v]) => (
          <Card key={l} className="p-3">
            <p className="text-xs uppercase text-muted-foreground">{l}</p>
            <p className="text-lg font-semibold tabular-nums">{francs(v)}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Matricule</th>
              <th className="p-3 text-left font-medium">Salarié</th>
              <th className="p-3 text-right font-medium">Brut</th>
              <th className="p-3 text-right font-medium">CNPS</th>
              <th className="p-3 text-right font-medium">IRPP + CAC</th>
              <th className="p-3 text-right font-medium">Retenues</th>
              <th className="p-3 text-right font-medium">Net à payer</th>
              <th className="p-3 text-right font-medium">Charges employeur</th>
            </tr>
          </thead>
          <tbody>
            {periode.bulletins.map((b: Bulletin) => (
              <tr key={b.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => setBulletin(b.id)}>
                <td className="p-3 font-mono text-xs">{b.matricule}</td>
                <td className="p-3">
                  <span className="font-medium">{b.nomComplet}</span>
                  {b.poste && <span className="ml-2 text-muted-foreground">{b.poste}</span>}
                </td>
                <td className="p-3 text-right tabular-nums">{francs(b.brut)}</td>
                <td className="p-3 text-right tabular-nums">{francs(b.cnpsSalarie)}</td>
                <td className="p-3 text-right tabular-nums">{francs(Number(b.irpp) + Number(b.cac))}</td>
                <td className="p-3 text-right tabular-nums">{francs(b.totalRetenues)}</td>
                <td className="p-3 text-right font-medium tabular-nums">{francs(b.netAPayer)}</td>
                <td className="p-3 text-right tabular-nums text-muted-foreground">{francs(b.chargesEmployeur)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border font-medium">
            <tr>
              <td className="p-3" colSpan={2}>
                {periode.bulletins.length} bulletin{periode.bulletins.length > 1 ? "s" : ""}
              </td>
              <td className="p-3 text-right tabular-nums">{francs(t.brut)}</td>
              <td className="p-3 text-right tabular-nums">{francs(t.cnpsSalarie)}</td>
              <td className="p-3 text-right tabular-nums">{francs(Number(t.irpp) + Number(t.cac))}</td>
              <td className="p-3 text-right tabular-nums">{francs(t.totalRetenues)}</td>
              <td className="p-3 text-right tabular-nums">{francs(t.netAPayer)}</td>
              <td className="p-3 text-right tabular-nums">{francs(t.chargesEmployeur)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {bulletin !== null && <BulletinDialog id={bulletin} modifiable={brouillon && can("paie", "update")} onFerme={() => setBulletin(null)} />}

      <ConfirmDialog
        open={aValider}
        onClose={() => setAValider(false)}
        title={`Valider ${libelleMois(periode.periode)}`}
        description="Les bulletins ne se modifieront plus. Vérifiez les éléments du mois de chaque salarié avant de valider."
        confirmLabel="Valider"
        onConfirm={() => agir(() => apiSend(`/api/paie/periodes/${periode.id}/valider`, "POST"), () => setAValider(false))}
        loading={enCours}
      />
      <ConfirmDialog
        open={aSupprimer}
        onClose={() => setASupprimer(false)}
        title={`Supprimer ${libelleMois(periode.periode)}`}
        description="Le mois et ses bulletins sont jetés. Les éléments saisis seront perdus."
        onConfirm={() => agir(() => apiSend(`/api/paie/periodes/${periode.id}`, "DELETE"), () => { setASupprimer(false); onSupprimee(); })}
        loading={enCours}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau
// ---------------------------------------------------------------------------

function moisSuivant(periode: string | undefined) {
  if (!periode) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const [a, m] = periode.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function PeriodesPanel({ contribuableId }: { contribuableId: number }) {
  const can = useCan();
  const qc = useQueryClient();
  const { data: periodes, isLoading } = usePeriodes(contribuableId);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [ouverture, setOuverture] = useState(false);
  const [mois, setMois] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const periodeId = periodes?.some((p) => p.id === choisie) ? choisie : (periodes?.[0]?.id ?? null);
  const { data: periode } = usePeriode(periodeId);

  async function ouvrir(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const p = await apiSend<PeriodeDetail>("/api/paie/periodes", "POST", { contribuableId, periode: mois });
      qc.invalidateQueries({ queryKey: ["paie-periodes"] });
      setChoisie(p!.id);
      setOuverture(false);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Mois de paie">
          {isLoading && <Spinner />}
          {!isLoading && (periodes?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Aucun mois de paie ouvert.</p>}
          {periodes?.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === periodeId}
              onClick={() => setChoisie(p.id)}
              className={
                p.id === periodeId
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              }
            >
              <span className="capitalize">{libelleMois(p.periode)}</span>
              {p.statut === "VALIDEE" && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        {can("paie", "create") && (
          <Button
            className="ml-auto"
            onClick={() => {
              setMois(moisSuivant(periodes?.[0]?.periode));
              setOuverture(true);
            }}
          >
            <CalendarPlus className="h-4 w-4" />
            Ouvrir un mois
          </Button>
        )}
      </Card>

      {periode && <PeriodeVue key={periode.id} periode={periode} onSupprimee={() => setChoisie(null)} />}

      <Dialog open={ouverture} onClose={() => setOuverture(false)} title="Ouvrir un mois de paie" description="Un bulletin est calculé pour chaque salarié présent, sur sa fiche et le barème en vigueur.">
        <form onSubmit={ouvrir} className="space-y-4">
          <div>
            <Label htmlFor="p-mois">Mois</Label>
            <Input id="p-mois" type="month" value={mois} onChange={(e) => setMois(e.target.value)} required />
          </div>
          {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOuverture(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={enCours}>
              {enCours && <Spinner />}
              Ouvrir
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
