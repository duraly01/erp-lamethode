"use client";

import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiSend, ApiClientError } from "@/lib/api-client";
import {
  STATUT_DECLARATION_LABELS,
  type StatutDeclaration,
} from "@/lib/constants";
import { useContribuableOptions } from "@/hooks/useContribuableOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export type CnpsRow = {
  id: number;
  contribuableId: number;
  contribuableNom?: string;
  periode: string;
  masseSalariale: string | null;
  taux: string | null;
  montantEmployeur: string | null;
  montantSalarie: string | null;
  dateEcheance: string;
  statut: StatutDeclaration;
};

type FormValues = {
  contribuableId: string;
  periode: string;
  masseSalariale: string;
  taux: string;
  montantEmployeur: string;
  montantSalarie: string;
  dateEcheance: string;
  statut: StatutDeclaration;
};

export function CnpsForm({
  initial,
  onDone,
}: {
  initial?: CnpsRow;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial;
  const { data: options } = useContribuableOptions();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      contribuableId: initial?.contribuableId?.toString() ?? "",
      periode: initial?.periode ?? "",
      masseSalariale: initial?.masseSalariale ?? "",
      taux: initial?.taux ?? "8.40",
      montantEmployeur: initial?.montantEmployeur ?? "",
      montantSalarie: initial?.montantSalarie ?? "",
      dateEcheance: initial?.dateEcheance ?? "",
      statut: initial?.statut ?? "A_FAIRE",
    },
  });

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const num = (s: string) => (s === "" ? null : Number(s));
      const body = {
        contribuableId: Number(v.contribuableId),
        periode: v.periode,
        masseSalariale: num(v.masseSalariale),
        taux: num(v.taux),
        montantEmployeur: num(v.montantEmployeur),
        montantSalarie: num(v.montantSalarie),
        dateEcheance: v.dateEcheance,
        statut: v.statut,
      };
      return editing
        ? apiSend(`/api/cnps/${initial!.id}`, "PATCH", body)
        : apiSend("/api/cnps", "POST", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cnps"] });
      onDone();
    },
    onError: (err) =>
      setError("root", {
        message:
          err instanceof ApiClientError ? err.message : "Une erreur est survenue.",
      }),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
      {errors.root && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors.root.message}
        </p>
      )}

      <div>
        <Label htmlFor="contribuableId">Contribuable (employeur) *</Label>
        <Select
          id="contribuableId"
          {...register("contribuableId", { required: "Contribuable requis." })}
          disabled={editing}
        >
          <option value="">— Sélectionner —</option>
          {options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nom}
            </option>
          ))}
        </Select>
        {errors.contribuableId && (
          <p className="mt-1 text-xs text-danger">
            {errors.contribuableId.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="periode">Période *</Label>
          <Input
            id="periode"
            {...register("periode", { required: "Période requise." })}
            placeholder="2026-01"
          />
          {errors.periode && (
            <p className="mt-1 text-xs text-danger">{errors.periode.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="dateEcheance">Échéance *</Label>
          <Input
            id="dateEcheance"
            type="date"
            {...register("dateEcheance", { required: "Échéance requise." })}
          />
          {errors.dateEcheance && (
            <p className="mt-1 text-xs text-danger">
              {errors.dateEcheance.message}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="masseSalariale">Masse salariale (FCFA)</Label>
          <Input
            id="masseSalariale"
            type="number"
            {...register("masseSalariale")}
          />
        </div>
        <div>
          <Label htmlFor="taux">Taux (%)</Label>
          <Input id="taux" type="number" step="0.01" {...register("taux")} />
        </div>
        <div>
          <Label htmlFor="montantEmployeur">Part employeur (FCFA)</Label>
          <Input
            id="montantEmployeur"
            type="number"
            {...register("montantEmployeur")}
          />
        </div>
        <div>
          <Label htmlFor="montantSalarie">Part salarié (FCFA)</Label>
          <Input
            id="montantSalarie"
            type="number"
            {...register("montantSalarie")}
          />
        </div>
        <div>
          <Label htmlFor="statut">Statut</Label>
          <Select id="statut" {...register("statut")}>
            {(Object.keys(STATUT_DECLARATION_LABELS) as StatutDeclaration[]).map(
              (s) => (
                <option key={s} value={s}>
                  {STATUT_DECLARATION_LABELS[s]}
                </option>
              ),
            )}
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {editing ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </form>
  );
}
