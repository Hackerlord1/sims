import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Evidence register" };

export default function EvidencePage() {
  return <RegisterPage resource="evidence" title="Evidence register" description="Evidence items across cases. Originals are read-only and hashed; every access is logged." />;
}
