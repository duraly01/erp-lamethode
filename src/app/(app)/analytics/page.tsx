import { FileText, TrendingUp, AlertTriangle, Coins } from "lucide-react";
import { getAnalytics } from "@/lib/data";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/badge";
import { MonthlyChart, TypeChart } from "@/components/analytics/AnalyticsCharts";
import { formatFCFA } from "@/lib/utils";
import { REGIME_FISCAL_LABELS, type RegimeFiscal } from "@/lib/constants";

export default async function AnalyticsPage() {
  const a = await getAnalytics(2026);
  const totalRegime = a.byRegime.reduce((s, r) => s + r.count, 0) || 1;

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Indicateurs de performance du portefeuille (année 2026)."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Déclarations suivies"
          value={a.totalDeclarations}
          icon={FileText}
          tone="info"
        />
        <StatCard
          label="Taux de traitement"
          value={`${a.tauxDepot}%`}
          icon={TrendingUp}
          tone="primary"
          hint="déposées / payées / exonérées"
        />
        <StatCard
          label="Clients à risque"
          value={a.topRetards.length}
          icon={AlertTriangle}
          tone="danger"
          hint="avec des retards"
        />
        <StatCard
          label="Pénalités estimées"
          value={formatFCFA(a.penalitesTotal)}
          icon={Coins}
          tone="warning"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Échéances par mois</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyChart data={a.byMonth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Déclarations par type</CardTitle>
          </CardHeader>
          <CardContent>
            <TypeChart data={a.byType} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Répartition du portefeuille */}
        <Card>
          <CardHeader>
            <CardTitle>Portefeuille par régime fiscal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {a.byRegime.map((r) => {
                const pct = Math.round((r.count / totalRegime) * 100);
                return (
                  <div key={r.regime}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        {REGIME_FISCAL_LABELS[r.regime as RegimeFiscal]}
                      </span>
                      <span className="text-muted-foreground">
                        {r.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Top clients à risque */}
        <Card>
          <CardHeader>
            <CardTitle>Top clients à risque (retards)</CardTitle>
          </CardHeader>
          <CardContent>
            {a.topRetards.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun retard. 👌
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {a.topRetards.map((t, i) => (
                  <li
                    key={t.nom}
                    className="flex items-center justify-between py-2.5"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {t.nom}
                      </span>
                    </span>
                    <Badge className="border-danger/20 bg-danger/10 text-danger">
                      {t.count} en retard
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
