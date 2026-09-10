"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/ui/pagination";

export type DataTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (p: number) => void;
};

type DataTableProps<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  isLoading?: boolean;
  emptyLabel?: string;
  pagination?: DataTablePagination;
};

/**
 * Fonds opaques équivalents aux teintes semi-transparentes des lignes.
 *
 * La colonne d'actions est épinglée à droite : le contenu de la ligne défile
 * derrière elle. Un fond translucide laisserait donc voir le texte en transit.
 * `color-mix` reproduit exactement le rendu de `bg-muted/40` et `bg-muted/30`
 * posés sur la carte, mais sans transparence.
 */
const FOND_ENTETE = "bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))]";
const FOND_LIGNE = "bg-card hover:bg-[color-mix(in_srgb,var(--muted)_30%,var(--card))]";

/** Colonne épinglée au bord droit du conteneur défilant. */
const EPINGLEE =
  "sticky right-0 bg-inherit shadow-[-6px_0_6px_-6px_color-mix(in_srgb,var(--border)_90%,transparent)]";

/**
 * Tableau générique « type Excel » : rendu, chargement, état vide et pagination.
 * Le tri est piloté par les définitions de colonnes (en-têtes cliquables).
 *
 * La colonne dont l'identifiant est « actions » reste visible même lorsque le
 * tableau est plus large que l'écran : sans cela, les boutons Modifier et
 * Supprimer sortent du cadre dès que la fenêtre est étroite ou que l'affichage
 * de Windows est mis à l'échelle, et deviennent inatteignables.
 */
export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyLabel = "Aucun résultat.",
  pagination,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className={cn("border-b border-border", FOND_ENTETE)}
              >
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className={cn(
                      "px-4 py-3 text-left font-medium text-muted-foreground",
                      h.column.id === "actions" && EPINGLEE,
                    )}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <Spinner className="mx-auto h-6 w-6 text-primary" />
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    FOND_LIGNE,
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-4 py-2.5",
                        cell.column.id === "actions" && EPINGLEE,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination && <Pagination {...pagination} />}
    </Card>
  );
}
