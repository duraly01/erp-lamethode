"use client";

import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export type UserRow = {
  id: number;
  nom: string;
  email: string;
  telephone: string | null;
  roleId: number | null;
  roleNom: string | null;
  actif: boolean;
};

type RoleOption = { id: number; nom: string; description: string | null };

type FormValues = {
  nom: string;
  email: string;
  telephone: string;
  password: string;
  roleId: string;
  actif: boolean;
};

export function UserForm({
  initial,
  onDone,
}: {
  initial?: UserRow;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial;
  const { data: roles } = useQuery({
    queryKey: ["roles"],
    staleTime: 300_000,
    queryFn: () => apiGet<RoleOption[]>("/api/roles"),
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      nom: initial?.nom ?? "",
      email: initial?.email ?? "",
      telephone: initial?.telephone ?? "",
      password: "",
      roleId: initial?.roleId?.toString() ?? "",
      actif: initial?.actif ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const base = {
        nom: v.nom,
        email: v.email,
        telephone: v.telephone || null,
        roleId: v.roleId ? Number(v.roleId) : null,
        actif: v.actif,
      };
      if (editing) {
        const body = v.password
          ? { ...base, password: v.password }
          : base;
        return apiSend(`/api/users/${initial!.id}`, "PATCH", body);
      }
      return apiSend("/api/users", "POST", { ...base, password: v.password });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
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
        <Label htmlFor="nom">Nom complet *</Label>
        <Input id="nom" {...register("nom", { required: "Nom requis." })} />
        {errors.nom && (
          <p className="mt-1 text-xs text-danger">{errors.nom.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          {...register("email", { required: "Email requis." })}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-danger">{errors.email.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="telephone">Téléphone (SMS / WhatsApp)</Label>
        <Input
          id="telephone"
          {...register("telephone")}
          placeholder="+237 6 99 59 19 75"
        />
      </div>

      <div>
        <Label htmlFor="password">
          Mot de passe {editing ? "(laisser vide pour ne pas changer)" : "*"}
        </Label>
        <Input
          id="password"
          type="password"
          {...register("password", {
            required: editing ? false : "Mot de passe requis (8 car. min).",
            minLength: { value: 8, message: "8 caractères minimum." },
          })}
          placeholder="••••••••"
        />
        {errors.password && (
          <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="roleId">Rôle</Label>
        <Select id="roleId" {...register("roleId")}>
          <option value="">— Aucun —</option>
          {roles?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nom}
              {r.description ? ` — ${r.description}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          {...register("actif")}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        Compte actif
      </label>

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
