import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Bad-cheque tracking" };

export default function ChequesPage() {
  return <RegisterPage resource="cheques" title="Bad-cheque tracking" description="Cheques received, deposited and dishonoured, with warnings for missing links, follow-ups and deadlines." />;
}
