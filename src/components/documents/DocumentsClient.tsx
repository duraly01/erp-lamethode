"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, FileText, Download } from "lucide-react";
import { apiGet, apiSend, qs, type Paginated } from "@/lib/api-client";
import { formatDateFR } from "@/lib/constants";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { DocumentForm } from "@/components/documents/DocumentForm";

type DocumentRow = {
  id: number;
  contribuableNom?: string;
  nomFichier: string;
  categorie: string | null;
  tags: string[];
  taille: number | null;
  createdAt: string;
};

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

const col = createColumnHelper<DocumentRow>();

export function DocumentsClient() {
  const qc = useQueryClient();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["documents", { page, q }],
    queryFn: () =>
      apiGet<Paginated<DocumentRow>>(
        `/api/documents${qs({ page, pageSize: 12, q, sort: "createdAt", order: "desc" })}`,
      ),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiSend(`/api/documents/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      setToDelete(null);
    },
  });

  const columns = useMemo(
    () => [
      col.accessor("nomFichier", {
        header: "Document",
        cell: (c) => (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText className="h-4 w-4" />
            </span>
            <span className="font-medium text-foreground">{c.getValue()}</span>
          </div>
        ),
      }),
      col.accessor("contribuableNom", {
        header: "Contribuable",
        cell: (c) => <span className="text-sm">{c.getValue()}</span>,
      }),
      col.accessor("categorie", {
        header: "Catégorie",
        cell: (c) =>
          c.getValue() ? (
            <Badge className="border-border bg-muted text-muted-foreground">
              {c.getValue()}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      }),
      col.accessor("taille", {
        header: "Taille",
        cell: (c) => (
          <span className="text-sm text-muted-foreground">{formatSize(c.getValue())}</span>
        ),
      }),
      col.accessor("createdAt", {
        header: "Ajouté le",
        cell: (c) => (
          <span className="text-sm text-muted-foreground">{formatDateFR(c.getValue())}</span>
        ),
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) => (
          <div className="flex justify-end gap-1">
            <a
              href={`/api/documents/${c.row.original.id}/download`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Télécharger"
              title="Télécharger"
            >
              <Download className="h-4 w-4" />
            </a>
            {can("documents", "delete") && (
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
          placeholder="Rechercher un document…"
        />
        {can("documents", "create") && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        isLoading={query.isLoading}
        emptyLabel="Aucun document."
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
        title="Ajouter un document"
      >
        <DocumentForm onDone={() => setFormOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer ce document ?"
        description={toDelete?.nomFichier}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
      />
    </>
  );
}
