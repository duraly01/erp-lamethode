"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Sparkles, FileSpreadsheet } from "lucide-react";
import { apiGet, apiSend, qs, type Paginated } from "@/lib/api-client";
import {
  DECLARATION_TYPES,
  STATUT_DECLARATION_LABELS,
  formatDateFR,
  type DeclarationType,
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
import {
  DeclarationForm,
  type DeclarationRow,
} from "@/components/declarations/DeclarationForm";
import { GenerateDialog } from "@/components/declarations/GenerateDialog";

const col = createColumnHelper<DeclarationRow>();

export function DeclarationsClient() {
  const qc = useQueryClient();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [periode, setPeriode] = useState("");
  const [type, setType] = useState("");
  const [statut, setStatut] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [formOpen, setFormOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [editing, setEditing] = useState<DeclarationRow | undefined>();
  const [toDelete, setToDelete] = useState<DeclarationRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setPeriode(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["declarations", { page, periode, type, statut, order }],
    queryFn: () =>
      apiGet<Paginated<DeclarationRow>>(
        `/api/declarations${qs({
          page,
          pageSize: 12,
          periode,
          type,
          statut,
          sort: "dateEcheance",
          order,
        })}`,
      ),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiSend(`/api/declarations/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["declarations"] });
      setToDelete(null);
    },
  });

  const columns = useMemo(
    () => [
      col.accessor("contribuableNom", {
        header: "Contribuable",
        cell: (c) => <span className="font-medium text-foreground">{c.getValue()}</span>,
      }),
      col.accessor("type", {
        header: "Type",
        cell: (c) => (
          <span className="text-sm">
            {DECLARATION_TYPES[c.getValue()]?.label ?? c.getValue()}
          </span>
        ),
      }),
      col.accessor("periode", {
        header: "Période",
        cell: (c) => <span className="text-sm text-muted-foreground">{c.getValue()}</span>,
      }),
      col.accessor("dateEcheance", {
        header: () => (
          <button
            onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            Échéance {order === "asc" ? "↑" : "↓"}
          </button>
        ),
        cell: (c) => (
          <span className="text-sm text-muted-foreground">{formatDateFR(c.getValue())}</span>
        ),
      }),
      col.accessor("montant", {
        header: "Montant",
        cell: (c) => <span className="text-sm tabular-nums">{formatFCFA(c.getValue())}</span>,
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
            {can("declarations", "update") && (
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
            {can("declarations", "delete") && (
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
    [order, can],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filtrer par période (ex : 2026-03)…"
        />
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="lg:w-44"
        >
          <option value="">Tous les types</option>
          {(Object.keys(DECLARATION_TYPES) as DeclarationType[]).map((t) => (
            <option key={t} value={t}>
              {DECLARATION_TYPES[t].label}
            </option>
          ))}
        </Select>
        <Select
          value={statut}
          onChange={(e) => {
            setStatut(e.target.value);
            setPage(1);
          }}
          className="lg:w-40"
        >
          <option value="">Tous statuts</option>
          {(Object.keys(STATUT_DECLARATION_LABELS) as StatutDeclaration[]).map((s) => (
            <option key={s} value={s}>
              {STATUT_DECLARATION_LABELS[s]}
            </option>
          ))}
        </Select>
        <a
          href={`/api/exports/declarations${qs({ periode, type, statut })}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </a>
        {can("declarations", "create") && (
          <>
            <Button variant="outline" onClick={() => setGenOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Générer
            </Button>
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nouvelle
            </Button>
          </>
        )}
      </div>

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        isLoading={query.isLoading}
        emptyLabel="Aucune déclaration trouvée."
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
        title={editing ? "Modifier la déclaration" : "Nouvelle déclaration"}
      >
        <DeclarationForm initial={editing} onDone={() => setFormOpen(false)} />
      </Dialog>

      <Dialog
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Générer les échéances"
        description="Crée automatiquement les déclarations standards d'une période."
      >
        <GenerateDialog onDone={() => setGenOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer cette déclaration ?"
        description={`${toDelete ? DECLARATION_TYPES[toDelete.type]?.label : ""} · ${toDelete?.periode ?? ""}`}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
      />
    </>
  );
}
