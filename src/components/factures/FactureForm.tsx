"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { apiGet, apiSend, qs, messageErreur } from "@/lib/api-client";
import {
  CATEGORIE_LIGNE_LABELS,
  calculeTotaux,
  formatFcfa,
  tauxTvaParDefaut,
  type CategorieLigne,
} from "@/lib/facturation";
import { jourCalendaire } from "@/lib/facturation";
import { useContribuableOptions } from "@/hooks/useContribuableOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

type Ligne = {
  categorie: CategorieLigne;
  libelle: string;
  montantHt: number;
  tauxTva: number;
};

const CATEGORIES = Object.keys(CATEGORIE_LIGNE_LABELS) as CategorieLigne[];

// Le gabarit des colonnes est répété littéralement à l'en-tête et aux lignes :
// Tailwind ne génère que les classes qu'il lit telles quelles dans le source,
// une classe composée dans une variable ne produirait aucun style.

/** Période du mois précédent : c'est celle que l'on facture le plus souvent. */
function periodePrecedente(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function FactureForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: options } = useContribuableOptions();
  const [contribuableId, setContribuableId] = useState("");
  const [periode, setPeriode] = useState(periodePrecedente);
  const [dateEmission, setDateEmission] = useState(() =>
    jourCalendaire(new Date()),
  );
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Propositions du serveur : honoraires convenus + impôts de la période.
  const proposition = useQuery({
    queryKey: ["facture-proposition", contribuableId, periode],
    enabled: !!contribuableId && /^\d{4}-\d{2}$/.test(periode),
    queryFn: () =>
      apiGet<{ lignes: Ligne[] }>(
        `/api/factures/proposition${qs({ contribuableId, periode })}`,
      ),
  });

  // Adoption des propositions du serveur pendant le rendu plutôt que dans un
  // effet : cela évite un rendu intermédiaire avec les lignes du contribuable
  // précédent. Les saisies de l'utilisateur ne sont écrasées que lorsque le
  // couple contribuable/période change réellement.
  const cleProposition = `${contribuableId}|${periode}`;
  const [cleAdoptee, setCleAdoptee] = useState<string | null>(null);
  if (proposition.data && cleAdoptee !== cleProposition) {
    setCleAdoptee(cleProposition);
    setLignes(
      proposition.data.lignes.map((l) => ({
        ...l,
        tauxTva: l.tauxTva ?? tauxTvaParDefaut(l.categorie),
      })),
    );
  }

  const totaux = calculeTotaux(lignes);
  const lignesSansDesignation = lignes.filter((l) => !l.libelle.trim()).length;

  function majLigne(index: number, patch: Partial<Ligne>) {
    setLignes((ls) =>
      ls.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiSend("/api/factures", "POST", {
        contribuableId: Number(contribuableId),
        periode,
        dateEmission,
        lignes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factures"] });
      onDone();
    },
    onError: (err) => setError(messageErreur(err)),
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <Label>Contribuable *</Label>
          <Select
            value={contribuableId}
            onChange={(e) => setContribuableId(e.target.value)}
          >
            <option value="">— Sélectionner —</option>
            {options?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nom}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="periode">Période *</Label>
          <Input
            id="periode"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            placeholder="2026-01"
          />
        </div>
        <div>
          <Label htmlFor="dateEmission">Date d&apos;émission *</Label>
          <Input
            id="dateEmission"
            type="date"
            value={dateEmission}
            onChange={(e) => setDateEmission(e.target.value)}
          />
        </div>
      </div>

      {proposition.isFetching && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Chargement des honoraires et des échéances de la période…
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Lignes de facture</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLignes((ls) => [
                ...ls,
                {
                  categorie: "FRAIS",
                  libelle: "",
                  montantHt: 0,
                  tauxTva: tauxTvaParDefaut("FRAIS"),
                },
              ])
            }
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>

        {lignes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Sélectionnez un contribuable : ses honoraires et les impôts de la
            période seront repris automatiquement.
          </p>
        ) : (
          <div className="space-y-2">
            {/* En-têtes : sans eux, deux cases numériques restent sans nom. */}
            <div className="hidden px-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[120px_1fr_130px_74px_40px]">
              <span>Nature</span>
              <span>Désignation</span>
              <span className="text-right">Montant HT (FCFA)</span>
              <span className="text-right">TVA</span>
              <span />
            </div>

            {lignes.map((l, i) => (
              <div
                key={i}
                className="grid grid-cols-1 items-center gap-2 rounded-md border border-border p-2 sm:grid-cols-[120px_1fr_130px_74px_40px]"
              >
                <Select
                  value={l.categorie}
                  onChange={(e) => {
                    const categorie = e.target.value as CategorieLigne;
                    majLigne(i, {
                      categorie,
                      tauxTva: tauxTvaParDefaut(categorie),
                    });
                  }}
                  className="h-9"
                  aria-label="Nature de la ligne"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIE_LIGNE_LABELS[c]}
                    </option>
                  ))}
                </Select>
                <Input
                  value={l.libelle}
                  onChange={(e) => majLigne(i, { libelle: e.target.value })}
                  placeholder="Désignation imprimée sur la facture"
                  className="h-9"
                  aria-label="Désignation"
                />
                <Input
                  type="number"
                  step={100}
                  value={l.montantHt}
                  onChange={(e) =>
                    majLigne(i, { montantHt: Number(e.target.value) || 0 })
                  }
                  className="h-9 text-right"
                  aria-label="Montant hors taxes en FCFA"
                />
                {/* La TVA découle de la nature de la ligne : elle s'affiche,
                    elle ne se saisit pas. */}
                <span className="px-1 text-right text-sm text-muted-foreground">
                  {l.tauxTva > 0
                    ? `${l.tauxTva.toLocaleString("fr-FR", {
                        maximumFractionDigits: 2,
                      })} %`
                    : "—"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Supprimer la ligne"
                  onClick={() =>
                    setLignes((ls) => ls.filter((_, j) => j !== i))
                  }
                  className="text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total HT</span>
          <span>{formatFcfa(totaux.totalHt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">TVA</span>
          <span>{formatFcfa(totaux.totalTva)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold text-foreground">
          <span>Net à payer</span>
          <span>{formatFcfa(totaux.totalTtc)}</span>
        </div>
      </div>

      {lignesSansDesignation > 0 && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {lignesSansDesignation === 1
            ? "Une ligne n'a pas de désignation."
            : `${lignesSansDesignation} lignes n'ont pas de désignation.`}{" "}
          La désignation est le texte imprimé sur la facture : elle est
          obligatoire.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        La facture est créée en brouillon : relisez les montants avant de
        l&apos;émettre et de l&apos;envoyer au client.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={
            !contribuableId ||
            lignes.length === 0 ||
            lignesSansDesignation > 0 ||
            mutation.isPending
          }
        >
          {mutation.isPending && <Spinner />}
          Créer le brouillon
        </Button>
      </div>
    </div>
  );
}
