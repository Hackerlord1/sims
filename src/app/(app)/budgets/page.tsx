import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return <RegisterPage resource="budgets" title="Budgets" description="Approved budget lines by pathway across cases." />;
}
