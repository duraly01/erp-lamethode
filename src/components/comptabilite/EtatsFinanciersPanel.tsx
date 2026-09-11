"use client";

import { useState } from "react";
import { AlertTriangle, Info, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatMontantAffichage } from "@/lib/comptable/money";
import {
  useEtatsFinanciers,
  type EtatsFinanciers,
  type EtatsSmt,
  type Exercice,
  type LigneBilan,
  type LigneResultat,
  type LigneSmt,
} from "./data";

/**
 * Bilan et compte de résultat SYSCOHADA révisé.
 *
 * L'état affiche aussi ce qui pourrait le rendre faux — déséquilibre, comptes
 * hors rattachement, rattachements en attente de validation. Une liasse dont
 * les réserves sont enterrées dans la documentation est une liasse qu'on dépose
 * sans les avoir lues.
 */

/**
 * Montant d'une ligne d'état.
 *
 * Un poste à zéro se présente vide : une colonne de « 0 » ne se lit pas. Un
 * **total de section**, lui, s'imprime toujours, fût-il nul — un « TOTAL
 * GÉNÉRAL » laissé blanc se lit comme un défaut d'affichage, pas comme un
 * résultat.
 */
function montant(centimes: number, toujours = false) {
  if (centimes === 0 && !toujours) return "";
  return formatMontantAffichage(centimes);
}

/** La colonne N-1 distingue « rien » de « on ne sait pas ». */
function montantPrecedent(centimes: number | null, toujours = false) {
  if (centimes === null)
    return <span className="text-muted-foreground">—</span>;
  return montant(centimes, toujours);
}

/**
 * Un total de section, par opposition à une rubrique intermédiaire.
 *
 * La distinction est déjà portée par les postes : « TOTAL ACTIF IMMOBILISÉ »
 * n'a pas de niveau de titre, « Immobilisations incorporelles » est de niveau 1
 * et totalise son propre détail. Faire imprimer zéro à toutes les rubriques
 * couvrirait l'état de zéros et noierait les totaux qu'on y cherche.
 */
function estTotalDeSection(l: { estTotal: boolean; niveau?: 1 | 2 }) {
  return l.estTotal && l.niveau === undefined;
}

function Chargement() {
  return (
    <Card className="p-10 text-center">
      <Spinner />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Avertissements
// ---------------------------------------------------------------------------

function Alerte({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Reserves({ etats }: { etats: EtatsFinanciers }) {
  const [ouvert, setOuvert] = useState(false);
  const { rattachementsAConfirmer: reserves } = etats;
  if (reserves.length === 0) return null;

  const Fleche = ouvert ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 text-sm">
      <button
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="flex w-full items-center gap-2 p-3 text-left text-warning"
      >
        <Fleche className="h-4 w-4 shrink-0" />
        <Info className="h-4 w-4 shrink-0" />
        <span>
          {reserves.length} rattachement{reserves.length > 1 ? "s" : ""} de
          comptes reste{reserves.length > 1 ? "nt" : ""}
          {" à faire valider par l'expert-comptable avant tout dépôt."}
        </span>
      </button>

      {ouvert && (
        <ul className="space-y-2 border-t border-warning/30 p-3 text-muted-foreground">
          {reserves.map((r) => (
            <li key={r.prefixe}>
              <span className="font-mono text-xs text-foreground">
                {r.prefixe}
              </span>{" "}
              → <span className="font-mono text-xs">{r.poste}</span> · {r.motif}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bilan
// ---------------------------------------------------------------------------

/** Les rubriques de niveau 1 et les totaux se lisent de loin. */
function classeLigne(l: { estTotal: boolean; niveau?: 1 | 2 }) {
  if (l.estTotal) return "border-t border-border bg-muted/30 font-semibold";
  if (l.niveau === 1) return "font-medium";
  return "";
}

function SectionBilan({
  titre,
  lignes,
  avecColonnesBrutes,
  libellePrecedent,
}: {
  titre: string;
  lignes: LigneBilan[];
  avecColonnesBrutes: boolean;
  libellePrecedent: string;
}) {
  const colonnes = avecColonnesBrutes ? 6 : 4;

  return (
    <Card className="overflow-x-auto">
      <h3 className="border-b border-border p-3 font-semibold">{titre}</h3>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left font-medium">Réf.</th>
            <th className="p-2 text-left font-medium">Poste</th>
            {avecColonnesBrutes && (
              <>
                <th className="p-2 text-right font-medium">Brut</th>
                <th className="p-2 text-right font-medium">Amort./dépréc.</th>
              </>
            )}
            <th className="p-2 text-right font-medium">Net</th>
            <th className="p-2 text-right font-medium">{libellePrecedent}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 && (
            <tr>
              <td
                colSpan={colonnes}
                className="p-8 text-center text-sm text-muted-foreground"
              >
                Aucun poste.
              </td>
            </tr>
          )}
          {lignes.map((l) => {
            const toujours = estTotalDeSection(l);
            return (
              <tr key={l.code} className={classeLigne(l)}>
                <td className="p-2 font-mono text-xs text-muted-foreground">
                  {l.code}
                </td>
                <td className={l.niveau === 2 ? "p-2 pl-6" : "p-2"}>
                  {l.libelle}
                </td>
                {avecColonnesBrutes && (
                  <>
                    <td className="p-2 text-right tabular-nums">
                      {montant(l.brut, toujours)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {montant(l.amortissements, toujours)}
                    </td>
                  </>
                )}
                <td className="p-2 text-right tabular-nums">
                  {montant(l.net, toujours)}
                </td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">
                  {montantPrecedent(l.netPrecedent, toujours)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Compte de résultat
// ---------------------------------------------------------------------------

function SectionResultat({
  lignes,
  libellePrecedent,
}: {
  lignes: LigneResultat[];
  libellePrecedent: string;
}) {
  return (
    <Card className="overflow-x-auto">
      <h3 className="border-b border-border p-3 font-semibold">
        Compte de résultat
      </h3>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left font-medium">Réf.</th>
            <th className="p-2 text-left font-medium">Poste</th>
            <th className="p-2 text-right font-medium">Exercice</th>
            <th className="p-2 text-right font-medium">{libellePrecedent}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr
              key={l.code}
              className={
                l.estTotal
                  ? "border-t border-border bg-muted/30 font-semibold uppercase"
                  : ""
              }
            >
              <td className="p-2 font-mono text-xs text-muted-foreground">
                {l.code}
              </td>
              <td className={l.estTotal ? "p-2" : "p-2 pl-6"}>{l.libelle}</td>
              <td className="p-2 text-right tabular-nums">
                {montant(l.montant, l.estTotal)}
              </td>
              <td className="p-2 text-right tabular-nums text-muted-foreground">
                {montantPrecedent(l.montantPrecedent, l.estTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Système minimal de trésorerie
// ---------------------------------------------------------------------------

function SectionSmt({
  titre,
  lignes,
  precedentes,
  libellePrecedent,
}: {
  titre: string;
  lignes: LigneSmt[];
  precedentes: LigneSmt[] | null;
  libellePrecedent: string;
}) {
  const parCode = new Map((precedentes ?? []).map((l) => [l.code, l.montant]));

  return (
    <Card className="overflow-x-auto">
      <h3 className="border-b border-border p-3 font-semibold">{titre}</h3>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left font-medium">Réf.</th>
            <th className="p-2 text-left font-medium">Poste</th>
            <th className="p-2 text-right font-medium">Exercice</th>
            <th className="p-2 text-right font-medium">{libellePrecedent}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr
              key={l.code}
              className={
                l.estTotal ? "border-t border-border bg-muted/30 font-semibold" : ""
              }
            >
              <td className="p-2 font-mono text-xs text-muted-foreground">
                {l.code}
              </td>
              <td className={l.estTotal ? "p-2" : "p-2 pl-6"}>{l.libelle}</td>
              <td className="p-2 text-right tabular-nums">
                {montant(l.montant, l.estTotal)}
              </td>
              <td className="p-2 text-right tabular-nums text-muted-foreground">
                {montantPrecedent(
                  precedentes ? (parCode.get(l.code) ?? 0) : null,
                  l.estTotal,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function EtatsSmtVue({
  smt,
  precedent,
  libellePrecedent,
}: {
  smt: EtatsSmt;
  precedent: EtatsSmt | null;
  libellePrecedent: string;
}) {
  return (
    <>
      <SectionSmt
        titre="Bilan — Actif"
        lignes={smt.actif}
        precedentes={precedent?.actif ?? null}
        libellePrecedent={libellePrecedent}
      />
      <SectionSmt
        titre="Bilan — Passif"
        lignes={smt.passif}
        precedentes={precedent?.passif ?? null}
        libellePrecedent={libellePrecedent}
      />
      <SectionSmt
        titre="Recettes"
        lignes={smt.recettes}
        precedentes={precedent?.recettes ?? null}
        libellePrecedent={libellePrecedent}
      />
      <SectionSmt
        titre="Dépenses"
        lignes={smt.depenses}
        precedentes={precedent?.depenses ?? null}
        libellePrecedent={libellePrecedent}
      />
      <Card className="flex items-center justify-between p-3 text-base font-semibold">
        <span>
          {smt.resultatNet >= 0 ? "Excédent de l'exercice" : "Déficit de l'exercice"}
        </span>
        <span className="tabular-nums">
          {formatMontantAffichage(Math.abs(smt.resultatNet))}
        </span>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------

export function EtatsFinanciersPanel({ exercice }: { exercice: Exercice }) {
  const { data, isLoading } = useEtatsFinanciers(exercice.id);

  // La présentation suit le système de l'exercice : c'est celle qui se dépose.
  // L'autre reste consultable, pour comparer ou préparer un changement de
  // système.
  const [presentation, setPresentation] = useState<"NORMAL" | "SMT">(
    exercice.systeme,
  );

  if (isLoading) return <Chargement />;
  if (!data) return null;

  const libellePrecedent = data.exercicePrecedent
    ? data.exercicePrecedent.libelle
    : "Exercice précédent";

  const autre = presentation === "SMT" ? "NORMAL" : "SMT";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          Présentation du{" "}
          <span className="font-medium text-foreground">
            {presentation === "SMT"
              ? "système minimal de trésorerie"
              : "système normal"}
          </span>
          {presentation !== exercice.systeme &&
            " — l'exercice est déclaré dans l'autre système ; c'est celui-ci qui se dépose."}
        </p>
        <button
          onClick={() => setPresentation(autre)}
          className="text-primary underline-offset-2 hover:underline"
        >
          Voir la présentation du{" "}
          {autre === "SMT" ? "système minimal" : "système normal"}
        </button>
      </div>

      {!data.bilan.equilibre && (
        <Alerte>
          Le bilan n&apos;est pas équilibré : l&apos;actif dépasse le passif de{" "}
          {formatMontantAffichage(data.bilan.ecart)}. Chaque écriture étant
          équilibrée à sa validation, l&apos;écart vient du rattachement des
          comptes aux postes, et non de la saisie.
        </Alerte>
      )}

      {data.comptesNonRattaches.length > 0 && (
        <Alerte>
          <span className="block">
            {data.comptesNonRattaches.length} compte
            {data.comptesNonRattaches.length > 1 ? "s" : ""} mouvementé
            {data.comptesNonRattaches.length > 1
              ? "s ne figurent"
              : " ne figure"}{" "}
            dans aucun poste, et{" "}
            {data.comptesNonRattaches.length > 1 ? "sont" : "est"} donc absent
            {data.comptesNonRattaches.length > 1 ? "s" : ""} des états :
          </span>
          <span className="mt-1 block font-mono text-xs">
            {data.comptesNonRattaches
              .map(
                (c) =>
                  `${c.compteNumero} ${c.compteLibelle} (${formatMontantAffichage(c.solde)})`,
              )
              .join(" · ")}
          </span>
        </Alerte>
      )}

      <Reserves etats={data} />

      {!data.exercicePrecedent && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Aucun exercice précédent n&apos;est rattaché : la colonne de
          comparaison reste vide. Elle se remplira d&apos;elle-même à
          l&apos;exercice suivant.
        </p>
      )}

      {presentation === "SMT" ? (
        <EtatsSmtVue
          smt={data.smt}
          precedent={data.smtPrecedent}
          libellePrecedent={libellePrecedent}
        />
      ) : (
        <>
          <SectionBilan
            titre="Bilan — Actif"
            lignes={data.bilan.actif}
            avecColonnesBrutes
            libellePrecedent={libellePrecedent}
          />
          <SectionBilan
            titre="Bilan — Passif"
            lignes={data.bilan.passif}
            avecColonnesBrutes={false}
            libellePrecedent={libellePrecedent}
          />
          <SectionResultat
            lignes={data.resultat.lignes}
            libellePrecedent={libellePrecedent}
          />
        </>
      )}
    </div>
  );
}
