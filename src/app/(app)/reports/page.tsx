import type { Metadata } from "next";
import { ReportsPage } from "@/components/reports/reports-page";

export const metadata: Metadata = { title: "Reports and exports" };

export default function Page() {
  return <ReportsPage />;
}
