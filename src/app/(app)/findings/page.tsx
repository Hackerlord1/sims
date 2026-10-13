import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Findings and decisions" };

export default function FindingsPage() {
  return <RegisterPage resource="findings" title="Findings and decisions" description="Formal conclusions, recommendations and management decisions." />;
}
