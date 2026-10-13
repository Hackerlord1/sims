import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  const demo = process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-[1.85rem] leading-tight">Sign in</h1>
        <p className="text-sm text-muted">Use your SIMS username or work email.</p>
      </div>
      {demo ? (
        <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning" role="note">
          <strong className="font-semibold">Demo mode.</strong> This environment contains fictional demo data only. Do not enter real investigation information.
        </p>
      ) : null}
      <LoginForm next={typeof next === "string" ? next.slice(0, 500) : undefined} />
      <div className="border-t border-dashed border-border pt-4 text-center text-sm text-muted">
        No account yet?{" "}
        <Link href="/request-access" className="font-medium text-accent underline-offset-2 hover:underline">
          Request access
        </Link>
      </div>
    </div>
  );
}
