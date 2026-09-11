"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Plus, Save, Trash2 } from "lucide-react";
import { ApiClientError, apiGet, apiSend, messageErreur } from "@/lib/api-client";
import { formatDateFR } from "@/lib/constants";
import { jourAuCameroun } from "@/lib/dates";
import {
  AVANTAGE_NATURE_LABELS,
  GROUPE_RISQUE_LABELS,
  REGIME_CNPS_LABELS,
  verifierBareme,
  type AvantageNature,
  type BaremePaie,
  type GroupeRisque,
  type RegimeCnps,
} from "@/lib/paie/bareme";
import { dateNouvelleVersion, depuisSaisie, versSaisie, type BaremeSaisi } from "@/lib/paie/bareme-saisie";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

/**
 * Éditeur du barème de paie.
 *
 * Le barème vit en versions datées : chacune s'applique aux mois de paie à
 * partir de sa date, jusqu'à la suivante. On en édite une à la fois ; une
 * nouvelle version part d'une copie de celle qu'on regarde, puisqu'une loi de
 * finances ne change jamais qu'une poignée de taux. Un mois déjà calculé
 * garde la version qui l'a calculé : modifier le barème ne réécrit aucun
 * bulletin.
 *
 * Le paramètre peut ne pas exister en base (une base créée avant la paie) :
 * l'API renvoie alors le barème livré, que l'on édite comme les autres. Le
 * premier enregistrement le crée.
 */

const REGIMES = Object.keys(REGIME_CNPS_LABELS) as RegimeCnps[];
const GROUPES = Object.keys(GROUPE_RISQUE_LABELS) as GroupeRisque[];
const AVANTAGES = Object.keys(AVANTAGE_NATURE_LABELS) as AvantageNature[];

type Reponse = { versions: BaremePaie[] };

export function PaieBaremePanel({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["paie-bareme"],
    queryFn: () => apiGet<Reponse>("/api/paie/bareme"),
  });

  // `null` tant que rien n'a été touché : l'écran montre ce que l'API renvoie.
  const [brouillon, setBrouillon] = useState<BaremeSaisi[] | null>(null);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [aSupprimer, setASupprimer] = useState(false);

  const versions = brouillon ?? query.data?.versions.map(versSaisie) ?? null;
  // Sans choix explicite, la version la plus récente : c'est celle qu'on vient voir.
  const index = versions ? Math.min(choisie ?? versions.length - 1, versions.length - 1) : 0;
  const version = versions?.[index];

  function remplacer(suivantes: BaremeSaisi[]) {
    setBrouillon(suivantes);
    setErreurs([]);
    setSaved(false);
  }

  function modifier(fn: (v: BaremeSaisi) => BaremeSaisi) {
    if (!versions) return;
    remplacer(versions.map((v, i) => (i === index ? fn(v) : v)));
  }

  function dupliquer() {
    if (!versions || !version) return;
    const copie: BaremeSaisi = structuredClone(version);
    copie.valideDu = dateNouvelleVersion(jourAuCameroun());
    remplacer([...versions, copie]);
    setChoisie(versions.length);
  }

  function supprimer() {
    if (!versions || versions.length <= 1) return;
    remplacer(versions.filter((_, i) => i !== index));
    setChoisie(Math.max(0, index - 1));
    setASupprimer(false);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!versions) return null;
      const lectures = versions.map(depuisSaisie);
      const fautes = lectures.flatMap((l, i) => {
        const nom = versions[i].valideDu ? `Version du ${formatDateFR(versions[i].valideDu)}` : `Version ${i + 1}`;
        const propres = l.erreurs.length > 0 ? l.erreurs : verifierBareme(l.bareme);
        return propres.map((e) => (versions.length > 1 ? `${nom} — ${e}` : e));
      });
      const dates = versions.map((v) => v.valideDu);
      if (new Set(dates).size !== dates.length) fautes.push("Deux versions ont la même date d'application.");
      if (fautes.length > 0) throw fautes;
      return apiSend<Reponse>("/api/paie/bareme", "PUT", { versions: lectures.map((l) => l.bareme) });
    },
    onSuccess: (r) => {
      if (r) {
        qc.setQueryData(["paie-bareme"], r);
        qc.invalidateQueries({ queryKey: ["parametres"] });
        qc.invalidateQueries({ queryKey: ["paie-periodes"] });
        // L'API renvoie les versions triées par date : on repart de là.
        setBrouillon(null);
        const rang = r.versions.findIndex((v) => v.valideDu === version?.valideDu);
        setChoisie(rang < 0 ? null : rang);
      }
      setErreurs([]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setErreurs(Array.isArray(err) ? err : [messageErreur(err)]),
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Spinner className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (query.error instanceof ApiClientError && query.error.status === 403) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-semibold text-foreground">Barème de paie</p>
          <p className="mt-1 text-sm text-muted-foreground">Votre profil ne permet pas de consulter le barème de paie.</p>
        </CardContent>
      </Card>
    );
  }

  if (!versions || !version) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-semibold text-foreground">Barème de paie</p>
          <p className="mt-1 text-sm text-danger">{messageErreur(query.error)}</p>
        </CardContent>
      </Card>
    );
  }

  const champ = (id: string, label: string, valeur: string, poser: (v: string) => void, unite?: string) => (
    <Champ key={id} id={id} label={label} value={valeur} onChange={poser} editable={editable} unite={unite} />
  );

  return (
    <Card>
      <CardContent className="pt-5">
        <div>
          <p className="text-sm font-semibold text-foreground">Barème de paie</p>
          <p className="mt-1 text-sm text-muted-foreground">
            CNPS, IRPP, CFC, FNE, TDL, RAV et avantages en nature, en versions datées. Un mois de paie se calcule avec la version en vigueur à son premier
            jour ; un mois validé garde la sienne.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Versions du barème">
          {versions.map((v, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => {
                setChoisie(i);
                setErreurs([]);
              }}
              className={
                i === index
                  ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {v.valideDu ? `Depuis le ${formatDateFR(v.valideDu)}` : "Nouvelle version"}
            </button>
          ))}
          {editable && (
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={dupliquer}>
                <Copy className="h-3.5 w-3.5" />
                Nouvelle version
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={versions.length <= 1} onClick={() => setASupprimer(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <Section titre="Application">
            <Champ
              id="bareme-valide-du"
              label="En vigueur à partir du"
              type="date"
              value={version.valideDu}
              onChange={(v) => modifier((b) => ({ ...b, valideDu: v }))}
              editable={editable}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Une version s&apos;applique aux mois de paie qui commencent à cette date ou après, jusqu&apos;à la version suivante.
            </p>
          </Section>

          <Section titre="CNPS" sousTitre="Cotisations sociales, sur le brut cotisable plafonné.">
            {champ("cnps-plafond", "Plafond mensuel cotisable", version.cnps.plafondMensuel, (v) => modifier((b) => ({ ...b, cnps: { ...b.cnps, plafondMensuel: v } })), "FCFA")}
            <div className="grid grid-cols-2 gap-3">
              {champ("cnps-pvid-sal", "PVID salarié", version.cnps.pvidSalarie, (v) => modifier((b) => ({ ...b, cnps: { ...b.cnps, pvidSalarie: v } })), "%")}
              {champ("cnps-pvid-emp", "PVID employeur", version.cnps.pvidEmployeur, (v) => modifier((b) => ({ ...b, cnps: { ...b.cnps, pvidEmployeur: v } })), "%")}
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Prestations familiales (employeur)</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {REGIMES.map((r) =>
                  champ(`cnps-pf-${r}`, REGIME_CNPS_LABELS[r], version.cnps.prestationsFamiliales[r], (v) =>
                    modifier((b) => ({ ...b, cnps: { ...b.cnps, prestationsFamiliales: { ...b.cnps.prestationsFamiliales, [r]: v } } })), "%"),
                )}
              </div>
            </fieldset>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Accidents du travail (employeur)</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {GROUPES.map((g) =>
                  champ(`cnps-at-${g}`, GROUPE_RISQUE_LABELS[g], version.cnps.accidentsTravail[g], (v) =>
                    modifier((b) => ({ ...b, cnps: { ...b.cnps, accidentsTravail: { ...b.cnps.accidentsTravail, [g]: v } } })), "%"),
                )}
              </div>
            </fieldset>
          </Section>

          <Section titre="IRPP" sousTitre="Impôt sur le revenu des personnes physiques, sur le brut imposable.">
            {champ("irpp-seuil", "Seuil d'exonération mensuel", version.irpp.seuilExonerationMensuel, (v) => modifier((b) => ({ ...b, irpp: { ...b.irpp, seuilExonerationMensuel: v } })), "FCFA")}
            {champ("irpp-frais", "Abattement frais professionnels", version.irpp.abattementFraisPro, (v) => modifier((b) => ({ ...b, irpp: { ...b.irpp, abattementFraisPro: v } })), "%")}
            {champ("irpp-abattement", "Abattement annuel", version.irpp.abattementAnnuel, (v) => modifier((b) => ({ ...b, irpp: { ...b.irpp, abattementAnnuel: v } })), "FCFA")}
            {champ("irpp-cac", "Centimes additionnels communaux", version.irpp.cac, (v) => modifier((b) => ({ ...b, irpp: { ...b.irpp, cac: v } })), "% de l'IRPP")}
            <div className="sm:col-span-2">
              <TranchesTable
                titre="Tranches du revenu net annuel"
                assiette="Revenu net annuel jusqu'à"
                colonne="Taux"
                unite="%"
                cle="taux"
                lignes={version.irpp.tranchesAnnuelles}
                onChange={(t) => modifier((b) => ({ ...b, irpp: { ...b.irpp, tranchesAnnuelles: t } }))}
                editable={editable}
              />
            </div>
          </Section>

          <Section titre="CFC et FNE" sousTitre="Crédit foncier et Fonds national de l'emploi, sur le brut imposable.">
            {champ("cfc-sal", "CFC salarié", version.cfc.salarie, (v) => modifier((b) => ({ ...b, cfc: { ...b.cfc, salarie: v } })), "%")}
            {champ("cfc-emp", "CFC employeur", version.cfc.employeur, (v) => modifier((b) => ({ ...b, cfc: { ...b.cfc, employeur: v } })), "%")}
            {champ("fne-emp", "FNE employeur", version.fne.employeur, (v) => modifier((b) => ({ ...b, fne: { employeur: v } })), "%")}
          </Section>

          <Section titre="Avantages en nature" sousTitre="Évaluation forfaitaire, en pourcentage du brut en espèces.">
            {AVANTAGES.map((a) =>
              champ(`an-${a}`, AVANTAGE_NATURE_LABELS[a], version.avantagesNature[a], (v) =>
                modifier((b) => ({ ...b, avantagesNature: { ...b.avantagesNature, [a]: v } })), "%"),
            )}
          </Section>

          <div className="sm:col-span-2 lg:col-span-1">
            <TranchesTable
              titre="Taxe de développement local (TDL)"
              sousTitre="Montant mensuel par tranche de salaire de base."
              assiette="Salaire de base jusqu'à"
              colonne="Montant"
              unite="FCFA"
              cle="montant"
              lignes={version.tdl}
              onChange={(t) => modifier((b) => ({ ...b, tdl: t }))}
              editable={editable}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <TranchesTable
              titre="Redevance audiovisuelle (RAV)"
              sousTitre="Montant mensuel par tranche de brut. Sans tranche, elle ne s'applique pas."
              assiette="Brut mensuel jusqu'à"
              colonne="Montant"
              unite="FCFA"
              cle="montant"
              lignes={version.rav}
              onChange={(t) => modifier((b) => ({ ...b, rav: t }))}
              editable={editable}
            />
          </div>
        </div>

        {erreurs.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <ul className="space-y-0.5">
              {erreurs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {editable && (
          <div className="mt-4 flex items-center justify-end gap-3">
            {brouillon && !saved && <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>}
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} variant={saved ? "outline" : "primary"}>
              {mutation.isPending ? <Spinner /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? "Enregistré" : "Enregistrer le barème"}
            </Button>
          </div>
        )}

        <ConfirmDialog
          open={aSupprimer}
          onClose={() => setASupprimer(false)}
          title="Supprimer cette version ?"
          description={
            <>
              La version {version.valideDu ? `du ${formatDateFR(version.valideDu)}` : "en cours"} disparaîtra du barème à l&apos;enregistrement. Les mois de paie
              déjà validés avec elle ne changent pas.
            </>
          }
          onConfirm={supprimer}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Briques de l'éditeur
// ---------------------------------------------------------------------------

function Section({ titre, sousTitre, children }: { titre: string; sousTitre?: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border/60 p-4">
      <h4 className="text-sm font-semibold text-foreground">{titre}</h4>
      {sousTitre && <p className="mt-0.5 text-xs text-muted-foreground">{sousTitre}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Champ({
  id,
  label,
  value,
  onChange,
  editable,
  unite,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  unite?: string;
  type?: "text" | "date";
}) {
  // Les champs d'une même ligne s'alignent par le bas : un libellé qui passe
  // sur deux lignes ne décale pas sa saisie.
  return (
    <div className="flex flex-col justify-end">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          inputMode={type === "text" ? "decimal" : undefined}
          value={value}
          readOnly={!editable}
          onChange={(e) => onChange(e.target.value)}
          className={unite ? "h-9 pr-16" : "h-9"}
        />
        {unite && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unite}</span>}
      </div>
    </div>
  );
}

type Ligne = { jusqua: string } & Record<string, string>;

/**
 * Tranches d'un barème : une borne supérieure incluse et une valeur. La
 * dernière borne se laisse vide — « et au-delà ». Une tranche s'ajoute avant
 * la dernière, pour que celle-ci reste ouverte.
 */
function TranchesTable<L extends Ligne>({
  titre,
  sousTitre,
  assiette,
  colonne,
  unite,
  cle,
  lignes,
  onChange,
  editable,
}: {
  titre: string;
  sousTitre?: string;
  assiette: string;
  colonne: string;
  unite: string;
  cle: Exclude<keyof L, "jusqua"> & string;
  lignes: L[];
  onChange: (lignes: L[]) => void;
  editable: boolean;
}) {
  function poser(i: number, champ: keyof L & string, v: string) {
    onChange(lignes.map((l, j) => (j === i ? { ...l, [champ]: v } : l)));
  }
  function ajouter() {
    const vide = { jusqua: "", [cle]: "0" } as L;
    if (lignes.length === 0) return onChange([vide]);
    onChange([...lignes.slice(0, -1), vide, lignes[lignes.length - 1]]);
  }
  function retirer(i: number) {
    onChange(lignes.filter((_, j) => j !== i));
  }

  return (
    <section className="rounded-md border border-border/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{titre}</h4>
          {sousTitre && <p className="mt-0.5 text-xs text-muted-foreground">{sousTitre}</p>}
        </div>
        {editable && (
          <Button type="button" variant="ghost" size="sm" onClick={ajouter}>
            <Plus className="h-3.5 w-3.5" />
            Tranche
          </Button>
        )}
      </div>
      {lignes.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Aucune tranche.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">{assiette} (FCFA)</th>
                <th className="pb-2 pr-3 font-medium">
                  {colonne} ({unite})
                </th>
                {editable && <th className="pb-2 w-9" />}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => {
                const derniere = i === lignes.length - 1;
                return (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 pr-3">
                      <Input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${assiette}, tranche ${i + 1}`}
                        value={l.jusqua}
                        placeholder={derniere ? "et au-delà" : ""}
                        readOnly={!editable}
                        onChange={(e) => poser(i, "jusqua", e.target.value)}
                        className="h-9"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${colonne}, tranche ${i + 1}`}
                        value={l[cle]}
                        readOnly={!editable}
                        onChange={(e) => poser(i, cle, e.target.value)}
                        className="h-9"
                      />
                    </td>
                    {editable && (
                      <td className="py-1.5">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Retirer la tranche ${i + 1}`} onClick={() => retirer(i)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
