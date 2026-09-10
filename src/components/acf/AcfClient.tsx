"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { apiGet, apiSend, qs, type Paginated } from "@/lib/api-client";
import { STATUT_ACF_LABELS, formatDateFR, type StatutAcf } from "@/lib/constants";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { AcfStatusBadge } from "@/components/ui/status-badge";
import { AcfForm, type AcfRow } from "@/components/acf/AcfForm";

const col = createColumnHelper<AcfRow>();

export function AcfClient() {
  const qc = useQueryClient();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AcfRow | undefined>();
  const [toDelete, setToDelete] = useState<AcfRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["acf", { page, q, statut }],
    queryFn: () =>
      apiGet<Paginated<AcfRow>>(
        `/api/acf${qs({ page, pageSize: 12, q, statut, sort: "dateDemande", order: "desc" })}`,
      ),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiSend(`/api/acf/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["acf"] });
      setToDelete(null);
    },
  });

  const columns = useMemo(
    () => [
      col.accessor("contribuableNom", {
        header: "Contribuable",
        cell: (c) => <span className="font-medium text-foreground">{c.getValue()}</span>,
      }),
      col.accessor("objet", {
        header: "Objet",
        cell: (c) => <span className="text-sm">{c.getValue()}</span>,
      }),
      col.accessor("dateDemande", {
        header: "Demande",
        cell: (c) => (
          <span className="text-sm text-muted-foreground">{formatDateFR(c.getValue())}</span>
        ),
      }),
      col.accessor("statut", {
        header: "Statut",
        cell: (c) => <AcfStatusBadge statut={c.getValue()} />,
      }),
      col.accessor("responsable", {
        header: "Responsable",
        cell: (c) => (
          <span className="text-sm text-muted-foreground">{c.getValue() ?? "—"}</span>
        ),
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) => (
          <div className="flex justify-end gap-1">
            {can("acf", "update") && (
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
            {can("acf", "delete") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setToDelete(c.row.original)}
                aria-label="Supprimer"
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-4 w-4" />
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
          placeholder="Rechercher (objet, responsable)…"
        />
        <Select
          value={statut}
          onChange={(e) => {
            setStatut(e.target.value);
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">Tous statuts</option>
          {(Object.keys(STATUT_ACF_LABELS) as StatutAcf[]).map((s) => (
            <option key={s} value={s}>
              {STATUT_ACF_LABELS[s]}
            </option>
          ))}
        </Select>
        {can("acf", "create") && (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvelle demande
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        isLoading={query.isLoading}
        emptyLabel="Aucune demande d'ACF trouvée."
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
        title={editing ? "Modifier la demande ACF" : "Nouvelle demande ACF"}
      >
        <AcfForm initial={editing} onDone={() => setFormOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer cette demande ?"
        description={toDelete?.objet}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
      />
    </>
  );
}
