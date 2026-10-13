import type { Metadata } from "next";
import { MoneyMovement } from "@/components/statements/money-movement";

export const metadata: Metadata = { title: "Money movement" };

export default async function MoneyMovementPage({ searchParams }: { searchParams: Promise<{ caseId?: string }> }) {
  const { caseId } = await searchParams;
  return <MoneyMovement initialCaseId={typeof caseId === "string" ? caseId : undefined} />;
}
