"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Mail, RotateCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-api";
import { copyText } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/utils";
import { useTimeZone } from "@/components/time-zone";

export interface InviteRow {
  id: string;
  email: string;
  name: string | null;
  roleName: string;
  invitedBy: string | null;
  sentAt: string;
  expiresAt: string;
  expired: boolean;
  emailed: boolean;
}

type SendResult = { email: string; emailed: boolean; reason: string | null; link: string | null };

/** What happened after sending: emailed, or the link to pass on when email couldn't be sent. */
function SendResultDialog({ result, onClose }: { result: SendResult | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={Boolean(result)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result?.emailed ? "Invitation sent" : "Invitation created"}</DialogTitle>
          <DialogDescription>
            {result?.emailed
              ? `${result.email} has been emailed a link to set up their account. It expires in 7 days.`
              : `The email couldn't be sent (${result?.reason ?? "unknown reason"}). Send ${result?.email} this link yourself. It works once and expires in 7 days, and it won't be shown again.`}
          </DialogDescription>
        </DialogHeader>
        {result?.link && (
          <div className="flex gap-2">
            <Input readOnly value={result.link} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
            <Button variant="outline" onClick={async () => setCopied(await copyText(result.link!))}>
              <Copy className="h-4 w-4 mr-1.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InviteButton({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", roleId: roles.find((r) => r.name === "Viewer")?.id ?? roles[0]?.id ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ emailed: boolean; reason: string | null; link: string | null }>("/api/admin/invites", { body: form });
      setResult({ email: form.email.trim().toLowerCase(), ...r });
      setForm({ ...form, email: "", name: "" });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the invitation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4 mr-1.5" />
        Invite user
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>They get an email with a link to set their own name and password. The link expires in 7 days.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <Input id="invite-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
            </div>
            <div>
              <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 mb-1.5">
                Name <span className="font-normal text-gray-400">(optional; they can change it)</span>
              </label>
              <Input id="invite-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-1.5">Role</span>
              <Select value={form.roleId} onValueChange={(roleId) => setForm({ ...form, roleId })}>
                <SelectTrigger aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={send} disabled={busy || !form.email.trim()}>
              {busy ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SendResultDialog result={result} onClose={() => setResult(null)} />
    </>
  );
}

/** Invitations not yet accepted or revoked, with Resend (a new link) and Revoke. */
export function PendingInvites({ invites }: { invites: InviteRow[] }) {
  const tz = useTimeZone();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  if (invites.length === 0) return null;

  async function resend(i: InviteRow) {
    setBusy(i.id);
    setError(null);
    try {
      const r = await apiFetch<{ emailed: boolean; reason: string | null; link: string | null }>(`/api/admin/invites/${i.id}/resend`, { method: "POST" });
      setResult({ email: i.email, ...r });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(i: InviteRow) {
    if (!window.confirm(`Revoke the invitation to ${i.email}? The link stops working.`)) return;
    setBusy(i.id);
    setError(null);
    try {
      await apiFetch(`/api/admin/invites/${i.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle>Invitations</CardTitle>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </CardHeader>
      <CardContent className="p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Email", "Role", "Invited by", "Sent", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id} className="border-t border-gray-200">
                <td className="px-4 py-3 text-gray-900">
                  {i.email}
                  {i.name && <div className="text-xs text-gray-500">{i.name}</div>}
                </td>
                <td className="px-4 py-3 text-gray-700">{i.roleName}</td>
                <td className="px-4 py-3 text-gray-700">{i.invitedBy ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500">
                  {formatDateTime(i.sentAt, tz)}
                  {!i.emailed && <div className="text-xs text-amber-700">Link given to the admin, not emailed</div>}
                </td>
                <td className="px-4 py-3">
                  {i.expired ? (
                    <Badge variant="secondary">Expired</Badge>
                  ) : (
                    <>
                      <Badge variant="warning">Pending</Badge>
                      <div className="text-xs text-gray-500">expires {formatDateTime(i.expiresAt, tz)}</div>
                    </>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => resend(i)} disabled={busy === i.id}>
                      <RotateCw className="h-4 w-4 mr-1.5" />
                      Resend
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => revoke(i)} disabled={busy === i.id} aria-label={`Revoke the invitation to ${i.email}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
      <SendResultDialog result={result} onClose={() => setResult(null)} />
    </Card>
  );
}
