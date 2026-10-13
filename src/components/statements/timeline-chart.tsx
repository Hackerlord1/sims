"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";

/** Daily money in and out. Loaded lazily; the page also shows the same data as a table. */
export default function TimelineChart({ data }: { data: { date: string; inflow: string; outflow: string }[] }) {
  const rows = data.map((d) => ({ date: d.date, "Money in": Number(d.inflow), "Money out": Number(d.outflow) }));
  return (
    <div className="h-72 w-full" role="img" aria-label="Bar chart of daily money in and out. The table below lists the same values.">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip formatter={(v) => formatMoney(String(v))} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <Legend />
          <Bar dataKey="Money in" fill="var(--chart-1)" isAnimationActive={false} />
          <Bar dataKey="Money out" fill="var(--chart-2)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
