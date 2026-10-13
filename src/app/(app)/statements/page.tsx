import type { Metadata } from "next";
import { StatementsRegister } from "@/components/statements/statements-register";

export const metadata: Metadata = { title: "Bank and M-Pesa statements" };

export default function StatementsPage() {
  return <StatementsRegister />;
}
