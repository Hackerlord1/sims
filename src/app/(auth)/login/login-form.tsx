"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { loginAction, type LoginState } from "./actions";

const REMEMBER_KEY = "sims.rememberedUsername";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  // Controlled so a failed attempt keeps the username (React resets uncontrolled fields after an action).
  const [identifier, setIdentifier] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  // Only the username is remembered, and only on this device.
  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a browser-only value
      setIdentifier(saved);
      setRemember(true);
      passwordRef.current?.focus();
    }
  }, []);

  const onSubmit = () => {
    const id = identifier.trim();
    if (remember && id) window.localStorage.setItem(REMEMBER_KEY, id);
    else window.localStorage.removeItem(REMEMBER_KEY);
  };

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-4" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field id="identifier" label="Username or work email">
        <Input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </Field>

      <Field id="password" label="Password">
        <div className="relative">
          <Input ref={passwordRef} id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="pr-10" />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted hover:text-text"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </Field>

      <label className="flex items-center gap-2 text-sm text-muted select-none">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-border accent-[var(--accent)]" />
        Remember username on this device
      </label>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
