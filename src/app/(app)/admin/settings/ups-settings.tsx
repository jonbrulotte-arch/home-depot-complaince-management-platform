"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";

/** UPS Tracking API credentials for Logistics. The saved secret is never shown; leave it empty to keep it. */
export function UpsSettings({ initial }: { initial: { clientId: string | null; hasSecret: boolean; testMode: boolean } }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [testMode, setTestMode] = useState(initial.testMode);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const configured = Boolean(initial.clientId && initial.hasSecret);
  const changed = clientId.trim() !== (initial.clientId ?? "") || Boolean(secret.trim()) || testMode !== initial.testMode;

  async function run(label: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      setSecret("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  }
  const body = () => ({ clientId: clientId.trim(), clientSecret: secret.trim() || undefined, testMode });

  return (
    <Card id="ups" className="scroll-mt-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            UPS tracking
            {configured ? <Badge variant="success">Set up</Badge> : <Badge variant="secondary">Not set up</Badge>}
          </CardTitle>
          <CardDescription>
            Credentials of an app on the UPS Developer Portal (developer.ups.com) with the <strong>Tracking</strong> API. Logistics uses them to show the status of UPS parcels. The secret is stored here and
            never shown again; leave it empty to keep the saved one.
          </CardDescription>
        </div>
        <Button onClick={() => run("save", () => apiFetch("/api/admin/settings/ups", { method: "PUT", body: body() }), "Saved.")} disabled={Boolean(busy) || !changed || !clientId.trim() || (!secret.trim() && !initial.hasSecret)}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="ups-id" className="mb-1.5 block text-sm font-medium text-gray-700">
              Client ID
            </label>
            <Input id="ups-id" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="ups-secret" className="mb-1.5 block text-sm font-medium text-gray-700">
              Client secret
            </label>
            <Input id="ups-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" placeholder={initial.hasSecret ? "Saved: leave empty to keep it" : ""} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          Use UPS&apos;s test environment (wwwcie.ups.com) instead of production
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={Boolean(busy) || !clientId.trim() || (!secret.trim() && !initial.hasSecret)} onClick={() => run("test", () => apiFetch("/api/admin/settings/ups/test", { body: body() }), "UPS accepted the credentials.")}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </Button>
          {configured && (
            <Button
              variant="ghost"
              size="sm"
              disabled={Boolean(busy)}
              onClick={() => confirm("Remove the UPS credentials? UPS tracking stops until they're added again.") && run("clear", () => apiFetch("/api/admin/settings/ups", { method: "PUT", body: { clientId: "", testMode: false, clear: true } }), "Removed.")}
            >
              Remove
            </Button>
          )}
          {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
