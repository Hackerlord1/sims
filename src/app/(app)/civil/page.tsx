import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Civil action" };

export default function CivilPage() {
  return <RegisterPage resource="civil-matters" title="Civil action" description="Advocate referrals, demand letters and court cases." />;
}
