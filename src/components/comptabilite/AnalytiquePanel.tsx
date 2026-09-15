"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCan } from "@/hooks/useCan";
import { apiSend, messageErreur } from "@/lib/api-client";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { formatDateFR } from "@/lib/constants";
import { useAxesAnalytiques, useLignesAnalytiques, useRestitutionAnalytique, type AxeAnalytique, type Exercice, type LigneAVentiler } from "./data";

/**
 * Comptabilité analytique (E5).
 *
 * Un axe est une façon de lire les charges et les produits — par activité,
 * par site, par projet —, ses sections en sont les cases. Chaque ligne de
 * charge ou de produit se ventile sur les sections d'un axe ; ce qui n'est
 * pas ventilé reste visible comme tel. La restitution donne le compte de
 * résultat par section.
 */

const CLES = ["cpta-axes", "cpta-analytique-lignes", "cpta-analytique-restitution"];

function francs(numeric: string | number | null | undefined) {
  if (numeric === null || numeric === undefined || numeric === "") return "—";
  return formatMontantAffichage(Math.round(Number(numeric) * 100));
}

// ---------------------------------------------------------------------------
// Ventilation d'une ligne
// ---------------------------------------------------------------------------

function VentilationDialog({
  ligne,
  axe,
  sections,
  onFerme,
  onVentilee,
}: {
  ligne: LigneAVentiler;
  axe: { id: number; code: string; libelle: string };
  sections: { id: number; code: string; libelle: string; actif: boolean }[];
  onFerme: () => void;
  onVentilee: () => void;
}) {
  const [parts, setParts] = useState<{ sectionId: string; montant: string }[]>(() =>
    ligne.ventilations.length > 0
      ? ligne.ventilations.map((v) => ({ sectionId: String(v.sectionId), montant: String(Number(v.montant)) }))
      : [{ sectionId: "", montant: String(Number(ligne.montant)) }],
  );
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const actives = sections.filter((s) => s.actif);
  const montant = Number(ligne.montant);
  // Seule une part qui a une section compte : une part sans section n'ira nulle part.
  const total = parts.reduce((t, p) => t + (p.sectionId ? Number(p.montant) || 0 : 0), 0);
  const reste = Math.round((montant - total) * 100) / 100;

  /** Tout mettre sur une section : une part, tout le montant. */
  function toutSur(sectionId: number) {
    setParts([{ sectionId: String(sectionId), montant: String(montant) }]);
  }
  /** Le reste sur une part vide : ce qui n'est pas encore affecté va sur la dernière ligne sans montant. */
  function completer(i: number) {
    const sansMoi = parts.reduce((t, p, j) => (j === i ? t : t + (Number(p.montant) || 0)), 0);
    setParts(parts.map((p, j) => (j === i ? { ...p, montant: String(Math.max(0, Math.round((montant - sansMoi) * 100) / 100)) } : p)));
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await apiSend(`/api/comptabilite/analytique/lignes/${ligne.ligneId}/ventilation`, "PUT", {
        axeId: axe.id,
        ventilations: parts.filter((p) => p.sectionId && Number(p.montant) > 0).map((p) => ({ sectionId: Number(p.sectionId), montant: p.montant })),
      });
      onVentilee();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onFerme}
      title={`Ventiler — ${ligne.compteNumero} ${ligne.compteLibelle}`}
      description={`${formatDateFR(ligne.dateEcriture)} · ${ligne.numeroPiece ?? ligne.journalCode} · ${ligne.libelle} · ${francs(ligne.montant)} au ${ligne.sens === "DEBIT" ? "débit" : "crédit"} · axe ${axe.libelle}`}
      className="max-w-2xl"
    >
      <form onSubmit={enregistrer} className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {actives.map((s) => (
            <Button key={s.id} type="button" variant="subtle" size="sm" onClick={() => toutSur(s.id)}>
              Tout sur {s.code}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_160px_auto_auto] items-center gap-2">
              <Select aria-label="Section" value={p.sectionId} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, sectionId: e.target.value } : x)))}>
                <option value="">— section —</option>
                {actives.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.libelle}
                  </option>
                ))}
              </Select>
              <Input aria-label="Montant" inputMode="numeric" value={p.montant} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="sm" title="Mettre le reste sur cette part" onClick={() => completer(i)}>
                reste
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => setParts(parts.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setParts([...parts, { sectionId: "", montant: "" }])}>
            <Plus className="h-4 w-4" />
            Part
          </Button>
        </div>
        <p className={"text-sm " + (reste < 0 ? "text-danger" : reste > 0 ? "text-warning" : "text-success")}>
          {reste < 0 ? `Dépassement de ${francs(-reste)}` : reste > 0 ? `Reste non ventilé : ${francs(reste)}` : "Ligne entièrement ventilée."}
        </p>
        {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFerme}>
            Annuler
          </Button>
          <Button type="submit" disabled={enCours || reste < 0}>
            {enCours && <Spinner />}
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Ventilation
// ---------------------------------------------------------------------------

function VentilationVue({ exercice, axe }: { exercice: Exercice; axe: AxeAnalytique }) {
  const can = useCan();
  const qc = useQueryClient();
  const [etat, setEtat] = useState<"A_VENTILER" | "TOUTES">("A_VENTILER");
  const [compte, setCompte] = useState("");
  const { data, isLoading } = useLignesAnalytiques(exercice.id, axe.id, etat, compte || undefined);
  const [choisie, setChoisie] = useState<LigneAVentiler | null>(null);
  const sectionsParId = useMemo(() => new Map((data?.sections ?? []).map((s) => [s.id, s])), [data]);
  const totalReste = (data?.lignes ?? []).reduce((t, l) => t + Number(l.reste), 0);
  const peutVentiler = can("comptabilite", "update") && exercice.statut === "OUVERT";

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex gap-1" role="tablist" aria-label="État de ventilation">
          {(
            [
              ["A_VENTILER", "À ventiler"],
              ["TOUTES", "Toutes les lignes"],
            ] as const
          ).map(([cle, libelle]) => (
            <button
              key={cle}
              role="tab"
              aria-selected={etat === cle}
              onClick={() => setEtat(cle)}
              className={etat === cle ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"}
            >
              {libelle}
            </button>
          ))}
        </div>
        <div className="w-40">
          <Label htmlFor="an-compte">Compte commençant par</Label>
          <Input id="an-compte" value={compte} onChange={(e) => setCompte(e.target.value.trim())} placeholder="6, 62, 701…" maxLength={10} />
        </div>
        {data && (
          <p className="ml-auto text-sm text-muted-foreground">
            {data.lignes.length} ligne{data.lignes.length > 1 ? "s" : ""}
            {etat === "A_VENTILER" ? ` · ${francs(totalReste)} à ventiler` : ""}
          </p>
        )}
      </Card>

      {isLoading && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}
      {data && data.lignes.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">{etat === "A_VENTILER" ? "Tout est ventilé sur cet axe." : "Aucune ligne de charge ou de produit validée."}</Card>
      )}
      {data && data.lignes.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">Date</th>
                <th className="p-3 text-left font-medium">Pièce</th>
                <th className="p-3 text-left font-medium">Compte</th>
                <th className="p-3 text-left font-medium">Libellé</th>
                <th className="p-3 text-right font-medium">Montant</th>
                <th className="p-3 text-left font-medium">Ventilation {axe.code}</th>
                <th className="p-3 text-right font-medium">Reste</th>
              </tr>
            </thead>
            <tbody>
              {data.lignes.map((l) => (
                <tr key={l.ligneId} className={"border-t border-border" + (peutVentiler ? " cursor-pointer hover:bg-muted/30" : "")} onClick={() => peutVentiler && setChoisie(l)}>
                  <td className="p-3 whitespace-nowrap">{formatDateFR(l.dateEcriture)}</td>
                  <td className="p-3 font-mono text-xs">{l.numeroPiece ?? l.journalCode}</td>
                  <td className="p-3">
                    <span className="font-mono text-xs">{l.compteNumero}</span> <span className="text-muted-foreground">{l.compteLibelle}</span>
                  </td>
                  <td className="p-3">{l.libelle}</td>
                  <td className="p-3 text-right tabular-nums">
                    {francs(l.montant)} <span className="text-xs text-muted-foreground">{l.sens === "DEBIT" ? "D" : "C"}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {l.ventilations.map((v) => (
                        <Badge key={v.sectionId} className="border-transparent bg-primary/10 text-foreground">
                          {sectionsParId.get(v.sectionId)?.code ?? v.sectionId} {francs(v.montant)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className={"p-3 text-right tabular-nums " + (Number(l.reste) > 0 ? "text-warning" : "text-muted-foreground")}>{francs(l.reste)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {choisie && data && (
        <VentilationDialog
          ligne={choisie}
          axe={data.axe}
          sections={data.sections}
          onFerme={() => setChoisie(null)}
          onVentilee={() => {
            setChoisie(null);
            CLES.forEach((c) => qc.invalidateQueries({ queryKey: [c] }));
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Restitution
// ---------------------------------------------------------------------------

function RestitutionVue({ exercice, axe }: { exercice: Exercice; axe: AxeAnalytique }) {
  const { data, isLoading } = useRestitutionAnalytique(exercice.id, axe.id);
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const cle = (s: { id: number } | null) => (s ? String(s.id) : "reste");

  if (isLoading) {
    return (
      <Card className="p-10 text-center">
        <Spinner />
      </Card>
    );
  }
  if (!data) return null;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3 text-left font-medium">Section</th>
            <th className="p-3 text-right font-medium">Charges</th>
            <th className="p-3 text-right font-medium">Produits</th>
            <th className="p-3 text-right font-medium">Résultat</th>
          </tr>
        </thead>
        <tbody>
          {data.lignes.map((r) => {
            const k = cle(r.section);
            const ouverte = ouvertes.has(k);
            return [
              <tr
                key={k}
                className={"cursor-pointer border-t border-border hover:bg-muted/30" + (r.section ? "" : " text-muted-foreground")}
                onClick={() => {
                  const n = new Set(ouvertes);
                  if (ouverte) n.delete(k);
                  else n.add(k);
                  setOuvertes(n);
                }}
              >
                <td className="p-3">
                  <span className="mr-1 inline-block align-middle">{ouverte ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
                  {r.section ? (
                    <>
                      <span className="font-mono text-xs">{r.section.code}</span> <span className="font-medium">{r.section.libelle}</span>
                    </>
                  ) : (
                    <span className="italic">Non ventilé</span>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums">{francs(r.charges)}</td>
                <td className="p-3 text-right tabular-nums">{francs(r.produits)}</td>
                <td className={"p-3 text-right font-medium tabular-nums " + (Number(r.resultat) < 0 ? "text-danger" : "")}>{francs(r.resultat)}</td>
              </tr>,
              ...(ouverte
                ? r.comptes.map((c) => (
                    <tr key={`${k}-${c.numero}`} className="border-t border-border/50 bg-muted/10 text-xs">
                      <td className="py-1.5 pl-10 pr-3">
                        <span className="font-mono">{c.numero}</span> <span className="text-muted-foreground">{c.libelle}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(c.charges) === 0 ? "" : francs(c.charges)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(c.produits) === 0 ? "" : francs(c.produits)}</td>
                      <td />
                    </tr>
                  ))
                : []),
            ];
          })}
          {data.lignes.length === 0 && (
            <tr>
              <td colSpan={4} className="p-8 text-center text-muted-foreground">
                Aucune section sur cet axe.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-border font-medium">
          <tr>
            <td className="p-3">Total {exercice.libelle}</td>
            <td className="p-3 text-right tabular-nums">{francs(data.totaux.charges)}</td>
            <td className="p-3 text-right tabular-nums">{francs(data.totaux.produits)}</td>
            <td className={"p-3 text-right tabular-nums " + (Number(data.totaux.resultat) < 0 ? "text-danger" : "")}>{francs(data.totaux.resultat)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Axes et sections
// ---------------------------------------------------------------------------

function AxesVue({ contribuableId, axes }: { contribuableId: number; axes: AxeAnalytique[] }) {
  const can = useCan();
  const qc = useQueryClient();
  const [nouvelAxe, setNouvelAxe] = useState({ code: "", libelle: "" });
  const [nouvelleSection, setNouvelleSection] = useState<{ axeId: number; code: string; libelle: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const rafraichir = () => CLES.forEach((c) => qc.invalidateQueries({ queryKey: [c] }));

  async function agir(action: () => Promise<unknown>) {
    setErreur(null);
    try {
      await action();
      rafraichir();
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <div className="space-y-4">
      {erreur && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erreur}</p>}
      {axes.map((a) => (
        <Card key={a.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{a.code}</span>
            <span className="font-semibold">{a.libelle}</span>
            {!a.actif && <Badge className="border-transparent bg-muted text-muted-foreground">Désactivé</Badge>}
            <div className="ml-auto flex gap-2">
              {can("comptabilite", "update") && (
                <Button variant="outline" size="sm" onClick={() => agir(() => apiSend(`/api/comptabilite/analytique/axes/${a.id}`, "PATCH", { actif: !a.actif }))}>
                  {a.actif ? "Désactiver" : "Réactiver"}
                </Button>
              )}
              {can("comptabilite", "delete") && (
                <Button variant="outline" size="sm" onClick={() => agir(() => apiSend(`/api/comptabilite/analytique/axes/${a.id}`, "DELETE"))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.sections.map((s) => (
              <span key={s.id} className={"inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm" + (s.actif ? "" : " text-muted-foreground line-through")}>
                <span className="font-mono text-xs">{s.code}</span> {s.libelle}
                {can("comptabilite", "update") && (
                  <button type="button" className="ml-1 text-xs text-muted-foreground hover:text-foreground" title={s.actif ? "Désactiver" : "Réactiver"} onClick={() => agir(() => apiSend(`/api/comptabilite/analytique/sections/${s.id}`, "PATCH", { actif: !s.actif }))}>
                    {s.actif ? "⏸" : "▶"}
                  </button>
                )}
                {can("comptabilite", "delete") && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-danger" title="Supprimer" onClick={() => agir(() => apiSend(`/api/comptabilite/analytique/sections/${s.id}`, "DELETE"))}>
                    ✕
                  </button>
                )}
              </span>
            ))}
            {a.sections.length === 0 && <span className="text-sm text-muted-foreground">Aucune section.</span>}
          </div>
          {can("comptabilite", "create") && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = nouvelleSection?.axeId === a.id ? nouvelleSection : null;
                if (!n) return;
                agir(async () => {
                  await apiSend(`/api/comptabilite/analytique/axes/${a.id}/sections`, "POST", { code: n.code, libelle: n.libelle });
                  setNouvelleSection(null);
                });
              }}
            >
              <div className="w-28">
                <Label htmlFor={`s-code-${a.id}`}>Code</Label>
                <Input id={`s-code-${a.id}`} value={nouvelleSection?.axeId === a.id ? nouvelleSection.code : ""} onChange={(e) => setNouvelleSection({ axeId: a.id, code: e.target.value, libelle: nouvelleSection?.axeId === a.id ? nouvelleSection.libelle : "" })} maxLength={20} required />
              </div>
              <div className="w-64">
                <Label htmlFor={`s-lib-${a.id}`}>Section</Label>
                <Input id={`s-lib-${a.id}`} value={nouvelleSection?.axeId === a.id ? nouvelleSection.libelle : ""} onChange={(e) => setNouvelleSection({ axeId: a.id, libelle: e.target.value, code: nouvelleSection?.axeId === a.id ? nouvelleSection.code : "" })} maxLength={120} required />
              </div>
              <Button type="submit" variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Section
              </Button>
            </form>
          )}
        </Card>
      ))}

      {can("comptabilite", "create") && (
        <Card className="p-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              agir(async () => {
                await apiSend("/api/comptabilite/analytique/axes", "POST", { contribuableId, ...nouvelAxe });
                setNouvelAxe({ code: "", libelle: "" });
              });
            }}
          >
            <div className="w-28">
              <Label htmlFor="a-code">Code</Label>
              <Input id="a-code" value={nouvelAxe.code} onChange={(e) => setNouvelAxe({ ...nouvelAxe, code: e.target.value })} placeholder="ACT" maxLength={20} required />
            </div>
            <div className="w-64">
              <Label htmlFor="a-lib">Nouvel axe</Label>
              <Input id="a-lib" value={nouvelAxe.libelle} onChange={(e) => setNouvelAxe({ ...nouvelAxe, libelle: e.target.value })} placeholder="Activité, Site, Projet…" maxLength={120} required />
            </div>
            <Button type="submit">
              <Plus className="h-4 w-4" />
              Axe
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau
// ---------------------------------------------------------------------------

export function AnalytiquePanel({ exercice }: { exercice: Exercice }) {
  const { data: axes, isLoading } = useAxesAnalytiques(exercice.contribuableId);
  const [vue, setVue] = useState<"ventilation" | "restitution" | "axes">("ventilation");
  const [axeChoisi, setAxeChoisi] = useState<number>();
  const axe = axes?.find((a) => a.id === axeChoisi) ?? axes?.find((a) => a.actif) ?? axes?.[0];

  if (isLoading) {
    return (
      <Card className="p-10 text-center">
        <Spinner />
      </Card>
    );
  }
  const sansAxe = !axes || axes.length === 0;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex gap-1" role="tablist" aria-label="Vue analytique">
          {(
            [
              ["ventilation", "Ventilation"],
              ["restitution", "Restitution"],
              ["axes", "Axes et sections"],
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
        {vue !== "axes" && !sansAxe && (
          <div className="ml-auto w-64">
            <Label htmlFor="an-axe">Axe</Label>
            <Select id="an-axe" value={axe?.id ?? ""} onChange={(e) => setAxeChoisi(Number(e.target.value))}>
              {axes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.libelle}
                  {a.actif ? "" : " (désactivé)"}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      {vue === "axes" && <AxesVue contribuableId={exercice.contribuableId} axes={axes ?? []} />}
      {vue !== "axes" && sansAxe && (
        <Card className="p-8 text-center text-sm text-muted-foreground">Aucun axe analytique : créez-en un — par activité, par site, par projet — dans « Axes et sections ».</Card>
      )}
      {vue === "ventilation" && axe && <VentilationVue exercice={exercice} axe={axe} />}
      {vue === "restitution" && axe && <RestitutionVue exercice={exercice} axe={axe} />}
    </div>
  );
}
