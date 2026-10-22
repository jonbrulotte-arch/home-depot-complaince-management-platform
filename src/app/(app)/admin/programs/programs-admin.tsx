"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-api";
import { fiscalLabel } from "@/lib/fiscal";
import { cn, formatCurrency } from "@/lib/utils";

interface Rule {
  id: string;
  effectiveFrom: number;
  thresholdPct: number;
  offsetType: "NONE" | "FLAT" | "PCT_VALUE";
  offsetAmount: number;
  notes: string | null;
}
interface MetricRow {
  id: string;
  code: string;
  name: string;
  sheetNames: string[];
  active: boolean;
  rules: Rule[];
  reasonCodes: { id: string; code: string; whenToUse: string | null; requiredDocs: string | null }[];
}
interface ProgramRow {
  id: string;
  code: string;
  name: string;
  filePrefix: string | null;
  metrics: MetricRow[];
}
interface Alias {
  id: string;
  programId: string | null;
  metricId: string | null;
  sourceHeader: string;
  canonicalField: string;
}

const GLOBAL = "__global__";

function describeOffset(r: Pick<Rule, "offsetType" | "offsetAmount">) {
  if (r.offsetType === "FLAT") return `${formatCurrency(r.offsetAmount)} per violation`;
  if (r.offsetType === "PCT_VALUE") return `${r.offsetAmount}% of value`;
  return "No offset";
}

export function ProgramsAdmin({ programs, aliases, canonicalFields }: { programs: ProgramRow[]; aliases: Alias[]; canonicalFields: string[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(programs[0]?.id ?? null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {programs.map((p) => (
        <div key={p.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full items-center gap-2 px-4 py-3">
            {open === p.id ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            <span className="text-sm font-semibold text-gray-900">{p.name}</span>
            <Badge variant="outline">{p.code}</Badge>
            {p.filePrefix && <span className="text-xs text-gray-400">files starting {p.filePrefix}_…</span>}
            <span className="ml-auto"><Badge variant="secondary">{p.metrics.length} metrics</Badge></span>
          </button>
          {open === p.id && (
            <div className="border-t border-gray-200 divide-y divide-gray-200">
              {p.metrics.map((m) => (
                <MetricEditor key={m.id} metric={m} run={run} />
              ))}
            </div>
          )}
        </div>
      ))}
      <AliasEditor programs={programs} aliases={aliases} canonicalFields={canonicalFields} run={run} />
    </div>
  );
}

function MetricEditor({ metric, run }: { metric: MetricRow; run: (a: () => Promise<unknown>) => Promise<boolean> }) {
  const [adding, setAdding] = useState(false);
  const [sheets, setSheets] = useState(metric.sheetNames.join(", "));
  const [showCodes, setShowCodes] = useState(false);
  const latest = metric.rules[0];
  const [rule, setRule] = useState({
    effectiveFrom: "",
    thresholdPct: String(latest?.thresholdPct ?? 100),
    offsetType: latest?.offsetType ?? "FLAT",
    offsetAmount: String(latest?.offsetAmount ?? 0),
    notes: "",
  });

  async function addRule() {
    const ok = await run(() =>
      apiFetch(`/api/admin/metrics/${metric.id}/rules`, {
        body: {
          effectiveFrom: Number(rule.effectiveFrom),
          thresholdPct: Number(rule.thresholdPct),
          offsetType: rule.offsetType,
          offsetAmount: Number(rule.offsetAmount),
          notes: rule.notes || null,
        },
      }),
    );
    if (ok) setAdding(false);
  }

  return (
    <div className={cn("p-4 space-y-3", !metric.active && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">{metric.name}</span>
        <Badge variant="outline">{metric.code}</Badge>
        {latest && <Badge variant="default">Goal ≥ {latest.thresholdPct}% · {describeOffset(latest)}</Badge>}
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={metric.active} onChange={() => run(() => apiFetch(`/api/admin/metrics/${metric.id}`, { method: "PATCH", body: { active: !metric.active } }))} className="h-4 w-4 rounded border-gray-300" />
          Active
        </label>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">SPM sheet names (comma separated)</label>
          <Input value={sheets} onChange={(e) => setSheets(e.target.value)} />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={sheets === metric.sheetNames.join(", ")}
          onClick={() => run(() => apiFetch(`/api/admin/metrics/${metric.id}`, { method: "PATCH", body: { sheetNames: sheets.split(",").map((s) => s.trim()).filter(Boolean) } }))}
        >
          Save
        </Button>
      </div>

      <table className="min-w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            {["Effective from", "Goal", "Offset", "Notes", ""].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metric.rules.map((r) => (
            <tr key={r.id} className="border-t border-gray-200">
              <td className="px-3 py-2 text-gray-900">FM {r.effectiveFrom} ({fiscalLabel(r.effectiveFrom)})</td>
              <td className="px-3 py-2 text-gray-700">≥ {r.thresholdPct}%</td>
              <td className="px-3 py-2 text-gray-700">{describeOffset(r)}</td>
              <td className="px-3 py-2 text-gray-500">{r.notes}</td>
              <td className="px-3 py-2 text-right">
                {metric.rules.length > 1 && (
                  <button onClick={() => run(() => apiFetch(`/api/admin/rules/${r.id}`, { method: "DELETE" }))} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Delete rule">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding ? (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 sm:grid-cols-5">
          <Input placeholder="From FM, e.g. 202701" value={rule.effectiveFrom} onChange={(e) => setRule({ ...rule, effectiveFrom: e.target.value })} />
          <Input placeholder="Goal %" value={rule.thresholdPct} onChange={(e) => setRule({ ...rule, thresholdPct: e.target.value })} />
          <Select value={rule.offsetType} onValueChange={(v) => setRule({ ...rule, offsetType: v as Rule["offsetType"] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FLAT">$ per violation</SelectItem>
              <SelectItem value="PCT_VALUE">% of value</SelectItem>
              <SelectItem value="NONE">No offset</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Amount" value={rule.offsetAmount} onChange={(e) => setRule({ ...rule, offsetAmount: e.target.value })} />
          <Input placeholder="Notes" value={rule.notes} onChange={(e) => setRule({ ...rule, notes: e.target.value })} />
          <div className="col-span-full flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={addRule} disabled={!rule.effectiveFrom}>Add rule</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New rule from a fiscal month
          </Button>
          {metric.reasonCodes.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowCodes(!showCodes)}>
              {showCodes ? "Hide" : "Show"} {metric.reasonCodes.length} dispute reason codes
            </Button>
          )}
        </div>
      )}
      {showCodes && (
        <ul className="space-y-1 text-xs">
          {metric.reasonCodes.map((c) => (
            <li key={c.id} className="rounded-md border border-gray-200 px-3 py-2">
              <p className="font-medium text-gray-900">{c.code}</p>
              {c.whenToUse && <p className="text-gray-600">When: {c.whenToUse}</p>}
              {c.requiredDocs && <p className="text-gray-600">Docs: {c.requiredDocs}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AliasEditor({ programs, aliases, canonicalFields, run }: { programs: ProgramRow[]; aliases: Alias[]; canonicalFields: string[]; run: (a: () => Promise<unknown>) => Promise<boolean> }) {
  const [scope, setScope] = useState(GLOBAL);
  const [header, setHeader] = useState("");
  const [field, setField] = useState(canonicalFields[0]);
  const [filter, setFilter] = useState("");

  const scopes = [
    { value: GLOBAL, label: "All programs" },
    ...programs.flatMap((p) => [
      { value: `p:${p.id}`, label: p.name },
      ...p.metrics.map((m) => ({ value: `m:${p.id}:${m.id}`, label: `${p.name} › ${m.name}` })),
    ]),
  ];
  const scopeLabel = (a: Alias) => {
    if (a.metricId) {
      for (const p of programs) {
        const m = p.metrics.find((x) => x.id === a.metricId);
        if (m) return `${p.name} › ${m.name}`;
      }
    }
    if (a.programId) return programs.find((p) => p.id === a.programId)?.name ?? "Program";
    return "All programs";
  };
  const shown = aliases.filter((a) => !filter || a.sourceHeader.includes(filter.toLowerCase()) || a.canonicalField.toLowerCase().includes(filter.toLowerCase()));

  async function add() {
    const [kind, programId, metricId] = scope.split(":");
    const ok = await run(() =>
      apiFetch("/api/admin/aliases", {
        body: {
          programId: kind === GLOBAL ? null : programId,
          metricId: kind === "m" ? metricId : null,
          sourceHeader: header,
          canonicalField: field,
        },
      }),
    );
    if (ok) setHeader("");
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="p-4 space-y-1">
        <p className="text-sm font-semibold text-gray-900">Column mappings</p>
        <p className="text-xs text-gray-500">
          SPM export headers (matched case-insensitively) and the PO record field each fills. A metric mapping beats a program mapping, which beats an all-programs mapping. Unmapped columns are still stored with every line.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 border-t border-gray-200 p-4 sm:grid-cols-4">
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scopes.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Header in the export" value={header} onChange={(e) => setHeader(e.target.value)} />
        <Select value={field} onValueChange={setField}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {canonicalFields.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={!header.trim()}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add mapping
        </Button>
      </div>
      <div className="border-t border-gray-200 p-4 space-y-2">
        <Input placeholder="Filter mappings…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
        <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["Export header", "Field", "Scope", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-900">{a.sourceHeader}</td>
                  <td className="px-3 py-1.5 text-gray-700">{a.canonicalField}</td>
                  <td className="px-3 py-1.5 text-gray-500">{scopeLabel(a)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => run(() => apiFetch(`/api/admin/aliases/${a.id}`, { method: "DELETE" }))} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Delete mapping">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
