"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Check, AlertTriangle } from "lucide-react";
import { apiSend, ApiClientError } from "@/lib/api-client";
import {
  IGS_BAREME_DEFAUT,
  IGS_CA_PLAFOND,
  IGS_ABATTEMENT_CGA,
  classesACompleter,
  type IgsBareme,
} from "@/lib/igs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Le paramètre stocké en base peut être vide ou mal formé : on retombe alors
 *  sur le barème par défaut plutôt que de casser l'écran. */
function toBareme(valeur: unknown): IgsBareme {
  if (!Array.isArray(valeur) || valeur.length === 0) return IGS_BAREME_DEFAUT;
  return valeur as IgsBareme;
}

const fcfa = (n: number) => n.toLocaleString("fr-FR");

/**
 * Éditeur dédié du barème IGS. Remplace l'éditeur JSON générique : le barème
 * change à chaque loi de finances et doit rester saisissable par le cabinet.
 */
export function IgsBaremePanel({
  valeur,
  editable,
}: {
  valeur: unknown;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [bareme, setBareme] = useState<IgsBareme>(() => toBareme(valeur));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const aCompleter = classesACompleter(bareme);

  function setChamp(
    classe: number,
    champ: "caMin" | "caMax" | "montant",
    brut: string,
  ) {
    const n = brut === "" ? 0 : Number(brut);
    if (Number.isNaN(n) || n < 0) return;
    setBareme((b) =>
      b.map((c) => (c.classe === classe ? { ...c, [champ]: n } : c)),
    );
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiSend("/api/parametres/igs_bareme", "PATCH", { valeur: bareme }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parametres"] });
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) =>
      setError(err instanceof ApiClientError ? err.message : "Erreur."),
  });

  return (
    <Card>
      <CardContent className="pt-5">
        <div>
          <p className="text-sm font-semibold text-foreground">Barème IGS</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Impôt Général Synthétique — forfait annuel par classe de chiffre
            d&apos;affaires, payé par quarts trimestriels. Adhérent d&apos;un
            Centre de Gestion Agréé : abattement de{" "}
            {IGS_ABATTEMENT_CGA * 100} %. Au-delà de{" "}
            {fcfa(IGS_CA_PLAFOND)} FCFA de chiffre d&apos;affaires, le
            contribuable bascule au régime du Réel.
          </p>
        </div>

        {aCompleter.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Classe{aCompleter.length > 1 ? "s" : ""} {aCompleter.join(", ")} à
              compléter. Tant qu&apos;une classe reste à zéro, aucun montant
              d&apos;IGS n&apos;est calculé automatiquement pour les
              contribuables qui en relèvent.
            </span>
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Classe</th>
                <th className="pb-2 pr-3 font-medium">CA min (FCFA)</th>
                <th className="pb-2 pr-3 font-medium">CA max (FCFA)</th>
                <th className="pb-2 font-medium">Montant annuel (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              {bareme.map((c) => (
                <tr key={c.classe} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-medium text-foreground">
                    {c.classe}
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      value={c.caMin}
                      readOnly={!editable}
                      onChange={(e) =>
                        setChamp(c.classe, "caMin", e.target.value)
                      }
                      className="h-9"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      value={c.caMax ?? ""}
                      readOnly={!editable}
                      onChange={(e) =>
                        setChamp(c.classe, "caMax", e.target.value)
                      }
                      className="h-9"
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      type="number"
                      min={0}
                      value={c.montant}
                      readOnly={!editable}
                      onChange={(e) =>
                        setChamp(c.classe, "montant", e.target.value)
                      }
                      className="h-9"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        {editable && (
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              variant={saved ? "outline" : "primary"}
            >
              {mutation.isPending ? (
                <Spinner />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Enregistré" : "Enregistrer le barème"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
