"use client";

import { Check, Loader2, X } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { cn } from "@/lib/cn";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { label: "Upper and lowercase letters", test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: "A number", test: (p) => /\d/.test(p) },
  { label: "A symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, {});
  const [pw, setPw] = useState("");
  const err = (k: string) => state.fieldErrors?.[k]?.join(" ");

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <Field id="currentPassword" label="Current password" error={err("currentPassword")}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required aria-invalid={!!err("currentPassword")} />
      </Field>
      <Field id="newPassword" label="New password" error={err("newPassword")}>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          aria-invalid={!!err("newPassword")}
          aria-describedby="password-rules"
        />
      </Field>
      <ul id="password-rules" className="space-y-1 text-xs" aria-label="Password requirements">
        {RULES.map((r) => {
          const ok = r.test(pw);
          return (
            <li key={r.label} className={cn("flex items-center gap-1.5", ok ? "text-success" : "text-muted")}>
              {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              {r.label}
              <span className="sr-only">{ok ? "(met)" : "(not met)"}</span>
            </li>
          );
        })}
      </ul>
      <Field id="confirmPassword" label="Confirm new password" error={err("confirmPassword")}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required aria-invalid={!!err("confirmPassword")} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Update password
      </Button>
    </form>
  );
}
