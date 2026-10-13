import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Advances and imprests" };

export default function AdvancesPage() {
  return <RegisterPage resource="advances" title="Advances and imprests" description="Advances issued to investigators and how they were accounted for." />;
}
