"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { STATUT_DECLARATION_LABELS } from "@/lib/constants";

const COLORS: Record<string, string> = {
  A_FAIRE: "#94a3b8",
  DEPOSEE: "#2563eb",
  PAYEE: "#59b233",
  EN_RETARD: "#dc2626",
  EXONERE: "#9333ea",
};

export function DeclarationStatusChart({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const data = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([statut, value]) => ({
      name:
        STATUT_DECLARATION_LABELS[
          statut as keyof typeof STATUT_DECLARATION_LABELS
        ] ?? statut,
      key: statut,
      value,
    }));

  if (data.length === 0)
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Aucune donnée
      </div>
    );

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((d) => (
            <Cell key={d.key} fill={COLORS[d.key] ?? "#94a3b8"} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--foreground)",
            fontSize: 13,
          }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 13, color: "var(--muted-foreground)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
