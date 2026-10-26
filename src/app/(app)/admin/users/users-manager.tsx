"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-api";
import { cn, formatDateTime } from "@/lib/utils";

interface UserRow {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  active: boolean;
  lastLoginAt: string | null;
}

export function UsersManager({ users, roles, meId }: { users: UserRow[]; roles: { id: string; name: string }[]; meId: string }) {
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
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add user
        </Button>
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
                <td className="px-4 py-3 text-gray-500">{formatDateTime(u.lastLoginAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setResetFor(u)} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Set password">
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
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body: { password } });
      setPassword("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set password for {user?.name}</DialogTitle>
        </DialogHeader>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || password.length < 8}>{saving ? "Saving…" : "Set password"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
