"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, UserX } from "lucide-react";
import { apiGet, apiSend, qs, type Paginated } from "@/lib/api-client";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { ActifBadge } from "@/components/ui/status-badge";
import { UserForm, type UserRow } from "@/components/users/UserForm";

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-primary/10 text-primary border-primary/20",
  MANAGER: "bg-info/10 text-info border-info/20",
  COLLABORATEUR: "bg-warning/10 text-warning border-warning/20",
  LECTURE: "bg-muted text-muted-foreground border-border",
};

const col = createColumnHelper<UserRow>();

export function UsersClient() {
  const qc = useQueryClient();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | undefined>();
  const [toDisable, setToDisable] = useState<UserRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["users", { page, q }],
    queryFn: () =>
      apiGet<Paginated<UserRow>>(
        `/api/users${qs({ page, pageSize: 12, q, sort: "nom", order: "asc" })}`,
      ),
  });

  const disable = useMutation({
    mutationFn: (id: number) => apiSend(`/api/users/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setToDisable(null);
    },
  });

  const columns = useMemo(
    () => [
      col.accessor("nom", {
        header: "Nom",
        cell: (c) => (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {c
                .getValue()
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <span className="font-medium text-foreground">{c.getValue()}</span>
          </div>
        ),
      }),
      col.accessor("email", {
        header: "Email",
        cell: (c) => <span className="text-sm text-muted-foreground">{c.getValue()}</span>,
      }),
      col.accessor("roleNom", {
        header: "Rôle",
        cell: (c) =>
          c.getValue() ? (
            <Badge className={ROLE_COLORS[c.getValue()!] ?? ""}>{c.getValue()}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      }),
      col.accessor("actif", {
        header: "Statut",
        cell: (c) => <ActifBadge actif={c.getValue()} />,
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) => (
          <div className="flex justify-end gap-1">
            {can("users", "update") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditing(c.row.original);
                  setFormOpen(true);
                }}
                aria-label="Modifier"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can("users", "delete") && c.row.original.actif && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setToDisable(c.row.original)}
                aria-label="Désactiver"
                className="text-danger hover:bg-danger/10"
              >
                <UserX className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      }),
    ],
    [can],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher (nom, email)…"
        />
        {can("users", "create") && (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvel utilisateur
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        isLoading={query.isLoading}
        emptyLabel="Aucun utilisateur."
        pagination={
          query.data
            ? {
                page: query.data.page,
                pageSize: query.data.pageSize,
                total: query.data.total,
                totalPages: query.data.totalPages,
                onPage: setPage,
              }
            : undefined
        }
      />

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
      >
        <UserForm initial={editing} onDone={() => setFormOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={!!toDisable}
        onClose={() => setToDisable(null)}
        title="Désactiver ce compte ?"
        description={`${toDisable?.nom ?? ""} ne pourra plus se connecter.`}
        confirmLabel="Désactiver"
        onConfirm={() => toDisable && disable.mutate(toDisable.id)}
        loading={disable.isPending}
      />
    </>
  );
}
