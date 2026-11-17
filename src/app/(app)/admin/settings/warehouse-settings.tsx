"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";

interface Row {
  id: string;
  prefix: string;
  name: string;
}

const th = "px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";

/** Warehouses: which warehouse shipped a WMS carton, from the start of its OrderNumber ("3-…"). */
export function WarehouseSettings({ warehouses }: { warehouses: Row[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState({ prefix: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="warehouses" className="overflow-hidden">
      <CardHeader>
        <CardTitle>Warehouses</CardTitle>
        <CardDescription>
          Which warehouse shipped a carton, from the start of the WMS report&apos;s <span className="font-mono">OrderNumber</span> (for example <span className="font-mono">3-S-ORD1005437</span> starts with{" "}
          <span className="font-mono">3-</span>). Logistics filters and sorts POs and shipments by it. Changes show at once; nothing needs importing again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className={`${th} w-40`}>OrderNumber prefix</th>
              <th className={th}>Name</th>
              <th className={`${th} w-44`} />
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <WarehouseRow key={`${w.id}-${w.prefix}-${w.name}`} row={w} busy={busy} run={run} />
            ))}
            <tr className="border-t border-gray-200 bg-gray-50/50">
              <td className="px-4 py-2">
                <Input aria-label="New warehouse prefix" value={adding.prefix} onChange={(e) => setAdding({ ...adding, prefix: e.target.value })} placeholder="e.g. 5-" className="font-mono" maxLength={20} />
              </td>
              <td className="px-4 py-2">
                <Input aria-label="New warehouse name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="e.g. Texas Warehouse (Site 5)" maxLength={80} />
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  size="sm"
                  disabled={busy || !adding.prefix.trim() || !adding.name.trim()}
                  onClick={async () => {
                    if (await run(() => apiFetch("/api/admin/warehouses", { body: adding }))) setAdding({ prefix: "", name: "" });
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add warehouse
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        {error && <div className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {!warehouses.length && <p className="px-4 pb-4 text-sm text-gray-500">No warehouses yet: every PO and shipment shows as an unknown warehouse.</p>}
      </CardContent>
    </Card>
  );
}

function WarehouseRow({ row, busy, run }: { row: Row; busy: boolean; run: (a: () => Promise<unknown>) => Promise<boolean> }) {
  const [prefix, setPrefix] = useState(row.prefix);
  const [name, setName] = useState(row.name);
  const changed = prefix.trim().toUpperCase() !== row.prefix || name.trim() !== row.name;
  return (
    <tr className="border-t border-gray-200">
      <td className="px-4 py-2">
        <Input aria-label={`Prefix for ${row.name}`} value={prefix} onChange={(e) => setPrefix(e.target.value)} className="font-mono" maxLength={20} />
      </td>
      <td className="px-4 py-2">
        <Input aria-label={`Name for ${row.name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="outline" disabled={busy || !changed || !prefix.trim() || !name.trim()} onClick={() => run(() => apiFetch(`/api/admin/warehouses/${row.id}`, { method: "PATCH", body: { prefix, name } }))}>
            Save
          </Button>
          <button
            onClick={() => {
              if (window.confirm(`Remove ${row.name}? Its POs and shipments will show as an unknown warehouse.`)) void run(() => apiFetch(`/api/admin/warehouses/${row.id}`, { method: "DELETE" }));
            }}
            disabled={busy}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30"
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
