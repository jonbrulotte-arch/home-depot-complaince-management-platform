"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { RESET_MINUTES_LABEL } from "@/lib/password-reset-rules";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/password-reset", { body: { email } });
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
        If <span className="font-medium">{sentTo}</span> has an active account, a reset link is on its way. It works once and expires in {RESET_MINUTES_LABEL}. Check your
        Junk folder if it doesn&apos;t arrive in a few minutes.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Email
        </label>
        <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
