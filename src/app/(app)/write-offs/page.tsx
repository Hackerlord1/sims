import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Write-offs" };

export default function WriteOffsPage() {
  return <RegisterPage resource="write-offs" title="Write-offs" description="Write-off proposals and their finance, management and board approvals." />;
}
