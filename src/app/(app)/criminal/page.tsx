import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Criminal action" };

export default function CriminalPage() {
  return <RegisterPage resource="criminal-matters" title="Criminal action" description="Police, DCI and DPP referrals and their progress." />;
}
