import type { Metadata } from "next";
import { StatementAnalysis } from "@/components/statements/statement-analysis";

export const metadata: Metadata = { title: "Statement analysis" };

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StatementAnalysis id={id} />;
}
