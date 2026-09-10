"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiSend, messageErreur } from "@/lib/api-client";
import {
  parseMontant,
  formatMontant,
  formatMontantAffichage,
} from "@/lib/comptable/money";
import type { Compte, EcritureComplete, Journal, Tiers } from "./data";

/**
 * Saisie d'une écriture comptable.
 *
 * Le total des deux colonnes et l'écart sont recalculés à chaque frappe : le
 * comptable voit l'équilibre se faire, plutôt que de découvrir un refus à la
 * validation. Le calcul emploie `parseMontant`, donc la même arithmétique en
 * centimes entiers que le serveur — ce qui s'affiche ici est ce qui sera
 * contrôlé là-bas.
 */

type LigneSaisie = {
  compteId: string;
  tiersId: string;
  libelle: string;
  debit: string;
  credit: string;
};

/** Une erreur renvoyée par le moteur comptable, éventuellement située. */
type ErreurEcriture = { code: string; message: string; ligne?: number };

const LIGNE_VIDE: LigneSaisie = {
  compteId: "",
  tiersId: "",
  libelle: "",
  debit: "",
  credit: "",
};

/**
 * Remet un montant venu de PostgreSQL sous la forme où il a été tapé.
 *
 * La base renvoie « 500000.00 » : une colonne à zéro se présente vide — sans
 * quoi il faudrait effacer « 0.00 » avant chaque saisie — et le franc CFA ne
 * se subdivisant pas, la décimale nulle disparaît elle aussi.
 */
function pourSaisie(montant: string) {
  const centimes = parseMontant(montant);
  if (centimes === 0) return "";
  return centimes % 100 === 0 ? String(centimes / 100) : formatMontant(centimes);
}

function auMoinsDeuxLignes(lignes: LigneSaisie[]): LigneSaisie[] {
  const complet = [...lignes];
  while (complet.length < 2) complet.push({ ...LIGNE_VIDE });
  return complet;
}

export function EcritureForm({
  exerciceId,
  comptes,
  journaux,
  tiers,
  bornes,
  ecriture,
  onEnregistre,
  onAnnule,
}: {
  exerciceId: number;
  comptes: Compte[];
  journaux: Journal[];
  tiers: Tiers[];
  /** Bornes de l'exercice, pour cadrer le sélecteur de date. */
  bornes: { dateDebut: string; dateFin: string };
  ecriture?: EcritureComplete;
  onEnregistre: () => void;
  onAnnule: () => void;
}) {
  const [journalId, setJournalId] = useState(
    String(ecriture?.journalId ?? journaux[0]?.id ?? ""),
  );
  const [dateEcriture, setDateEcriture] = useState(
    ecriture?.dateEcriture ?? bornes.dateDebut,
  );
  const [libelle, setLibelle] = useState(ecriture?.libelle ?? "");
  const [reference, setReference] = useState(ecriture?.reference ?? "");
  const [lignes, setLignes] = useState<LigneSaisie[]>(
    auMoinsDeuxLignes(
      (ecriture?.lignes ?? []).map((l) => ({
        compteId: String(l.compteId),
        tiersId: l.tiersId ? String(l.tiersId) : "",
        libelle: l.libelle ?? "",
        debit: pourSaisie(l.debit),
        credit: pourSaisie(l.credit),
      })),
    ),
  );

  const [enCours, setEnCours] = useState(false);
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<ErreurEcriture[]>([]);

  // « Enregistrer et valider » se fait en deux temps : le brouillon est créé,
  // puis validé. Si la validation échoue — un compte collectif sans tiers, par
  // exemple — le brouillon existe bel et bien, et l'utilisateur corrige sans
  // quitter la modale. On retient donc son identifiant : sans cela, chaque
  // nouvelle tentative créerait un brouillon de plus.
  const [idCree, setIdCree] = useState<number | null>(null);

  const comptesParId = useMemo(
    () => new Map(comptes.map((c) => [c.id, c])),
    [comptes],
  );

  const totaux = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lignes) {
      try {
        debit += parseMontant(l.debit);
        credit += parseMontant(l.credit);
      } catch {
        // Une saisie en cours de frappe n'est pas encore un nombre : on
        // l'ignore pour le total plutôt que de faire clignoter une erreur.
      }
    }
    return { debit, credit, ecart: debit - credit };
  }, [lignes]);

  function modifierLigne(index: number, champ: keyof LigneSaisie, valeur: string) {
    setLignes((prec) =>
      prec.map((l, i) => {
        if (i !== index) return l;
        const suivant = { ...l, [champ]: valeur };
        // Saisir dans une colonne vide l'autre : une ligne porte un sens et un
        // seul, autant l'imposer dès la frappe plutôt qu'au refus du serveur.
        if (champ === "debit" && valeur !== "") suivant.credit = "";
        if (champ === "credit" && valeur !== "") suivant.debit = "";
        return suivant;
      }),
    );
  }

  function corpsRequete() {
    return {
      exerciceId,
      journalId: Number(journalId),
      dateEcriture,
      libelle,
      reference: reference || null,
      lignes: lignes
        // Une ligne entièrement vide est un reliquat de saisie, pas une
        // omission : on la retire silencieusement.
        .filter((l) => l.compteId || l.debit || l.credit || l.libelle)
        .map((l) => ({
          compteId: Number(l.compteId),
          tiersId: l.tiersId ? Number(l.tiersId) : null,
          libelle: l.libelle || null,
          debit: l.debit || null,
          credit: l.credit || null,
        })),
    };
  }

  function afficherErreur(e: unknown) {
    const details = (e as { details?: unknown })?.details;
    const estErreurComptable =
      Array.isArray(details) &&
      details.every((d) => d && typeof (d as ErreurEcriture).code === "string");

    if (estErreurComptable) {
      setErreurs(details as ErreurEcriture[]);
      setErreurGenerale(null);
    } else {
      setErreurs([]);
      setErreurGenerale(messageErreur(e));
    }
  }

  async function enregistrer(puisValider: boolean) {
    setEnCours(true);
    setErreurGenerale(null);
    setErreurs([]);
    try {
      const corps = corpsRequete();
      let id = ecriture?.id ?? idCree ?? undefined;

      if (id) {
        const { exerciceId: _ignore, ...maj } = corps;
        void _ignore;
        await apiSend(`/api/comptabilite/ecritures/${id}`, "PATCH", maj);
      } else {
        const cree = await apiSend<{ id: number }>(
          "/api/comptabilite/ecritures",
          "POST",
          corps,
        );
        id = cree!.id;
        setIdCree(id);
      }

      if (puisValider) {
        await apiSend(`/api/comptabilite/ecritures/${id}/valider`, "POST");
      }
      onEnregistre();
    } catch (e) {
      afficherErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  const erreursDeLigne = (index: number) =>
    erreurs.filter((e) => e.ligne === index);
  const erreursGenerales = erreurs.filter((e) => e.ligne === undefined);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="journal">Journal</Label>
          <Select
            id="journal"
            value={journalId}
            onChange={(e) => setJournalId(e.target.value)}
          >
            {journaux.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} — {j.libelle}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={dateEcriture}
            min={bornes.dateDebut}
            max={bornes.dateFin}
            onChange={(e) => setDateEcriture(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="libelle">Libellé</Label>
          <Input
            id="libelle"
            value={libelle}
            placeholder="Facture fournisseur AF-2026-041"
            onChange={(e) => setLibelle(e.target.value)}
          />
        </div>
        <div className="sm:col-span-4">
          <Label htmlFor="reference">Référence (facultatif)</Label>
          <Input
            id="reference"
            value={reference}
            placeholder="N° de facture, de chèque, de bordereau…"
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left font-medium">Compte</th>
              <th className="p-2 text-left font-medium">Tiers</th>
              <th className="p-2 text-left font-medium">Libellé</th>
              <th className="p-2 text-right font-medium">Débit</th>
              <th className="p-2 text-right font-medium">Crédit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, i) => {
              const compte = comptesParId.get(Number(ligne.compteId));
              const erreursIci = erreursDeLigne(i);
              return (
                <tr
                  key={i}
                  className={
                    erreursIci.length ? "bg-danger/5" : "border-t border-border"
                  }
                >
                  <td className="p-1.5 align-top">
                    <Select
                      aria-label={`Compte ligne ${i + 1}`}
                      value={ligne.compteId}
                      onChange={(e) =>
                        modifierLigne(i, "compteId", e.target.value)
                      }
                      className="h-9 min-w-52 text-xs"
                    >
                      <option value="">— choisir —</option>
                      {comptes
                        .filter((c) => c.actif)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} — {c.libelle}
                          </option>
                        ))}
                    </Select>
                    {erreursIci.map((e, k) => (
                      <p
                        key={k}
                        className="mt-1 flex items-start gap-1 text-xs text-danger"
                      >
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        {e.message}
                      </p>
                    ))}
                  </td>
                  <td className="p-1.5 align-top">
                    <Select
                      aria-label={`Tiers ligne ${i + 1}`}
                      value={ligne.tiersId}
                      // Le tiers n'a de sens que sur un compte collectif ; il
                      // y est en revanche obligatoire.
                      disabled={!compte?.collectif}
                      onChange={(e) => modifierLigne(i, "tiersId", e.target.value)}
                      className="h-9 min-w-40 text-xs"
                    >
                      <option value="">{compte?.collectif ? "— requis —" : "—"}</option>
                      {tiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} — {t.raisonSociale}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1.5 align-top">
                    <Input
                      aria-label={`Libellé ligne ${i + 1}`}
                      value={ligne.libelle}
                      onChange={(e) => modifierLigne(i, "libelle", e.target.value)}
                      className="h-9 min-w-40 text-xs"
                    />
                  </td>
                  <td className="p-1.5 align-top">
                    <Input
                      aria-label={`Débit ligne ${i + 1}`}
                      value={ligne.debit}
                      inputMode="decimal"
                      onChange={(e) => modifierLigne(i, "debit", e.target.value)}
                      className="h-9 w-32 text-right text-xs"
                    />
                  </td>
                  <td className="p-1.5 align-top">
                    <Input
                      aria-label={`Crédit ligne ${i + 1}`}
                      value={ligne.credit}
                      inputMode="decimal"
                      onChange={(e) => modifierLigne(i, "credit", e.target.value)}
                      className="h-9 w-32 text-right text-xs"
                    />
                  </td>
                  <td className="p-1.5 align-top">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Supprimer la ligne ${i + 1}`}
                      onClick={() =>
                        setLignes((p) =>
                          auMoinsDeuxLignes(p.filter((_, k) => k !== i)),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-border bg-muted/30 text-xs font-semibold">
            <tr>
              <td className="p-2" colSpan={3}>
                Totaux
              </td>
              <td className="p-2 text-right">
                {formatMontantAffichage(totaux.debit)}
              </td>
              <td className="p-2 text-right">
                {formatMontantAffichage(totaux.credit)}
              </td>
              <td />
            </tr>
            <tr>
              <td className="p-2 pt-0" colSpan={3}>
                Écart
              </td>
              <td
                className={`p-2 pt-0 text-right ${
                  totaux.ecart === 0 ? "text-success" : "text-danger"
                }`}
                colSpan={2}
              >
                {totaux.ecart === 0
                  ? "équilibrée"
                  : formatMontantAffichage(totaux.ecart)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setLignes((p) => [...p, { ...LIGNE_VIDE }])}
      >
        <Plus className="h-4 w-4" />
        Ajouter une ligne
      </Button>

      {(erreurGenerale || erreursGenerales.length > 0) && (
        <div className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erreurGenerale && <p>{erreurGenerale}</p>}
          {erreursGenerales.map((e, i) => (
            <p key={i}>{e.message}</p>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onAnnule} disabled={enCours}>
          Annuler
        </Button>
        <Button
          variant="subtle"
          onClick={() => enregistrer(false)}
          disabled={enCours}
        >
          {enCours ? <Spinner /> : null}
          Enregistrer le brouillon
        </Button>
        <Button
          onClick={() => enregistrer(true)}
          // Le bouton reste actif même déséquilibrée : le refus vient du
          // serveur, seul juge, et son message est plus précis qu'une
          // désactivation muette.
          disabled={enCours}
        >
          {enCours ? <Spinner /> : null}
          Enregistrer et valider
        </Button>
      </div>
    </div>
  );
}
