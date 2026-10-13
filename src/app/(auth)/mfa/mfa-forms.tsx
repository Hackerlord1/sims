"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { beginEnrolmentAction, confirmEnrolmentAction, disableMfaAction, verifyMfaAction, type EnrolmentState, type MfaState } from "./actions";

function CodeField({ id = "code" }: { id?: string }) {
  return (
    <Field id={id} label="6-digit code" hint="From your authenticator app. Codes change every 30 seconds.">
      <Input id={id} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required className="font-mono tracking-[0.3em]" />
    </Field>
  );
}

export function VerifyForm() {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyMfaAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <CodeField />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Verify
      </Button>
    </form>
  );
}

export function EnrolForm() {
  const [enrolment, setEnrolment] = useState<EnrolmentState | null>(null);
  const [starting, start] = useTransition();
  const [state, action, pending] = useActionState<MfaState, FormData>(confirmEnrolmentAction, {});

  if (!enrolment?.secret) {
    return (
      <div className="space-y-4">
        {enrolment?.error ? <FormAlert>{enrolment.error}</FormAlert> : null}
        <p className="text-sm text-muted">You will need an authenticator app on your phone, such as Microsoft Authenticator or Google Authenticator.</p>
        <Button size="lg" className="w-full" disabled={starting} onClick={() => start(async () => setEnrolment(await beginEnrolmentAction()))}>
          {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Start set-up
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          Scan this QR code with your authenticator app.
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URL; next/image adds nothing here */}
          <img src={enrolment.qrDataUrl} alt="QR code for adding SIMS to an authenticator app" width={176} height={176} className="mt-2 rounded-md border border-border bg-white p-2" />
        </li>
        <li>
          Or enter this key manually:
          <code className="mt-1 block rounded-md bg-surface-2 px-2 py-1.5 font-mono text-xs break-all" aria-label="Set-up key">
            {enrolment.secret.match(/.{1,4}/g)?.join(" ")}
          </code>
        </li>
        <li>Enter the code the app shows to finish.</li>
      </ol>
      <CodeField />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Turn on two-step verification
      </Button>
    </form>
  );
}

export function DisableForm() {
  const [state, action, pending] = useActionState<MfaState, FormData>(disableMfaAction, {});
  if (state.done) {
    return (
      <p className="text-sm" role="status">
        Two-step verification is now off.{" "}
        <Link href="/dashboard" className="underline">
          Return to the dashboard
        </Link>
        .
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <Field id="password" label="Password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <CodeField id="disable-code" />
      <Button type="submit" variant="danger" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Turn off two-step verification
      </Button>
    </form>
  );
}
