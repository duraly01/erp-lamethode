"use client";

import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiSend, ApiClientError } from "@/lib/api-client";
import { STATUT_ACF_LABELS, type StatutAcf } from "@/lib/constants";
import { useContribuableOptions } from "@/hooks/useContribuableOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export type AcfRow = {
  id: number;
  contribuableId: number;
  contribuableNom?: string;
  objet: string;
  dateDemande: string;
  statut: StatutAcf;
  motifBlocage: string | null;
  solution: string | null;
  dateResolution: string | null;
  dateValidite: string | null;
  responsable: string | null;
};

type FormValues = {
  contribuableId: string;
  objet: string;
  dateDemande: string;
  statut: StatutAcf;
  motifBlocage: string;
  solution: string;
  dateResolution: string;
  dateValidite: string;
  responsable: string;
};

export function AcfForm({
  initial,
  onDone,
}: {
  initial?: AcfRow;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial;
  const { data: options } = useContribuableOptions();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      contribuableId: initial?.contribuableId?.toString() ?? "",
      objet: initial?.objet ?? "",
      dateDemande: initial?.dateDemande ?? "",
      statut: initial?.statut ?? "EN_COURS",
      motifBlocage: initial?.motifBlocage ?? "",
      solution: initial?.solution ?? "",
      dateResolution: initial?.dateResolution ?? "",
      dateValidite: initial?.dateValidite ?? "",
      responsable: initial?.responsable ?? "",
    },
  });

  const statut = watch("statut");

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        contribuableId: Number(v.contribuableId),
        objet: v.objet,
        dateDemande: v.dateDemande,
        statut: v.statut,
        motifBlocage: v.motifBlocage || null,
        solution: v.solution || null,
        dateResolution: v.dateResolution || null,
        dateValidite: v.dateValidite || null,
        responsable: v.responsable || null,
      };
      return editing
        ? apiSend(`/api/acf/${initial!.id}`, "PATCH", body)
        : apiSend("/api/acf", "POST", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["acf"] });
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
        <Label htmlFor="contribuableId">Contribuable *</Label>
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

      <div>
        <Label htmlFor="objet">Objet *</Label>
        <Input
          id="objet"
          {...register("objet", { required: "Objet requis." })}
          placeholder="ex : ACF pour appel d'offres"
        />
        {errors.objet && (
          <p className="mt-1 text-xs text-danger">{errors.objet.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="dateDemande">Date de demande *</Label>
          <Input
            id="dateDemande"
            type="date"
            {...register("dateDemande", { required: "Date requise." })}
          />
          {errors.dateDemande && (
            <p className="mt-1 text-xs text-danger">
              {errors.dateDemande.message}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="statut">Statut</Label>
          <Select id="statut" {...register("statut")}>
            {(Object.keys(STATUT_ACF_LABELS) as StatutAcf[]).map((s) => (
              <option key={s} value={s}>
                {STATUT_ACF_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="responsable">Responsable</Label>
          <Input id="responsable" {...register("responsable")} />
        </div>
        <div>
          <Label htmlFor="dateValidite">Date de validité</Label>
          <Input id="dateValidite" type="date" {...register("dateValidite")} />
        </div>
      </div>

      {statut === "BLOQUE" && (
        <div>
          <Label htmlFor="motifBlocage">Motif du blocage</Label>
          <Input id="motifBlocage" {...register("motifBlocage")} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="solution">Solution</Label>
          <Input id="solution" {...register("solution")} />
        </div>
        <div>
          <Label htmlFor="dateResolution">Date de résolution</Label>
          <Input
            id="dateResolution"
            type="date"
            {...register("dateResolution")}
          />
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
