"use client";

import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiSend, ApiClientError } from "@/lib/api-client";
import {
  DECLARATION_TYPES,
  STATUT_DECLARATION_LABELS,
  PERIODICITE_LABELS,
  PERIODE_PLACEHOLDERS,
  type DeclarationType,
  type StatutDeclaration,
} from "@/lib/constants";
import { useContribuableOptions } from "@/hooks/useContribuableOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export type DeclarationRow = {
  id: number;
  contribuableId: number;
  contribuableNom?: string;
  type: DeclarationType;
  periode: string;
  dateEcheance: string;
  statut: StatutDeclaration;
  datePaiement: string | null;
  montant: string | null;
  notes: string | null;
};

type FormValues = {
  contribuableId: string;
  type: DeclarationType;
  periode: string;
  dateEcheance: string;
  statut: StatutDeclaration;
  montant: string;
  datePaiement: string;
  notes: string;
};

export function DeclarationForm({
  initial,
  onDone,
}: {
  initial?: DeclarationRow;
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
      type: initial?.type ?? "TVA",
      periode: initial?.periode ?? "",
      dateEcheance: initial?.dateEcheance ?? "",
      statut: initial?.statut ?? "A_FAIRE",
      montant: initial?.montant ?? "",
      datePaiement: initial?.datePaiement ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const type = watch("type");
  const periodicite = DECLARATION_TYPES[type]?.periodicite ?? "MENSUELLE";

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        contribuableId: Number(v.contribuableId),
        type: v.type,
        periodicite,
        periode: v.periode,
        dateEcheance: v.dateEcheance,
        statut: v.statut,
        montant: v.montant === "" ? null : Number(v.montant),
        datePaiement: v.datePaiement === "" ? null : v.datePaiement,
        notes: v.notes,
      };
      return editing
        ? apiSend(`/api/declarations/${initial!.id}`, "PATCH", body)
        : apiSend("/api/declarations", "POST", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["declarations"] });
      onDone();
    },
    onError: (err) =>
      setError("root", {
        message:
          err instanceof ApiClientError
            ? err.message
            : "Une erreur est survenue.",
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select id="type" {...register("type")}>
            {(Object.keys(DECLARATION_TYPES) as DeclarationType[]).map((t) => (
              <option key={t} value={t}>
                {DECLARATION_TYPES[t].label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {PERIODICITE_LABELS[periodicite]}
          </p>
        </div>
        <div>
          <Label htmlFor="periode">Période *</Label>
          <Input
            id="periode"
            {...register("periode", { required: "Période requise." })}
            placeholder={PERIODE_PLACEHOLDERS[periodicite]}
          />
          {errors.periode && (
            <p className="mt-1 text-xs text-danger">{errors.periode.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="dateEcheance">Date d&apos;échéance *</Label>
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
        <div>
          <Label htmlFor="montant">Montant (FCFA)</Label>
          <Input id="montant" type="number" step="1" {...register("montant")} />
        </div>
        <div>
          <Label htmlFor="datePaiement">Date de paiement</Label>
          <Input id="datePaiement" type="date" {...register("datePaiement")} />
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          rows={2}
          {...register("notes")}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
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
