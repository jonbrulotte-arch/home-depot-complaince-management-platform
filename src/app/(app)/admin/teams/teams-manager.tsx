"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export interface TeamRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  /** Violation reviews and issues that name this team */
  reviews: number;
  issues: number;
}

const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";

export function TeamsManager({ teams }: { teams: TeamRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<TeamRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<TeamRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, by: -1 | 1) => {
    const ids = teams.map((t) => t.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    return run(() => apiFetch("/api/admin/teams/reorder", { body: { ids } }));
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            The teams a violation or an issue can be put on (&ldquo;Team responsible&rdquo;). Renaming a team changes it everywhere at once: violation reviews, issues, PO records, packages,
            disputes and Reports &amp; Insights. Published scorecards keep the name they were generated with until they are regenerated.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add team
        </Button>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card className="overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className={cn(th, "w-20")}>Order</th>
              <th className={th}>Team</th>
              <th className={th}>Description</th>
              <th className={cn(th, "text-right")}>Violations</th>
              <th className={cn(th, "text-right")}>Issues</th>
              <th className={th}>Status</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.id} className={cn("border-t border-gray-200 hover:bg-gray-50", !t.active && "text-gray-400")}>
                <td className="px-4 py-3">
                  <div className="flex gap-0.5">
                    <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30" title="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={busy || i === teams.length - 1} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30" title="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className={t.active ? "font-medium text-gray-900" : "font-medium"}>{t.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{t.key}</p>
                </td>
                <td className="px-4 py-3 text-gray-500">{t.description ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.reviews.toLocaleString("en-US")}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.issues.toLocaleString("en-US")}</td>
                <td className="px-4 py-3">{t.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => apiFetch(`/api/admin/teams/${t.id}`, { method: "PATCH", body: { active: !t.active } }))}>
                      {t.active ? "Turn off" : "Turn on"}
                    </Button>
                    <button onClick={() => setEditing(t)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleting(t)}
                      disabled={t.reviews + t.issues > 0}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                      title={t.reviews + t.issues > 0 ? "In use: turn it off instead" : "Delete"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-gray-500">
        Turning a team off removes it from the pickers for new violation reviews and issues; reviews and issues that already have it keep it. A team can only be deleted while nothing uses it.
      </p>

      <TeamDialog team={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>No violation review or issue uses this team. It will no longer be offered anywhere.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await apiFetch(`/api/admin/teams/${deleting!.id}`, { method: "DELETE" });
                  setDeleting(null);
                })
              }
            >
              Delete team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TeamDialog({ team, onClose, onSaved }: { team: TeamRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const editing = team && team !== "new" ? team : null;
  return (
    <Dialog open={Boolean(team)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {/* Keyed so the form starts fresh for each team */}
        {team && <TeamForm key={editing?.id ?? "new"} team={editing} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function TeamForm({ team, onClose, onSaved }: { team: TeamRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (team) await apiFetch(`/api/admin/teams/${team.id}`, { method: "PATCH", body: { name, description } });
      else await apiFetch("/api/admin/teams", { body: { name, description } });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{team ? `Edit ${team.name}` : "Add team"}</DialogTitle>
        {team && team.reviews + team.issues > 0 && (
          <DialogDescription>
            A new name shows on the {team.reviews} violation review(s) and {team.issues} issue(s) that already use this team.
          </DialogDescription>
        )}
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label htmlFor="team-name" className="mb-1.5 block text-sm font-medium text-gray-700">
            Name
          </label>
          <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Warehouse (Site 5)" />
        </div>
        <div>
          <label htmlFor="team-description" className="mb-1.5 block text-sm font-medium text-gray-700">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <Textarea id="team-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} placeholder="Who this team is, for the people choosing it" />
        </div>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : team ? "Save" : "Add team"}
        </Button>
      </DialogFooter>
    </>
  );
}
