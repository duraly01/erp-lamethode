"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  FileText,
  Send,
  Wallet,
  Sparkles,
  ArrowUpDown,
  Ban,
} from "lucide-react";
import { apiGet, apiSend, qs, ApiClientError, type Paginated } from "@/lib/api-client";
import {
  STATUT_FACTURE_LABELS,
  STATUT_FACTURE_COLORS,
  MODE_REGLEMENT_LABELS,
  formatFcfa,
  resteAPayer,
  jourCalendaire,
  type StatutFacture,
  type ModeReglement,
} from "@/lib/facturation";
import { formatDateFR } from "@/lib/constants";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { Spinner } from "@/components/ui/spinner";
import { FactureForm } from "@/components/factures/FactureForm";

type FactureRow = {
  id: number;
  numero: string;
  contribuableId: number;
  contribuableNom: string;
  periode: string;
  dateEmission: string;
  dateEcheance: string;
  statut: StatutFacture;
  totalTtc: string;
  montantRegle: string;
};

const col = createColumnHelper<FactureRow>();

export function FacturesClient() {
  const qc = useQueryClient();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [sort, setSort] = useState("dateEmission");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [formOpen, setFormOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [aRegler, setARegler] = useState<FactureRow | null>(null);
  const [aAnnuler, setAAnnuler] = useState<FactureRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["factures", { page, q, statut, sort, order }],
    queryFn: () =>
      apiGet<Paginated<FactureRow>>(
        `/api/factures${qs({ page, pageSize: 10, q, statut, sort, order })}`,
      ),
  });

  const emettre = useMutation({
    mutationFn: (id: number) =>
      apiSend(`/api/factures/${id}`, "PATCH", { statut: "ENVOYEE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factures"] }),
  });

  const annuler = useMutation({
    mutationFn: (id: number) => apiSend(`/api/factures/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factures"] });
      setAAnnuler(null);
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
      col.accessor("numero", {
        header: () => (
          <SortHeader label="N°" active={sort === "numero"} order={order} onClick={() => toggleSort("numero")} />
        ),
        cell: (c) => (
          <div className="min-w-0">
            <p className="font-medium text-foreground">{c.getValue()}</p>
            <p className="truncate text-xs text-muted-foreground">
              {c.row.original.contribuableNom}
            </p>
          </div>
        ),
      }),
      col.accessor("periode", { header: "Période" }),
      col.accessor("dateEcheance", {
        header: () => (
          <SortHeader label="Échéance" active={sort === "dateEcheance"} order={order} onClick={() => toggleSort("dateEcheance")} />
        ),
        cell: (c) => (
          <span className="text-sm text-muted-foreground">
            {formatDateFR(c.getValue())}
          </span>
        ),
      }),
      col.accessor("totalTtc", {
        header: () => (
          <SortHeader label="Montant" active={sort === "totalTtc"} order={order} onClick={() => toggleSort("totalTtc")} />
        ),
        cell: (c) => {
          const reste = resteAPayer(
            Number(c.getValue()),
            Number(c.row.original.montantRegle),
          );
          return (
            <div className="text-right">
              <p className="font-medium text-foreground">
                {formatFcfa(c.getValue())}
              </p>
              {reste > 0 && Number(c.row.original.montantRegle) > 0 && (
                <p className="text-xs text-warning">
                  reste {formatFcfa(reste)}
                </p>
              )}
            </div>
          );
        },
      }),
      col.accessor("statut", {
        header: "Statut",
        cell: (c) => (
          <Badge className={STATUT_FACTURE_COLORS[c.getValue()]}>
            {STATUT_FACTURE_LABELS[c.getValue()]}
          </Badge>
        ),
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) => {
          const f = c.row.original;
          const soldee = f.statut === "PAYEE" || f.statut === "ANNULEE";
          return (
            <div className="flex justify-end gap-1">
              <a
                href={`/api/exports/facture/${f.id}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Télécharger le PDF"
                title="Télécharger le PDF"
              >
                <FileText className="h-4 w-4" />
              </a>
              {can("factures", "update") && f.statut === "BROUILLON" && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Émettre"
                  title="Émettre la facture"
                  onClick={() => emettre.mutate(f.id)}
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
              {can("factures", "update") && !soldee && f.statut !== "BROUILLON" && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Enregistrer un règlement"
                  title="Enregistrer un règlement"
                  onClick={() => setARegler(f)}
                >
                  <Wallet className="h-4 w-4" />
                </Button>
              )}
              {can("factures", "delete") && f.statut !== "ANNULEE" && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Annuler"
                  title={
                    f.statut === "BROUILLON"
                      ? "Supprimer le brouillon"
                      : "Annuler la facture"
                  }
                  onClick={() => setAAnnuler(f)}
                  className="text-danger hover:bg-danger/10"
                >
                  <Ban className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        },
      }),
    ],
    [sort, order, can, emettre],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher un numéro ou un contribuable…"
        />
        <Select
          value={statut}
          onChange={(e) => {
            setStatut(e.target.value);
            setPage(1);
          }}
          className="sm:w-52"
        >
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUT_FACTURE_LABELS) as StatutFacture[]).map((s) => (
            <option key={s} value={s}>
              {STATUT_FACTURE_LABELS[s]}
            </option>
          ))}
        </Select>
        {can("factures", "create") && (
          <>
            <Button variant="outline" onClick={() => setGenOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Générer le mois
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Nouvelle facture
            </Button>
          </>
        )}
      </div>

      <DataTable
        columns={columns}
        data={query.data?.data ?? []}
        isLoading={query.isLoading}
        emptyLabel="Aucune facture."
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

      {/* Plus large que la modale ordinaire : le tableau des lignes compte
          cinq colonnes, dont la désignation qui doit rester saisissable. */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nouvelle facture"
        className="max-w-3xl"
      >
        <FactureForm onDone={() => setFormOpen(false)} />
      </Dialog>

      <Dialog
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Générer les factures du mois"
      >
        <GenerationMensuelle onDone={() => setGenOpen(false)} />
      </Dialog>

      <Dialog
        open={!!aRegler}
        onClose={() => setARegler(null)}
        title={`Règlement — ${aRegler?.numero ?? ""}`}
      >
        {aRegler && (
          <ReglementForm facture={aRegler} onDone={() => setARegler(null)} />
        )}
      </Dialog>

      <ConfirmDialog
        open={!!aAnnuler}
        onClose={() => setAAnnuler(null)}
        title={
          aAnnuler?.statut === "BROUILLON"
            ? "Supprimer ce brouillon ?"
            : "Annuler cette facture ?"
        }
        description={
          aAnnuler?.statut === "BROUILLON"
            ? `Le brouillon ${aAnnuler?.numero} sera définitivement supprimé.`
            : `La facture ${aAnnuler?.numero} sera marquée annulée. Une pièce déjà émise n'est jamais supprimée, pour que la numérotation reste continue.`
        }
        onConfirm={() => aAnnuler && annuler.mutate(aAnnuler.id)}
        loading={annuler.isPending}
      />
    </>
  );
}

function GenerationMensuelle({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [periode, setPeriode] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [error, setError] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{
    creees: { numero: string; contribuable: string }[];
    dejaFacturees: string[];
    sansMontant: string[];
  } | null>(null);

  const run = useMutation({
    mutationFn: () => apiSend("/api/factures/generate", "POST", { periode }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["factures"] });
      setResultat(r as never);
      setError(null);
    },
    onError: (e) =>
      setError(e instanceof ApiClientError ? e.message : "Erreur."),
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div>
        <Label htmlFor="periodeGen">Période *</Label>
        <Input
          id="periodeGen"
          value={periode}
          onChange={(e) => setPeriode(e.target.value)}
          placeholder="2026-01"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Un brouillon est préparé pour chaque contribuable actif en{" "}
        <strong className="font-medium text-foreground">
          facturation automatique
        </strong>{" "}
        ayant un montant à facturer sur la période. Les contribuables « à la
        demande » ne sont pas concernés. Rien n&apos;est envoyé : vous relisez
        puis émettez. Relancer l&apos;opération ne crée pas de doublon.
      </p>

      {resultat && (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <p className="font-medium text-success">
            {resultat.creees.length} brouillon(s) créé(s).
          </p>
          {resultat.dejaFacturees.length > 0 && (
            <p className="text-muted-foreground">
              Déjà facturés : {resultat.dejaFacturees.join(", ")}
            </p>
          )}
          {resultat.sansMontant.length > 0 && (
            <p className="text-warning">
              Sans honoraires ni échéance chiffrée, donc ignorés :{" "}
              {resultat.sansMontant.join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Fermer
        </Button>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          Générer
        </Button>
      </div>
    </div>
  );
}

function ReglementForm({
  facture,
  onDone,
}: {
  facture: FactureRow;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const reste = resteAPayer(
    Number(facture.totalTtc),
    Number(facture.montantRegle),
  );
  const [montant, setMontant] = useState(String(reste));
  const [date, setDate] = useState(() => jourCalendaire(new Date()));
  const [mode, setMode] = useState<ModeReglement>("VIREMENT");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiSend(`/api/factures/${facture.id}/reglements`, "POST", {
        date,
        montant: Number(montant),
        mode,
        reference: reference || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factures"] });
      onDone();
    },
    onError: (e) =>
      setError(e instanceof ApiClientError ? e.message : "Erreur."),
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        Reste à payer :{" "}
        <span className="font-semibold text-foreground">
          {formatFcfa(reste)}
        </span>
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="montant">Montant *</Label>
          <Input
            id="montant"
            type="number"
            min={0}
            max={reste}
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="dateReglement">Date *</Label>
          <Input
            id="dateReglement"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="mode">Mode</Label>
          <Select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as ModeReglement)}
          >
            {(Object.keys(MODE_REGLEMENT_LABELS) as ModeReglement[]).map((m) => (
              <option key={m} value={m}>
                {MODE_REGLEMENT_LABELS[m]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="reference">Référence</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="N° de virement, de chèque…"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || Number(montant) <= 0}
        >
          {mutation.isPending && <Spinner />}
          Enregistrer
        </Button>
      </div>
    </div>
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
