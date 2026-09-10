"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Plus, Save, Check, Trash2, ShieldCheck, Users } from "lucide-react";
import { apiGet, apiSend, ApiClientError } from "@/lib/api-client";
import {
  ACTIONS,
  ACTION_LABELS,
  RESSOURCES,
  PERMISSION_TOTALE,
  isAccesTotal,
  toMatrice,
  fromMatrice,
  type Action,
  type MatricePermissions,
} from "@/lib/permissions";
import type { RolePermission } from "@/db/schema";
import { useCan } from "@/hooks/useCan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";

type Role = {
  id: number;
  nom: string;
  description: string | null;
  permissions: RolePermission[];
  nbUtilisateurs: number;
};

export function RolesClient() {
  const can = useCan();
  const editable = can("roles", "update");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Role | null>(null);

  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["roles", "detail"],
    queryFn: () => apiGet<Role[]>("/api/roles"),
  });

  const roles = query.data ?? [];
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;

  const del = useMutation({
    mutationFn: (id: number) => apiSend(`/api/roles/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      setToDelete(null);
      setSelectedId(null);
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full rounded-md border px-3 py-2.5 text-left transition ${
                selected?.id === r.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">
                  {r.nom}
                </span>
                {isAccesTotal(r.permissions) && (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                )}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {r.nbUtilisateurs} utilisateur
                {r.nbUtilisateurs > 1 ? "s" : ""}
              </span>
            </button>
          ))}

          {can("roles", "create") && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" />
              Nouveau rôle
            </Button>
          )}
        </div>

        {selected ? (
          <MatricePanel
            key={selected.id}
            role={selected}
            editable={editable}
            onDelete={
              can("roles", "delete") ? () => setToDelete(selected) : undefined
            }
          />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aucun rôle défini.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Nouveau rôle"
      >
        <RoleCreateForm onDone={() => setCreating(false)} />
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer ce rôle ?"
        description={`Le rôle « ${toDelete?.nom} » sera définitivement supprimé.`}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
      />
    </>
  );
}

function MatricePanel({
  role,
  editable,
  onDelete,
}: {
  role: Role;
  editable: boolean;
  onDelete?: () => void;
}) {
  const qc = useQueryClient();
  const { update: refreshSession } = useSession();
  const [matrice, setMatrice] = useState<MatricePermissions>(() =>
    toMatrice(role.permissions),
  );
  const [accesTotal, setAccesTotal] = useState(() =>
    isAccesTotal(role.permissions),
  );
  const [description, setDescription] = useState(role.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Pas de resynchronisation depuis `role` : le panneau est remonté à chaque
  // changement de rôle (`key={selected.id}`), et après enregistrement l'état
  // local est déjà celui qui vient d'être écrit.
  const modifie = useMemo(() => {
    const actuel = JSON.stringify(
      accesTotal ? PERMISSION_TOTALE : fromMatrice(matrice),
    );
    return (
      actuel !== JSON.stringify(role.permissions) ||
      description !== (role.description ?? "")
    );
  }, [matrice, accesTotal, description, role]);

  function toggle(ressource: string, action: Action) {
    setMatrice((m) => {
      const actuelles = m[ressource] ?? [];
      return {
        ...m,
        [ressource]: actuelles.includes(action)
          ? actuelles.filter((a) => a !== action)
          : [...actuelles, action],
      };
    });
  }

  function toggleLigne(ressource: string) {
    setMatrice((m) => ({
      ...m,
      [ressource]: (m[ressource] ?? []).length === ACTIONS.length ? [] : [...ACTIONS],
    }));
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiSend(`/api/roles/${role.id}`, "PATCH", {
        description: description || null,
        permissions: accesTotal ? PERMISSION_TOTALE : fromMatrice(matrice),
      }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      // Force la relecture des permissions du jeton : l'administrateur voit
      // immédiatement l'effet sur sa propre navigation.
      await refreshSession();
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {role.nom}
              {accesTotal && (
                <Badge className="border-primary/20 bg-primary/10 text-primary">
                  Accès total
                </Badge>
              )}
            </p>
            <div className="mt-2 max-w-md">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                readOnly={!editable}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex. Chef de mission"
              />
            </div>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label="Supprimer le rôle"
              className="shrink-0 text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <label className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={accesTotal}
            disabled={!editable}
            onChange={(e) => setAccesTotal(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span>
            <span className="font-medium text-foreground">
              Accès total (super-administrateur)
            </span>
            <span className="block text-xs text-muted-foreground">
              Toutes les ressources, y compris celles ajoutées plus tard. La
              matrice ci-dessous est alors ignorée.
            </span>
          </span>
        </label>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3 text-left font-medium">Ressource</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="pb-2 px-2 text-center font-medium">
                    {ACTION_LABELS[a]}
                  </th>
                ))}
                <th className="pb-2 pl-2 text-right font-medium">Tout</th>
              </tr>
            </thead>
            <tbody>
              {RESSOURCES.map((r) => {
                const cochees = matrice[r.cle] ?? [];
                return (
                  <tr
                    key={r.cle}
                    className={`border-b border-border/50 ${accesTotal ? "opacity-40" : ""}`}
                  >
                    <td className="py-2 pr-3">
                      <p className="font-medium text-foreground">{r.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    </td>
                    {ACTIONS.map((a) => (
                      <td key={a} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${r.label} — ${ACTION_LABELS[a]}`}
                          checked={accesTotal || cochees.includes(a)}
                          disabled={!editable || accesTotal}
                          onChange={() => toggle(r.cle, a)}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                      </td>
                    ))}
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        disabled={!editable || accesTotal}
                        onClick={() => toggleLigne(r.cle)}
                        className="text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        {cochees.length === ACTIONS.length ? "Aucun" : "Tout"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {editable && (
          <div className="mt-4 flex items-center justify-end gap-3">
            {modifie && !saved && (
              <span className="text-xs text-muted-foreground">
                Modifications non enregistrées
              </span>
            )}
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !modifie}
              variant={saved ? "outline" : "primary"}
            >
              {mutation.isPending ? (
                <Spinner />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Enregistré" : "Enregistrer"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoleCreateForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiSend("/api/roles", "POST", {
        nom: nom.trim().toUpperCase(),
        description: description || null,
        permissions: [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      onDone();
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
      <div>
        <Label htmlFor="nom">Nom du rôle *</Label>
        <Input
          id="nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="CHEF_MISSION"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Majuscules, chiffres et tirets bas.
        </p>
      </div>
      <div>
        <Label htmlFor="desc">Description</Label>
        <Input
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex. Supervise les dossiers d'un portefeuille"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Le rôle est créé sans aucun droit : vous les accordez ensuite dans la
        matrice.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !nom.trim()}>
          {mutation.isPending && <Spinner />}
          Créer
        </Button>
      </div>
    </div>
  );
}
