"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { MOIS_LABELS, DECLARATION_TYPES, type DeclarationType } from "@/lib/constants";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 13,
};

export function MonthlyChart({
  data,
}: {
  data: { mois: number; count: number }[];
}) {
  const chart = data.map((d) => ({
    mois: MOIS_LABELS[d.mois - 1].slice(0, 3),
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chart} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="mois" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="count" fill="#59b233" radius={[4, 4, 0, 0]} name="Échéances" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TypeChart({
  data,
}: {
  data: { type: string; count: number }[];
}) {
  const chart = [...data]
    .sort((a, b) => b.count - a.count)
    .map((d) => ({
      type: DECLARATION_TYPES[d.type as DeclarationType]?.label ?? d.type,
      count: d.count,
    }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={chart}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 20, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="type" width={90} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Déclarations">
          {chart.map((_, i) => (
            <Cell key={i} fill={i === 0 ? "#59b233" : "#2563eb"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
