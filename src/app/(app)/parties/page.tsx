import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Parties, suspects and witnesses" };

export default function PartiesPage() {
  return (
    <RegisterPage
      resource="parties"
      title="Parties, suspects and witnesses"
      description="People and organisations recorded in cases. A role describes a relationship to the case and never implies guilt."
    />
  );
}
