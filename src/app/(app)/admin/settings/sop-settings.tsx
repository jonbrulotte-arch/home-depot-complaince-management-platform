"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { formatDate } from "@/lib/utils";
import { useTimeZone } from "@/components/time-zone";

export interface SopRow {
  id: string;
  title: string;
  fileName: string;
  size: number;
  roleIds: string[];
  updatedAt: string;
}

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Admin › Settings › SOP documents: the PDFs Help & Docs offers each role. */
export function SopSettings({ sops, roles }: { sops: SopRow[]; roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const tz = useTimeZone();
  const [editing, setEditing] = useState<SopRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaceFor = useRef<SopRow | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name;

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

  async function replace(file: File) {
    const sop = replaceFor.current;
    if (!sop) return;
    const form = new FormData();
    form.set("file", file);
    await run(() => apiFetch(`/api/admin/sops/${sop.id}`, { method: "PATCH", form }));
  }

  return (
    <Card id="sops" className="scroll-mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>SOP documents</CardTitle>
            <CardDescription>
              PDFs of the standard operating procedures. Each role sees the ones chosen for it under <strong>SOPs for your role</strong> at the bottom of the Help &amp; Docs contents and can download them. When an SOP changes,
              export it as PDF again and <strong>Replace PDF</strong>; the download is the new version straight away.
            </CardDescription>
          </div>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add SOP
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        {sops.length === 0 ? (
          <p className="text-sm text-gray-400">No SOPs yet. Add one to offer it in Help &amp; Docs.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
            {sops.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{s.title}</p>
                  <p className="text-xs text-gray-500">
                    {s.fileName} · {kb(s.size)} · updated {formatDate(s.updatedAt, tz)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.roleIds.length === 0 ? (
                      <Badge variant="warning">No role yet: only admins see it</Badge>
                    ) : (
                      s.roleIds.map((id) => roleName(id) && <Badge key={id} variant="secondary">{roleName(id)}</Badge>)
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button asChild variant="ghost" size="sm" title="Download">
                    <a href={`/api/sops/${s.id}`}>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      replaceFor.current = s;
                      fileInput.current?.click();
                    }}
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    Replace PDF
                  </Button>
                  <button onClick={() => setEditing(s)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Edit title and roles">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => confirm(`Delete "${s.title}"? It disappears from Help & Docs for everyone.`) && run(() => apiFetch(`/api/admin/sops/${s.id}`, { method: "DELETE" }))}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void replace(f);
          }}
        />
      </CardContent>
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          {editing && <SopForm key={editing === "new" ? "new" : editing.id} sop={editing === "new" ? null : editing} roles={roles} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SopForm({ sop, roles, onDone, onCancel }: { sop: SopRow | null; roles: { id: string; name: string }[]; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(sop?.title ?? "");
  const [roleIds, setRoleIds] = useState<string[]>(sop?.roleIds ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("title", title);
    form.set("roleIds", JSON.stringify(roleIds));
    if (file) form.set("file", file);
    try {
      await apiFetch(sop ? `/api/admin/sops/${sop.id}` : "/api/admin/sops", { method: sop ? "PATCH" : "POST", form });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{sop ? `Edit ${sop.title}` : "Add SOP"}</DialogTitle>
        <DialogDescription>Export the SOP document as PDF, then upload it here and choose who it&apos;s for.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label htmlFor="sop-title" className="mb-1.5 block text-sm font-medium text-gray-700">
            Title
          </label>
          <Input id="sop-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Warehouse SOP" />
        </div>
        <div>
          <label htmlFor="sop-file" className="mb-1.5 block text-sm font-medium text-gray-700">
            PDF {sop && <span className="font-normal text-gray-400">(optional: replaces {sop.fileName})</span>}
          </label>
          <Input id="sop-file" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-gray-700">For these roles</legend>
          <div className="grid grid-cols-2 gap-2">
            {roles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  checked={roleIds.includes(r.id)}
                  onChange={(e) => setRoleIds(e.target.checked ? [...roleIds, r.id] : roleIds.filter((x) => x !== r.id))}
                />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !title.trim() || (!sop && !file)}>
          {busy ? "Saving…" : sop ? "Save" : "Add SOP"}
        </Button>
      </DialogFooter>
    </>
  );
}
