import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Investigation expenses" };

export default function ExpensesPage() {
  return <RegisterPage resource="expenses" title="Investigation expenses" description="Expenses across cases with their approval, payment and accounting status." />;
}
