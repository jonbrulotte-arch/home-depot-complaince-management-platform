"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { PASSWORD_MIN } from "@/lib/password-rules";

export function AcceptInviteForm({ token, email, initialName }: { token: string; email: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
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
      await apiFetch(`/api/invite/${token}`, { body: { name, password } });
      // Sign straight in with the new password
      const result = await signIn("credentials", { email, password, redirect: false });
      router.push(result?.error ? "/login" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up the account");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 mb-1.5">
          Your name
        </label>
        <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
      </div>
      <div>
        <label htmlFor="invite-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Password <span className="font-normal text-gray-400">(at least {PASSWORD_MIN} characters)</span>
        </label>
        <Input id="invite-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
      </div>
      <div>
        <label htmlFor="invite-confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
          Confirm password
        </label>
        <Input id="invite-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </div>
      {(problem || error) && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{problem ?? error}</div>}
      <Button type="submit" className="w-full" disabled={busy || !name.trim() || !password || password !== confirm || Boolean(problem)}>
        {busy ? "Setting up…" : "Create my account"}
      </Button>
    </form>
  );
}
