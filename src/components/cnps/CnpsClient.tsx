"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { apiGet, apiSend, qs, type Paginated } from "@/lib/api-client";
import {
  STATUT_DECLARATION_LABELS,
  formatDateFR,
  type StatutDeclaration,
} from "@/lib/constants";
import { formatFCFA } from "@/lib/utils";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { DeclarationStatusBadge } from "@/components/ui/status-badge";
import { CnpsForm, type CnpsRow } from "@/components/cnps/CnpsForm";

const col = createColumnHelper<CnpsRow>();

export function CnpsClient() {
  const qc = useQueryClient();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [periode, setPeriode] = useState("");
  const [statut, setStatut] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CnpsRow | undefined>();
  const [toDelete, setToDelete] = useState<CnpsRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setPeriode(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["cnps", { page, periode, statut }],
    queryFn: () =>
      apiGet<Paginated<CnpsRow>>(
        `/api/cnps${qs({ page, pageSize: 12, periode, statut, sort: "dateEcheance", order: "desc" })}`,
      ),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiSend(`/api/cnps/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cnps"] });
      setToDelete(null);
    },
  });

  const columns = useMemo(
    () => [
      col.accessor("contribuableNom", {
        header: "Employeur",
        cell: (c) => <span className="font-medium text-foreground">{c.getValue()}</span>,
      }),
      col.accessor("periode", {
        header: "Période",
        cell: (c) => <span className="text-sm">{c.getValue()}</span>,
      }),
      col.accessor("masseSalariale", {
        header: "Masse salariale",
        cell: (c) => <span className="text-sm tabular-nums">{formatFCFA(c.getValue())}</span>,
      }),
      col.accessor("montantEmployeur", {
        header: "Part employeur",
        cell: (c) => <span className="text-sm tabular-nums">{formatFCFA(c.getValue())}</span>,
      }),
      col.accessor("dateEcheance", {
        header: "Échéance",
        cell: (c) => (
          <span className="text-sm text-muted-foreground">{formatDateFR(c.getValue())}</span>
        ),
      }),
      col.accessor("statut", {
        header: "Statut",
        cell: (c) => (
          <DeclarationStatusBadge
            statut={c.getValue()}
            dateEcheance={c.row.original.dateEcheance}
          />
        ),
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) => (
          <div className="flex justify-end gap-1">
            {can("cnps", "update") && (
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
            {can("cnps", "delete") && (
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
          placeholder="Filtrer par période (ex : 2026-01)…"
        />
        <Select
          value={statut}
          onChange={(e) => {
            setStatut(e.target.value);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">Tous statuts</option>
          {(Object.keys(STATUT_DECLARATION_LABELS) as StatutDeclaration[]).map((s) => (
            <option key={s} value={s}>
              {STATUT_DECLARATION_LABELS[s]}
            </option>
          ))}
        </Select>
        {can("cnps", "create") && (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvelle cotisation
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        isLoading={query.isLoading}
        emptyLabel="Aucune cotisation CNPS trouvée."
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
        title={editing ? "Modifier la cotisation" : "Nouvelle cotisation CNPS"}
      >
        <CnpsForm initial={editing} onDone={() => setFormOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer cette cotisation ?"
        description={`${toDelete?.contribuableNom ?? ""} · ${toDelete?.periode ?? ""}`}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
      />
    </>
  );
}
