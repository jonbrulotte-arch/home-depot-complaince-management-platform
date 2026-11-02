"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Mail, Plus, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-api";
import { copyText } from "@/lib/clipboard";
import { PASSWORD_MIN } from "@/lib/password-rules";
import { RESET_MINUTES_LABEL } from "@/lib/password-reset-rules";
import { cn, formatDateTime } from "@/lib/utils";
import { InviteButton, PendingInvites, type InviteRow } from "./invites";
import { useTimeZone } from "@/components/time-zone";

interface UserRow {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  active: boolean;
  lastLoginAt: string | null;
}

export function UsersManager({ users, roles, meId, invites }: { users: UserRow[]; roles: { id: string; name: string }[]; meId: string; invites: InviteRow[] }) {
  const tz = useTimeZone();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);

  async function update(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", body });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">Who can sign in, and which role they have. Role permissions are set under Roles &amp; Access.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add user
          </Button>
          <InviteButton roles={roles} />
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card className="overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Name", "Email", "Role", "Status", "Last sign-in", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={cn("border-t border-gray-200 hover:bg-gray-50", !u.active && "opacity-50")}>
                <td className="px-4 py-3 text-gray-900">{u.name}{u.id === meId && <span className="ml-2 text-xs text-gray-400">(you)</span>}</td>
                <td className="px-4 py-3 text-gray-700">{u.email}</td>
                <td className="px-4 py-3 w-48">
                  <Select value={u.roleId} onValueChange={(roleId) => update(u.id, { roleId })} disabled={u.id === meId}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3">{u.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td>
                <td className="px-4 py-3 text-gray-500">{formatDateTime(u.lastLoginAt, tz)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setResetFor(u)} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Reset password">
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {u.id !== meId && (
                      <button
                        onClick={() => update(u.id, { active: !u.active })}
                        className={cn("p-1.5 rounded-md text-gray-400 hover:bg-gray-100", u.active ? "hover:text-red-600" : "hover:text-gray-700")}
                        title={u.active ? "Deactivate" : "Reactivate"}
                      >
                        {u.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <PendingInvites invites={invites} />

      <AddUserDialog open={adding} onClose={() => setAdding(false)} roles={roles} />
      <PasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
    </>
  );
}

function AddUserDialog({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: roles.find((r) => r.name === "Viewer")?.id ?? roles[0]?.id ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/users", { body: form });
      setForm({ ...form, name: "", email: "", password: "" });
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(["name", "email", "password"] as const).map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{field === "password" ? "Temporary password" : field[0].toUpperCase() + field.slice(1)}</label>
              <Input type={field === "password" ? "password" : field === "email" ? "email" : "text"} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
            <Select value={form.roleId} onValueChange={(roleId) => setForm({ ...form, roleId })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add user"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const [mode, setMode] = useState<"email" | "temporary">("email");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ emailed: boolean; reason: string | null; link: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    setMode("email");
    setPassword("");
    setError(null);
    setSent(null);
    setCopied(false);
    onClose();
  }

  async function sendEmail() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      setSent(await apiFetch<{ emailed: boolean; reason: string | null; link: string | null }>(`/api/admin/users/${user.id}/password-reset`, { body: {} }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setSaving(false);
    }
  }

  async function setTemporary() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body: { password } });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the password");
    } finally {
      setSaving(false);
    }
  }

  const errorBox = error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>;

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {user?.name}</DialogTitle>
          <DialogDescription>
            {sent
              ? sent.emailed
                ? `A reset link was emailed to ${user?.email}. It works once and expires in ${RESET_MINUTES_LABEL}.`
                : `The email couldn't be sent (${sent.reason ?? "unknown reason"}). Send ${user?.email} this link yourself. It works once, expires in ${RESET_MINUTES_LABEL}, and won't be shown again.`
              : mode === "email"
                ? `Email ${user?.email} a link to choose a new password. It works once and expires in ${RESET_MINUTES_LABEL}; their current password keeps working until they use it.`
                : "Set a temporary password and give it to them in person or by phone. Their current password stops working at once."}
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <>
            {sent.link && (
              <div className="flex gap-2">
                <Input readOnly value={sent.link} onFocus={(e) => e.target.select()} aria-label="Password reset link" />
                <Button variant="outline" onClick={async () => setCopied(await copyText(sent.link!))}>
                  <Copy className="h-4 w-4 mr-1.5" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : mode === "email" ? (
          <>
            {!user?.active && <p className="text-sm text-gray-700">This account is inactive. Reactivate it before sending a reset email.</p>}
            {errorBox}
            <button type="button" onClick={() => { setMode("temporary"); setError(null); }} className="justify-self-start text-sm font-medium text-blue-600 hover:underline">
              Set a temporary password instead
            </button>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={sendEmail} disabled={saving || !user?.active}>
                <Mail className="h-4 w-4 mr-1.5" />
                {saving ? "Sending…" : "Send reset email"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={`At least ${PASSWORD_MIN} characters`} autoComplete="new-password" />
            {errorBox}
            <button type="button" onClick={() => { setMode("email"); setError(null); }} className="justify-self-start text-sm font-medium text-blue-600 hover:underline">
              Send a reset email instead
            </button>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={setTemporary} disabled={saving || password.length < PASSWORD_MIN}>{saving ? "Saving…" : "Set password"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
