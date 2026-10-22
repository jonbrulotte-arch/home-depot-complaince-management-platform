"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client-api";

interface Props {
  periods: { fiscalMonth: number; label: string }[];
  defaultFiscalMonth: number;
  programs: { id: string; name: string }[];
}

export function NewReportDialog({ periods, defaultFiscalMonth, programs }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fiscalMonth, setFiscalMonth] = useState(String(defaultFiscalMonth));
  const [selected, setSelected] = useState<Set<string>>(new Set(programs.map((p) => p.id)));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const { id } = await apiFetch<{ id: string }>("/api/reports", {
        body: { fiscalMonth: Number(fiscalMonth), programIds: [...selected], notes: notes || undefined },
      });
      router.push(`/reports/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the report");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1.5" />
          New Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New compliance report</DialogTitle>
          <DialogDescription>Choose the THD fiscal month being reported and the programs to include.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Compliance period</label>
            <Select value={fiscalMonth} onValueChange={setFiscalMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.fiscalMonth} value={String(p.fiscalMonth)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Programs</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {programs.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving || selected.size === 0}>{saving ? "Creating…" : "Create report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
