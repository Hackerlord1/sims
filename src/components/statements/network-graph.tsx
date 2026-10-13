"use client";

import cytoscape, { type Core } from "cytoscape";
import { useEffect, useRef } from "react";
import { formatMoney } from "@/lib/money";

export interface GraphNode {
  id: string;
  label: string;
  kind: "OWNER" | "COUNTERPARTY";
  inflow: string;
  outflow: string;
}
export interface GraphEdge {
  from: string;
  to: string;
  total: string;
  count: number;
}

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Money-movement network. Loaded lazily; a table alternative is always rendered next to it. */
export default function NetworkGraph({ nodes, edges, onSelect }: { nodes: GraphNode[]; edges: GraphEdge[]; onSelect?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const reduced = document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const accent = cssVar("--accent", "#0b6477");
    const text = cssVar("--text", "#0e1a2b");
    const muted = cssVar("--text-muted", "#4f5f75");
    const warning = cssVar("--chart-2", "#c4661f");
    const max = Math.max(1, ...edges.map((e) => Number(e.total)));
    cy.current = cytoscape({
      container: ref.current,
      elements: [
        ...nodes.map((n) => ({ data: { id: n.id, label: n.label.length > 28 ? n.label.slice(0, 26) + "…" : n.label, kind: n.kind } })),
        ...edges.map((e, i) => ({ data: { id: `e${i}`, source: e.from, target: e.to, label: formatMoney(e.total, null), weight: 1 + (Number(e.total) / max) * 7 } })),
      ],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": 11,
            color: text,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "background-color": muted,
            width: 22,
            height: 22,
            "text-wrap": "ellipsis",
            "text-max-width": "140px",
          },
        },
        { selector: "node[kind = 'OWNER']", style: { "background-color": accent, shape: "round-rectangle", width: 34, height: 34, "font-weight": "bold" } },
        {
          selector: "edge",
          style: {
            width: "data(weight)",
            "line-color": warning,
            "target-arrow-color": warning,
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 9,
            color: muted,
            "text-background-color": cssVar("--surface", "#fff"),
            "text-background-opacity": 0.85,
            "text-background-padding": "2px",
          },
        },
        { selector: ":selected", style: { "border-width": 3, "border-color": text } },
      ],
      layout: { name: "cose", animate: !reduced, animationDuration: 400, padding: 30, nodeRepulsion: () => 9000 },
      wheelSensitivity: 0.3,
    });
    cy.current.on("tap", "node", (evt) => onSelect?.(evt.target.id()));
    return () => {
      cy.current?.destroy();
      cy.current = null;
    };
  }, [nodes, edges, onSelect]);

  return <div ref={ref} className="h-[480px] w-full" role="img" aria-label={`Money-movement network with ${nodes.length} parties and ${edges.length} flows. The table below lists the same flows.`} />;
}
