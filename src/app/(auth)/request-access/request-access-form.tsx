"use client";

import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { requestAccessAction, type RequestAccessState } from "./actions";

export function RequestAccessForm() {
  const [state, action, pending] = useActionState<RequestAccessState, FormData>(requestAccessAction, {});
  const err = (k: string) => state.fields?.[k];
  const aria = (k: string) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `${k}-error` : undefined }) as const;

  if (state.done) {
    return (
      <div className="space-y-4" role="status">
        <CheckCircle2 className="h-9 w-9 text-success" aria-hidden />
        <h2 className="text-xl">Request received</h2>
        <p className="text-sm text-muted">{state.done}</p>
        <Button variant="outline" asChild className="w-full">
          <Link href="/login">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <Field id="fullName" label="Full name" required error={err("fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required {...aria("fullName")} />
      </Field>
      <Field id="username" label="Username" required hint="3–40 letters, numbers, dots, dashes or underscores. You will sign in with it." error={err("username")}>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} required {...aria("username")} />
      </Field>
      <Field id="password" label="Password" required hint={`At least ${PASSWORD_MIN_LENGTH} characters with upper and lowercase letters, a number and a symbol.`} error={err("password")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" maxLength={128} required {...aria("password")} />
      </Field>
      {/* Honeypot for bots: hidden from people and assistive technology. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? "Sending…" : "Send request"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-accent underline-offset-2 hover:underline">
          Already have an account? Sign in
        </Link>
      </p>
    </form>
  );
}
