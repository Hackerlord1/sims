import type { Metadata } from "next";
import { SearchPage } from "@/components/search/search-page";

export const metadata: Metadata = { title: "Search" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <SearchPage initialQuery={typeof q === "string" ? q.slice(0, 100) : ""} />;
}
