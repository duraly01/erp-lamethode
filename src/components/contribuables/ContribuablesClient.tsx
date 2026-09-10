"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUpDown,
  Building2,
  FileSpreadsheet,
  FileText,
  Upload,
} from "lucide-react";
import { apiGet, apiSend, qs, type Paginated } from "@/lib/api-client";
import { REGIME_FISCAL_LABELS, type RegimeFiscal } from "@/lib/constants";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { RegimeBadge, ActifBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  ContribuableForm,
  type ContribuableRow,
} from "@/components/contribuables/ContribuableForm";
import { ImportDialog } from "@/components/contribuables/ImportDialog";

const col = createColumnHelper<ContribuableRow>();

export function ContribuablesClient() {
  const qc = useQueryClient();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [regime, setRegime] = useState("");
  const [actif, setActif] = useState("");
  const [sort, setSort] = useState("nom");
  const [order, setOrder] = useState<"asc" | "desc">("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContribuableRow | undefined>();
  const [toDelete, setToDelete] = useState<ContribuableRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["contribuables", { page, q, regime, actif, sort, order }],
    queryFn: () =>
      apiGet<Paginated<ContribuableRow>>(
        `/api/contribuables${qs({
          page,
          pageSize: 10,
          q,
          regimeFiscal: regime,
          actif,
          sort,
          order,
        })}`,
      ),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiSend(`/api/contribuables/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contribuables"] });
      setToDelete(null);
    },
  });

  function toggleSort(field: string) {
    if (sort === field) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(field);
      setOrder("asc");
    }
  }

  const columns = useMemo(
    () => [
      col.accessor("nom", {
        header: () => (
          <SortHeader label="Nom" active={sort === "nom"} order={order} onClick={() => toggleSort("nom")} />
        ),
        cell: (c) => (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{c.getValue()}</p>
              <p className="text-xs text-muted-foreground">
                {c.row.original.niu ?? "NIU —"}
              </p>
            </div>
          </div>
        ),
      }),
      col.accessor("regimeFiscal", {
        header: () => (
          <SortHeader label="Régime" active={sort === "regimeFiscal"} order={order} onClick={() => toggleSort("regimeFiscal")} />
        ),
        cell: (c) => (
          <RegimeBadge
            regime={c.getValue()}
            igsClasse={c.row.original.igsClasse}
          />
        ),
      }),
      col.accessor("centreImpots", {
        header: "Centre des impôts",
        cell: (c) => (
          <span className="text-sm text-muted-foreground">{c.getValue() ?? "—"}</span>
        ),
      }),
      col.accessor("responsableDossier", {
        header: "Responsable",
        cell: (c) => (
          <span className="text-sm text-muted-foreground">{c.getValue() ?? "—"}</span>
        ),
      }),
      col.accessor("facturationAuto", {
        header: "Facturation",
        cell: (c) => <FacturationBadge auto={c.getValue()} />,
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
            <a
              href={`/api/exports/contribuable/${c.row.original.id}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Fiche PDF"
              title="Télécharger la fiche PDF"
            >
              <FileText className="h-4 w-4" />
            </a>
            {can("contribuables", "update") && (
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
            {can("contribuables", "delete") && (
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
    [sort, order, can],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher un contribuable (nom, NIU, email)…"
        />
        <Select
          value={regime}
          onChange={(e) => {
            setRegime(e.target.value);
            setPage(1);
          }}
          className="sm:w-48"
        >
          <option value="">Tous les régimes</option>
          {(Object.keys(REGIME_FISCAL_LABELS) as RegimeFiscal[]).map((r) => (
            <option key={r} value={r}>
              {REGIME_FISCAL_LABELS[r]}
            </option>
          ))}
        </Select>
        <Select
          value={actif}
          onChange={(e) => {
            setActif(e.target.value);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">Tous</option>
          <option value="true">Actifs</option>
          <option value="false">Inactifs</option>
        </Select>
        <a
          href="/api/exports/contribuables"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </a>
        {can("contribuables", "update") && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Importer
          </Button>
        )}
        {can("contribuables", "create") && (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouveau
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        isLoading={query.isLoading}
        emptyLabel="Aucun contribuable trouvé."
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
        title={editing ? "Modifier le contribuable" : "Nouveau contribuable"}
      >
        <ContribuableForm initial={editing} onDone={() => setFormOpen(false)} />
      </Dialog>

      {/* Large : l'aperçu montre le détail des modifications, fiche par fiche. */}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importer depuis Excel"
        className="max-w-3xl"
      >
        <ImportDialog onDone={() => setImportOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer ce contribuable ?"
        description={`« ${toDelete?.nom} » sera archivé (suppression réversible).`}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
      />
    </>
  );
}

function SortHeader({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
      {label}
      <ArrowUpDown className={`h-3.5 w-3.5 ${active ? "text-primary" : "opacity-40"}`} />
      {active && <span className="text-xs text-primary">{order === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

/**
 * Mode de facturation du contribuable. « Automatique » signifie que la facture
 * mensuelle part d'elle-même à la date fixée dans les Paramètres ; « à la
 * demande » qu'elle n'est créée que sur décision.
 */
function FacturationBadge({ auto }: { auto: boolean }) {
  return auto ? (
    <Badge className="border-primary/20 bg-primary/10 text-primary">
      Automatique
    </Badge>
  ) : (
    <Badge className="border-border bg-muted text-muted-foreground">
      À la demande
    </Badge>
  );
}
