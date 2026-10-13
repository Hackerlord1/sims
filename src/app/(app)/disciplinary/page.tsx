import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Disciplinary and administrative action" };

export default function DisciplinaryPage() {
  return <RegisterPage resource="disciplinary" title="Disciplinary and administrative action" description="Restricted HR records." />;
}
