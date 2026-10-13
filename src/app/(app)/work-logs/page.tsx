import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Work-done log" };

export default function WorkLogsPage() {
  return <RegisterPage resource="work-logs" title="Work-done log" description="Chronological case diary entries across cases." />;
}
