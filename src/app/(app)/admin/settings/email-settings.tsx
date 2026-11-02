"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";

/** Email through Microsoft Graph: whether the server has the settings, the sender, and a test send. */
export function EmailSettings({ configured, sender, missing }: { configured: boolean; sender: string | null; missing: string[] }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendTest() {
    setBusy(true);
    setResult(null);
    try {
      await apiFetch("/api/admin/settings/email-test", { body: { to } });
      setResult({ ok: true, text: `Test email sent to ${to.trim()}.` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "The test email could not be sent" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Email Configuration (MS Graph)</CardTitle>
        <CardDescription>Used for user invitations. Requires an Azure AD App Registration with the Mail.Send application permission.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700">Status</span>
          {configured ? <Badge variant="success">Configured</Badge> : <Badge variant="secondary">Not configured</Badge>}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700">Sender</span>
          <span className="font-medium text-gray-900">{sender ?? "—"}</span>
        </div>
        {!configured && (
          <p className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
            Set {missing.map((m, i) => (
              <span key={m}>
                {i > 0 && ", "}
                <code className="font-mono">{m}</code>
              </span>
            ))}{" "}
            in the server&apos;s <code className="font-mono">.env</code> file and restart the service. Until then, invitations give you a link to send yourself.
          </p>
        )}
        <div className="border-t border-gray-200 pt-4">
          <label htmlFor="email-test" className="mb-1 block text-sm font-medium text-gray-700">
            Send Test Email
          </label>
          <div className="flex gap-2">
            <Input id="email-test" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@company.com" />
            <Button onClick={sendTest} disabled={busy || !configured || !to.trim()}>
              <Send className="h-4 w-4 mr-1.5" />
              {busy ? "Sending…" : "Send Test"}
            </Button>
          </div>
          {result && <p className={result.ok ? "mt-2 text-sm text-green-700" : "mt-2 text-sm text-red-700"}>{result.text}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
