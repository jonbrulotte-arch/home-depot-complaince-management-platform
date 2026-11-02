"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { PASSWORD_MIN } from "@/lib/password-rules";

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = password && password.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters.` : confirm && confirm !== password ? "The passwords don't match." : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/password-reset/${token}`, { body: { password } });
      // Sign straight in with the new password
      const result = await signIn("credentials", { email, password, redirect: false });
      router.push(result?.error ? "/login" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          New password <span className="font-normal text-gray-400">(at least {PASSWORD_MIN} characters)</span>
        </label>
        <Input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
      </div>
      <div>
        <label htmlFor="reset-confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
          Confirm new password
        </label>
        <Input id="reset-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </div>
      {(problem || error) && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{problem ?? error}</div>}
      <Button type="submit" className="w-full" disabled={busy || !password || password !== confirm || Boolean(problem)}>
        {busy ? "Saving…" : "Set new password and sign in"}
      </Button>
    </form>
  );
}
