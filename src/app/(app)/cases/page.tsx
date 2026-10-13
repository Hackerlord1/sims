import type { Metadata } from "next";
import { CaseListClient } from "@/components/cases/case-list";

export const metadata: Metadata = { title: "Case files" };

export default function CasesPage() {
  return <CaseListClient />;
}
