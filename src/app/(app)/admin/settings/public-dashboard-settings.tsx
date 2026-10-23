"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";

const noSubscribe = () => () => {};

export function PublicDashboardSettings({ initialToken }: { initialToken: string | null }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The site's address is only known in the browser
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const path = token ? `/d/${token}` : null;

  async function run(action: "enable" | "reset" | "disable") {
    if (action === "reset" && !confirm("Make a new link? The current link stops working.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string | null }>("/api/admin/settings/public-dashboard", { body: { action } });
      setToken(res.token);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(`${origin}${path}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Public dashboard</CardTitle>
          {token ? <Badge variant="success">On</Badge> : <Badge variant="secondary">Off</Badge>}
        </div>
        <CardDescription>
          A read-only dashboard anyone with the link can open without signing in: the offset figures, the 12-month chart and the published scorecards, each through its public link. Internal work (reviews, reports in progress) is not shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {path && (
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={`${origin}${path}`} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 text-xs text-gray-600" aria-label="Public dashboard link" />
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button asChild variant="ghost" size="sm" title="Open the public dashboard">
              <a href={path} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {token ? (
            <>
              <Button variant="outline" onClick={() => run("reset")} disabled={busy}>New link</Button>
              <Button variant="outline" onClick={() => run("disable")} disabled={busy} className="text-red-600 hover:text-red-700">Turn off</Button>
            </>
          ) : (
            <Button onClick={() => run("enable")} disabled={busy}>Turn on</Button>
          )}
          {error && <span className="text-sm text-red-700">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
