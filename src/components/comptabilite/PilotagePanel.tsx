"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Coins, Percent, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatMontantAffichage } from "@/lib/comptable/money";
import { jourAuCameroun } from "@/lib/dates";
import { useAxesAnalytiques, useBudgets, usePilotage, type Exercice, type MoisPilotage } from "./data";

/**
 * Tableau de bord de gestion mensuel (A1, docs/23).
 *
 * Le compte de résultat dit ce que l'année a donné ; ce tableau dit ce que
 * chaque mois donne, pendant qu'on peut encore agir. Mêmes postes, mêmes
 * rattachements que la liasse : la somme des mois est le compte de résultat.
 */

const francs = (centimes: number) => formatMontantAffichage(centimes);

function pourcent(p: number | null) {
  if (p === null) return "—";
  return `${String(p).replace(".", ",")} %`;
}

const MOIS_ABREGES = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « janv. 2026 » depuis « 2026-01 ». */
function libelleMois(mois: string) {
  const [annee, numero] = mois.split("-").map(Number);
  return `${MOIS_ABREGES[numero - 1]} ${annee}`;
}

/** Montant lisible sur un axe : « 1,2 M », « 350 k ». */
function compact(centimes: number) {
  const f = centimes / 100;
  const abs = Math.abs(f);
  const signe = f < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${signe}${(abs / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1_000) return `${signe}${Math.round(abs / 1_000)} k`;
  return `${signe}${Math.round(abs)}`;
}

/** Variation d'un mois sur le précédent, en % ; nulle sans base. */
function variation(courant: number, precedent: number | undefined): number | null {
  if (precedent === undefined || precedent === 0) return null;
  return Math.round(((courant - precedent) / Math.abs(precedent)) * 1000) / 10;
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 13,
};

export function PilotagePanel({ exercice }: { exercice: Exercice }) {
  const aujourdhui = jourAuCameroun();
  const [jusquAu, setJusquAu] = useState(aujourdhui < exercice.dateFin ? (aujourdhui > exercice.dateDebut ? aujourdhui : exercice.dateDebut) : exercice.dateFin);
  const [sectionId, setSectionId] = useState("");
  const [budgetId, setBudgetId] = useState("");

  const { data: axes } = useAxesAnalytiques(exercice.contribuableId);
  const { data: budgets } = useBudgets(exercice.id);
  const budgetsValides = useMemo(() => (budgets ?? []).filter((b) => b.statut === "VALIDE"), [budgets]);

  const { data, isLoading, error } = usePilotage(exercice.id, {
    jusquAu,
    sectionId: sectionId ? Number(sectionId) : undefined,
    budgetId: budgetId ? Number(budgetId) : undefined,
  });

  const graphe = useMemo(
    () =>
      (data?.mois ?? []).map((m) => ({
        mois: libelleMois(m.mois),
        "Chiffre d'affaires": m.chiffreAffaires / 100,
        "Marge commerciale": m.margeCommerciale / 100,
        "Résultat net": m.resultatNet / 100,
        ...(m.budgetChiffreAffaires !== null ? { "CA budgété": m.budgetChiffreAffaires / 100 } : {}),
      })),
    [data],
  );

  const avecBudget = data?.budget !== null && data?.budget !== undefined;
  const ecartCA = avecBudget && data ? data.cumul.chiffreAffaires - (data.cumul.budgetChiffreAffaires ?? 0) : null;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <Label htmlFor="pil-date">Jusqu&apos;au</Label>
          <Input id="pil-date" type="date" value={jusquAu} min={exercice.dateDebut} max={exercice.dateFin} onChange={(e) => e.target.value && setJusquAu(e.target.value)} />
        </div>
        {axes && axes.some((a) => a.sections.length > 0) && (
          <div className="min-w-56">
            <Label htmlFor="pil-section">Section analytique</Label>
            <Select id="pil-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Toute l&apos;entité</option>
              {axes.map((a) => (
                <optgroup key={a.id} label={`${a.code} — ${a.libelle}`}>
                  {a.sections
                    .filter((s) => s.actif)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.libelle}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </div>
        )}
        {budgetsValides.length > 0 && (
          <div className="min-w-56">
            <Label htmlFor="pil-budget">Budget</Label>
            <Select id="pil-budget" value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
              <option value="">Dernier validé</option>
              {budgetsValides.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.libelle}
                </option>
              ))}
            </Select>
          </div>
        )}
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.mois.length} mois · mêmes postes que le compte de résultat
            {data.section && " · seule la part ventilée sur la section compte"}
            {sectionId && !data.budget && budgetsValides.length > 0 && " · le budget n'est pas bâti sur cet axe"}
          </p>
        )}
      </Card>

      {isLoading && (
        <Card className="p-10 text-center">
          <Spinner />
        </Card>
      )}
      {error && <Card className="p-4 text-sm text-danger">{error.message}</Card>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Chiffre d'affaires à date"
              value={francs(data.cumul.chiffreAffaires)}
              icon={Coins}
              tone="primary"
              hint={ecartCA !== null ? `${ecartCA >= 0 ? "+" : ""}${francs(ecartCA)} par rapport au budget` : undefined}
            />
            <StatCard
              label="Marge commerciale"
              value={francs(data.cumul.margeCommerciale)}
              icon={Percent}
              tone={data.cumul.tauxMarge !== null && data.cumul.tauxMarge < 0 ? "danger" : "info"}
              hint={data.cumul.tauxMarge !== null ? `taux de marge ${pourcent(data.cumul.tauxMarge)}` : "aucune vente de marchandises"}
            />
            <StatCard label="Excédent brut d'exploitation" value={francs(data.cumul.ebe)} icon={TrendingUp} tone={data.cumul.ebe < 0 ? "danger" : "info"} />
            <StatCard
              label="Résultat net à date"
              value={francs(data.cumul.resultatNet)}
              icon={Wallet}
              tone={data.cumul.resultatNet < 0 ? "danger" : "primary"}
              hint={data.cumul.budgetResultat !== null ? `budget ${francs(data.cumul.budgetResultat)}` : undefined}
            />
          </div>

          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Chiffre d&apos;affaires, marge et résultat par mois</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={graphe} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mois" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v * 100)} width={56} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} formatter={(v) => francs(Math.round(Number(v) * 100))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Chiffre d'affaires" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Marge commerciale" fill="#59b233" radius={[4, 4, 0, 0]} />
                {avecBudget && <Line type="monotone" dataKey="CA budgété" stroke="#f59e0b" strokeDasharray="4 4" dot={false} />}
                <Line type="monotone" dataKey="Résultat net" stroke="#7c3aed" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <TableauMensuel mois={data.mois} cumul={data.cumul} avecBudget={avecBudget} />
        </>
      )}
    </div>
  );
}

function TableauMensuel({ mois, cumul, avecBudget }: { mois: MoisPilotage[]; cumul: Omit<MoisPilotage, "mois">; avecBudget: boolean }) {
  const signe = (n: number) => (n < 0 ? "text-danger" : "");
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left font-medium">Mois</th>
            <th className="p-2 text-right font-medium">Chiffre d&apos;affaires</th>
            <th className="p-2 text-right font-medium">vs mois préc.</th>
            {avecBudget && <th className="p-2 text-right font-medium">CA budgété</th>}
            {avecBudget && <th className="p-2 text-right font-medium">Écart CA</th>}
            <th className="p-2 text-right font-medium">Marge comm.</th>
            <th className="p-2 text-right font-medium">Taux</th>
            <th className="p-2 text-right font-medium">Valeur ajoutée</th>
            <th className="p-2 text-right font-medium">Personnel</th>
            <th className="p-2 text-right font-medium">EBE</th>
            <th className="p-2 text-right font-medium">Résultat net</th>
            {avecBudget && <th className="p-2 text-right font-medium">Résultat budgété</th>}
          </tr>
        </thead>
        <tbody>
          {mois.map((m, i) => {
            const v = variation(m.chiffreAffaires, mois[i - 1]?.chiffreAffaires);
            const ecart = m.budgetChiffreAffaires !== null ? m.chiffreAffaires - m.budgetChiffreAffaires : null;
            return (
              <tr key={m.mois} className="border-t border-border">
                <td className="p-2 capitalize">{libelleMois(m.mois)}</td>
                <td className="p-2 text-right tabular-nums">{francs(m.chiffreAffaires)}</td>
                <td className={`p-2 text-right tabular-nums ${v !== null && v < 0 ? "text-danger" : "text-muted-foreground"}`}>{v === null ? "—" : `${v > 0 ? "+" : ""}${pourcent(v)}`}</td>
                {avecBudget && <td className="p-2 text-right tabular-nums text-muted-foreground">{m.budgetChiffreAffaires === null ? "—" : francs(m.budgetChiffreAffaires)}</td>}
                {avecBudget && <td className={`p-2 text-right tabular-nums ${ecart !== null ? signe(ecart) : ""}`}>{ecart === null ? "—" : francs(ecart)}</td>}
                <td className={`p-2 text-right tabular-nums ${signe(m.margeCommerciale)}`}>{francs(m.margeCommerciale)}</td>
                <td className="p-2 text-right tabular-nums">{pourcent(m.tauxMarge)}</td>
                <td className={`p-2 text-right tabular-nums ${signe(m.valeurAjoutee)}`}>{francs(m.valeurAjoutee)}</td>
                <td className="p-2 text-right tabular-nums">{francs(m.chargesPersonnel)}</td>
                <td className={`p-2 text-right tabular-nums ${signe(m.ebe)}`}>{francs(m.ebe)}</td>
                <td className={`p-2 text-right tabular-nums font-medium ${signe(m.resultatNet)}`}>{francs(m.resultatNet)}</td>
                {avecBudget && <td className="p-2 text-right tabular-nums text-muted-foreground">{m.budgetResultat === null ? "—" : francs(m.budgetResultat)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/20 font-semibold">
          <tr>
            <td className="p-2">Cumul à date</td>
            <td className="p-2 text-right tabular-nums">{francs(cumul.chiffreAffaires)}</td>
            <td className="p-2" />
            {avecBudget && <td className="p-2 text-right tabular-nums text-muted-foreground">{cumul.budgetChiffreAffaires === null ? "—" : francs(cumul.budgetChiffreAffaires)}</td>}
            {avecBudget && <td className={`p-2 text-right tabular-nums ${cumul.budgetChiffreAffaires !== null ? signe(cumul.chiffreAffaires - cumul.budgetChiffreAffaires) : ""}`}>{cumul.budgetChiffreAffaires === null ? "—" : francs(cumul.chiffreAffaires - cumul.budgetChiffreAffaires)}</td>}
            <td className={`p-2 text-right tabular-nums ${signe(cumul.margeCommerciale)}`}>{francs(cumul.margeCommerciale)}</td>
            <td className="p-2 text-right tabular-nums">{pourcent(cumul.tauxMarge)}</td>
            <td className={`p-2 text-right tabular-nums ${signe(cumul.valeurAjoutee)}`}>{francs(cumul.valeurAjoutee)}</td>
            <td className="p-2 text-right tabular-nums">{francs(cumul.chargesPersonnel)}</td>
            <td className={`p-2 text-right tabular-nums ${signe(cumul.ebe)}`}>{francs(cumul.ebe)}</td>
            <td className={`p-2 text-right tabular-nums ${signe(cumul.resultatNet)}`}>{francs(cumul.resultatNet)}</td>
            {avecBudget && <td className="p-2 text-right tabular-nums text-muted-foreground">{cumul.budgetResultat === null ? "—" : francs(cumul.budgetResultat)}</td>}
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
