import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Invoice investigation" };

export default function InvoicesPage() {
  return <RegisterPage resource="invoices" title="Invoice investigation" description="Invoices under investigation across all cases, with classification and recovery status." />;
}
