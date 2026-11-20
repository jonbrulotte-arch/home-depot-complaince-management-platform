"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  system: boolean;
  users: number;
}

export function RoleMatrix({ roles, permissions }: { roles: RoleRow[]; permissions: { key: string; label: string }[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => new Map(roles.map((r) => [r.id, new Set(r.permissions)])));
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const locked = (r: RoleRow) => r.system && r.name === "Admin";
  // Roles added since the page loaded have no draft entry yet
  const current = (r: RoleRow) => draft.get(r.id) ?? new Set(r.permissions);
  const dirty = roles.filter((r) => {
    const d = current(r);
    return d.size !== r.permissions.length || r.permissions.some((p) => !d.has(p));
  });

  function toggle(role: RoleRow, key: string) {
    const next = new Map(draft);
    const set = new Set(current(role));
    if (set.has(key)) set.delete(key);
    else set.add(key);
    next.set(role.id, set);
    setDraft(next);
    setSaved(false);
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    const ok = await run(() => Promise.all(dirty.map((r) => apiFetch(`/api/admin/roles/${r.id}`, { method: "PATCH", body: { permissions: [...current(r)] } }))));
    if (ok) setSaved(true);
  }

  async function addRole() {
    const ok = await run(() => apiFetch("/api/admin/roles", { body: { name: newRole.trim(), permissions: ["view.dashboard"] } }));
    if (ok) setNewRole("");
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roles &amp; Access</h1>
          <p className="text-sm text-gray-500 mt-1">Tick what each role may do. Changes apply on the user&apos;s next page load. The Admin role always has full access.</p>
        </div>
        <Button onClick={saveAll} disabled={busy || dirty.length === 0}>{busy ? "Saving…" : saved && dirty.length === 0 ? "Saved" : `Save changes${dirty.length ? ` (${dirty.length})` : ""}`}</Button>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-1">
                    {r.name}
                    {!r.system && r.users === 0 && (
                      <button onClick={() => run(() => apiFetch(`/api/admin/roles/${r.id}`, { method: "DELETE" }))} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Delete role">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 normal-case font-normal">
                    <Badge variant={r.system ? "secondary" : "purple"}>{r.users} user{r.users === 1 ? "" : "s"}</Badge>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p.key} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="text-gray-900">{p.label}</p>
                  <p className="text-xs text-gray-400">{p.key}</p>
                </td>
                {roles.map((r) => (
                  <td key={r.id} className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      checked={locked(r) || current(r).has(p.key)}
                      disabled={locked(r) || busy}
                      onChange={() => toggle(r, p.key)}
                      aria-label={`${r.name}: ${p.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex max-w-md gap-2">
        <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="New role name, e.g. Dispute Coordinator" />
        <Button variant="outline" onClick={addRole} disabled={busy || !newRole.trim()}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add role
        </Button>
      </div>
    </>
  );
}
