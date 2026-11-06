"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Link2, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { copyText } from "@/lib/clipboard";

/** "Share": turns the issue's public read-only link on, replaces it or turns it off. */
export function ShareIssueButton({ issueId, label, initialToken }: { issueId: string; label: string; initialToken: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Only shown inside the dialog, which never renders on the server
  const link = token && typeof window !== "undefined" ? `${window.location.origin}/i/${token}` : "";

  async function run(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const r = await apiFetch<{ token?: string }>(`/api/issues/${issueId}/share`, { method, body: {} });
      setToken(method === "POST" ? (r.token ?? null) : null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4 mr-1.5" />
        {token ? "Shared" : "Share"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {label}</DialogTitle>
            <DialogDescription>
              {token
                ? "Anyone with this link can view the issue, read-only and without signing in, and download its PDF. Attached files stay in the platform."
                : "Turn on a public link to show this issue, read-only, to people without an account (for example THD support or a carrier). They can also download its PDF; attached files stay in the platform."}
            </DialogDescription>
          </DialogHeader>
          {token && (
            <div className="flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Public link" />
              <Button variant="outline" onClick={async () => setCopied(await copyText(link))}>
                <Copy className="h-4 w-4 mr-1.5" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <DialogFooter className="sm:justify-between">
            {token ? (
              <>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => run("DELETE")} disabled={busy}>
                    Turn off
                  </Button>
                  <Button variant="outline" onClick={() => run("POST")} disabled={busy} title="Replace the link; the current one stops working">
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                    New link
                  </Button>
                </div>
                <Button asChild>
                  <a href={link} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    Open
                  </a>
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => run("POST")} disabled={busy}>
                  <Link2 className="h-4 w-4 mr-1.5" />
                  {busy ? "Turning on…" : "Turn on public link"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
