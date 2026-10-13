"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Simple horizontal bar chart. Loaded lazily; every use also renders a table alternative. */
export default function SimpleBarChart({ data, money, label }: { data: { name: string; value: number }[]; money?: boolean; label: string }) {
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 30 + 40) }} role="img" aria-label={`${label}. The table below lists the same values.`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10.5, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            tickFormatter={(v: number) => (money ? (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v)) : String(v))}
            allowDecimals={false}
          />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12, fill: "var(--text)" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "color-mix(in srgb, var(--marker) 14%, transparent)" }}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", boxShadow: "var(--shadow-depth)" }}
            labelStyle={{ color: "var(--text)", fontWeight: 600 }}
            itemStyle={{ color: "var(--text)" }}
          />
          <Bar dataKey="value" isAnimationActive={false} maxBarSize={14}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
