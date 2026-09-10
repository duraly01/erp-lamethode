import Link from "next/link";
import { Users, FileClock, AlertTriangle, ShieldAlert } from "lucide-react";
import { getDashboardSummary } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/StatCard";
import { DeclarationStatusChart } from "@/components/dashboard/DeclarationStatusChart";
import {
  DeclarationStatusBadge,
  AcfStatusBadge,
} from "@/components/ui/status-badge";
import {
  DECLARATION_TYPES,
  formatDateFR,
  type StatutDeclaration,
} from "@/lib/constants";

export default async function DashboardPage() {
  const user = await getSessionUser();
  const s = await getDashboardSummary();

  const aFaire =
    (s.statutCounts["A_FAIRE"] ?? 0) + (s.statutCounts["EN_RETARD"] ?? 0);

  return (
    <div>
      <PageHeader
        title={`Bonjour, ${user?.nom?.split(" ")[0] ?? ""}`}
        subtitle="Vue d'ensemble du portefeuille et des échéances à venir."
      />

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Contribuables actifs"
          value={s.totalContribuables}
          icon={Users}
          tone="primary"
        />
        <StatCard
          label="Déclarations à traiter"
          value={aFaire}
          icon={FileClock}
          tone="info"
          hint={`${s.totalDeclarations} déclarations au total`}
        />
        <StatCard
          label="En retard"
          value={s.enRetard.length}
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="ACF bloqués"
          value={s.acfBloques.length}
          icon={ShieldAlert}
          tone="warning"
          hint={`${s.acfEnCours.length} en cours`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Répartition */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Répartition des déclarations</CardTitle>
          </CardHeader>
          <CardContent>
            <DeclarationStatusChart counts={s.statutCounts} />
          </CardContent>
        </Card>

        {/* Prochaines échéances */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Prochaines échéances (7 jours)</CardTitle>
          </CardHeader>
          <CardContent>
            {s.prochaines.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucune échéance dans les 7 prochains jours. 👌
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {s.prochaines.slice(0, 8).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {d.contribuableNom}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {DECLARATION_TYPES[d.type]?.label ?? d.type} ·{" "}
                        {d.periode}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatDateFR(d.dateEcheance)}
                      </span>
                      <DeclarationStatusBadge
                        statut={d.statut as StatutDeclaration}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ACF bloqués */}
      {s.acfBloques.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Dossiers ACF bloqués</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {s.acfBloques.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {a.contribuableNom}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.motifBlocage ?? a.objet}
                    </p>
                  </div>
                  <AcfStatusBadge statut={a.statut} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 text-center">
        <Link
          href="/declarations"
          className="text-sm font-medium text-primary hover:underline"
        >
          Voir toutes les déclarations →
        </Link>
      </div>
    </div>
  );
}
