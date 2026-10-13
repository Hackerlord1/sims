import type { Metadata } from "next";
import { CaseWorkspace } from "@/components/cases/case-workspace";

export const metadata: Metadata = { title: "Case file" };

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; opened?: string }> }) {
  const { id } = await params;
  const { tab, opened } = await searchParams;
  return <CaseWorkspace caseId={id} initialTab={tab} justOpened={opened === "1"} />;
}
