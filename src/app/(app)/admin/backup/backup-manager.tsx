"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";

interface BackupRow {
  name: string;
  size: number;
  createdAt: string;
}

const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const labelOf = (name: string) => name.match(/^sympl-cm-backup-\d{8}-\d{6}-(.+)\.json\.gz$/)?.[1] ?? null;

export function BackupManager({ backups, dir }: { backups: BackupRow[]; dir: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<{ name?: string; file?: File } | null>(null);
  const [confirm, setConfirm] = useState("");

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const msg = await action();
      if (msg) setMessage(msg);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run(async () => {
      const r = await apiFetch<{ name: string; counts: Record<string, number> }>("/api/admin/backups", { body: { label: label || undefined } });
      setLabel("");
      return `Saved ${r.name} (${Object.values(r.counts).reduce((s, n) => s + n, 0).toLocaleString()} rows).`;
    });

  const restore = () =>
    run(async () => {
      if (!target) return;
      const form = new FormData();
      form.set("confirm", confirm);
      if (target.file) form.set("file", target.file);
      if (target.name) form.set("name", target.name);
      const r = await apiFetch<{ restored: Record<string, number>; backupCreatedAt: string; safetyBackup: string; signedOut: boolean }>("/api/admin/backups/restore", { form });
      setTarget(null);
      setConfirm("");
      if (r.signedOut) {
        router.push("/login");
        return;
      }
      return `Restored the backup from ${formatDateTime(r.backupCreatedAt)} (${Object.values(r.restored).reduce((s, n) => s + n, 0).toLocaleString()} rows). The previous data was saved as ${r.safetyBackup}.`;
    });

  return (
    <>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{message}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create a backup</CardTitle>
            <CardDescription>
              Saved on the server in <code className="rounded bg-gray-100 px-1 text-xs">{dir}</code>. Download copies to keep them somewhere other than this server.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional), e.g. before-june-import" maxLength={40} />
            <Button onClick={create} disabled={busy}>
              <DatabaseBackup className="h-4 w-4 mr-1.5" />
              {busy ? "Working…" : "Back up now"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Restore from a file</CardTitle>
            <CardDescription>Upload a .json.gz backup from this platform. It replaces all current data; a safety backup is taken first.</CardDescription>
          </CardHeader>
          <CardContent>
            <input ref={fileInput} type="file" accept=".gz,application/gzip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setTarget({ file: f }); e.target.value = ""; }} />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4 mr-1.5" />
              Choose backup file…
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Backup", "Created", "Size", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-gray-400">No backups on the server yet.</td>
              </tr>
            )}
            {backups.map((b) => {
              const tag = labelOf(b.name);
              return (
                <tr key={b.name} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {b.name}
                    {tag && <Badge variant={tag === "pre-restore" ? "warning" : tag === "scheduled" ? "secondary" : "outline"} className="ml-2">{tag}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(b.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500">{size(b.size)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <a href={`/api/admin/backups/${b.name}`} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Download">
                        <Download className="h-4 w-4" />
                      </a>
                      <button onClick={() => setTarget({ name: b.name })} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Restore" disabled={busy}>
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button onClick={() => run(async () => { await apiFetch(`/api/admin/backups/${b.name}`, { method: "DELETE" }); })} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Delete" disabled={busy}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-gray-400">
        Scheduled backups: run <code>npm run backup -- --keep 30</code> from cron. For disaster recovery when the app cannot start: <code>npm run restore -- &lt;file&gt; --yes</code>.
      </p>

      <Dialog open={Boolean(target)} onOpenChange={(o) => { if (!o) { setTarget(null); setConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore {target?.name ?? target?.file?.name}?</DialogTitle>
            <DialogDescription>
              This replaces <span className="font-semibold">all</span> current data, including users and passwords, with the backup&apos;s. Anyone not in the backup is signed out. A safety backup of the current data is saved first.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type RESTORE to confirm</label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTarget(null); setConfirm(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={restore} disabled={busy || confirm !== "RESTORE"}>{busy ? "Restoring…" : "Restore"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
