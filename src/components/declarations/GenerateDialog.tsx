"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { apiSend, ApiClientError } from "@/lib/api-client";
import { MOIS_LABELS } from "@/lib/constants";
import { useContribuableOptions } from "@/hooks/useContribuableOptions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Mode = "ANNUELLE" | "TRIMESTRIELLE" | "MENSUELLE";

export function GenerateDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: options } = useContribuableOptions();
  const [contribuableId, setContribuableId] = useState("");
  const [mode, setMode] = useState<Mode>("MENSUELLE");
  const [annee, setAnnee] = useState("2026");
  const [mois, setMois] = useState("1");
  const [trimestre, setTrimestre] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const base = {
        mode,
        contribuableId: Number(contribuableId),
        annee: Number(annee),
      };
      const body =
        mode === "ANNUELLE"
          ? base
          : mode === "TRIMESTRIELLE"
            ? { ...base, trimestre: Number(trimestre) }
            : { ...base, mois: Number(mois) };
      return apiSend<{ created: number }>(
        "/api/declarations/generate",
        "POST",
        body,
      );
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["declarations"] });
      setResult(res?.created ?? 0);
      setError(null);
    },
    onError: (err) =>
      setError(err instanceof ApiClientError ? err.message : "Erreur."),
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {result !== null && (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {result} déclaration(s) générée(s). Les échéances existantes ne sont
          pas dupliquées.
        </p>
      )}

      <div>
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Périodicité</Label>
          <Select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="MENSUELLE">Mensuelle</option>
            <option value="TRIMESTRIELLE">Trimestrielle (IGS)</option>
            <option value="ANNUELLE">Annuelle</option>
          </Select>
        </div>
        <div>
          <Label>Année</Label>
          <Input
            type="number"
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
          />
        </div>
      </div>

      {mode === "MENSUELLE" && (
        <div>
          <Label>Mois</Label>
          <Select value={mois} onChange={(e) => setMois(e.target.value)}>
            {MOIS_LABELS.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </div>
      )}

      {mode === "TRIMESTRIELLE" && (
        <div>
          <Label>Trimestre</Label>
          <Select
            value={trimestre}
            onChange={(e) => setTrimestre(e.target.value)}
          >
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                T{t}
              </option>
            ))}
          </Select>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Les obligations générées dépendent du régime du contribuable : forfait
        trimestriel pour l&apos;IGS, déclarations classiques pour le Réel.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Fermer
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!contribuableId || mutation.isPending}
        >
          {mutation.isPending ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          Générer
        </Button>
      </div>
    </div>
  );
}
