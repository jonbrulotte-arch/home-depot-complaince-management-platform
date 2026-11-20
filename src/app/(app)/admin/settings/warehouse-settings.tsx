"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client-api";

interface Row {
  id: string;
  /** The value matched in the WMS data: an OrderNumber prefix or a CUST_NUM */
  key: string;
  name: string;
  /** Warehouses only: what packing slips print as the ship-from */
  shipFromName?: string;
  address?: string;
}

export interface MappingConfig {
  /** Anchor id and title of the card */
  id: string;
  title: string;
  description: React.ReactNode;
  /** The matched value's column header, field name in the API, example and what a removed one becomes */
  keyLabel: string;
  keyField: string;
  keyExample: string;
  nameExample: string;
  noun: string;
  removedNote: string;
  endpoint: string;
  /** Warehouses: also edit the packing slip's ship-from name and address */
  shipFrom?: boolean;
}

const th = "px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";

/** Warehouses: which warehouse shipped a WMS carton, from the start of its OrderNumber ("3-…"). */
export function WarehouseSettings({ warehouses }: { warehouses: { id: string; prefix: string; name: string; shipFromName: string | null; address: string | null }[] }) {
  return (
    <MappingSettings
      rows={warehouses.map((w) => ({ id: w.id, key: w.prefix, name: w.name, shipFromName: w.shipFromName ?? "", address: w.address ?? "" }))}
      config={{
        id: "warehouses",
        title: "Warehouses",
        description: (
          <>
            Which warehouse shipped a carton, from the start of the WMS report&apos;s <span className="font-mono">OrderNumber</span> (for example <span className="font-mono">3-S-ORD1005437</span> starts with{" "}
            <span className="font-mono">3-</span>). Logistics filters and sorts POs and shipments by it. Changes show at once; nothing needs importing again. The
            ship-from name and address are what the Packing Slip Generator prints for the warehouse.
          </>
        ),
        keyLabel: "OrderNumber prefix",
        keyField: "prefix",
        keyExample: "e.g. 5-",
        nameExample: "e.g. Texas Warehouse (Site 5)",
        noun: "warehouse",
        removedNote: "Its POs and shipments will show as an unknown warehouse.",
        endpoint: "/api/admin/warehouses",
        shipFrom: true,
      }}
    />
  );
}

/** Channels: which channel a WMS carton belongs to, from its CUST_NUM ("THD", "THD.COM-DFDC"). */
export function ChannelSettings({ channels }: { channels: { id: string; code: string; name: string }[] }) {
  return (
    <MappingSettings
      rows={channels.map((c) => ({ id: c.id, key: c.code, name: c.name }))}
      config={{
        id: "channels",
        title: "Channels",
        description: (
          <>
            Which channel a PO belongs to, from the WMS report&apos;s <span className="font-mono">CUST_NUM</span> (matched exactly, ignoring case). Logistics filters POs, shipments and UPS parcels by it. Add one when a new
            channel appears in the WMS data; changes show at once.
          </>
        ),
        keyLabel: "CUST_NUM",
        keyField: "code",
        keyExample: "e.g. THD.CA",
        nameExample: "e.g. Canada (CA)",
        noun: "channel",
        removedNote: "Its POs, shipments and parcels will show as an unknown channel.",
        endpoint: "/api/admin/channels",
      }}
    />
  );
}

/** A list of WMS values (prefixes or codes) and their names, edited in place */
function MappingSettings({ rows: items, config }: { rows: Row[]; config: MappingConfig }) {
  const router = useRouter();
  const [adding, setAdding] = useState({ key: "", name: "" });
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
    <Card id={config.id} className="overflow-hidden">
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className={`${th} w-48`}>{config.keyLabel}</th>
              <th className={th}>Name</th>
              <th className={`${th} w-44`} />
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <MappingRow key={`${w.id}-${w.key}-${w.name}-${w.shipFromName}-${w.address}`} row={w} config={config} busy={busy} run={run} />
            ))}
            <tr className="border-t border-gray-200 bg-gray-50/50">
              <td className="px-4 py-2">
                <Input aria-label={`New ${config.noun} ${config.keyLabel}`} value={adding.key} onChange={(e) => setAdding({ ...adding, key: e.target.value })} placeholder={config.keyExample} className="font-mono" maxLength={40} />
              </td>
              <td className="px-4 py-2">
                <Input aria-label={`New ${config.noun} name`} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder={config.nameExample} maxLength={80} />
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  size="sm"
                  disabled={busy || !adding.key.trim() || !adding.name.trim()}
                  onClick={async () => {
                    if (await run(() => apiFetch(config.endpoint, { body: { [config.keyField]: adding.key, name: adding.name } }))) setAdding({ key: "", name: "" });
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add {config.noun}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        {error && <div className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {!items.length && <p className="px-4 pb-4 text-sm text-gray-500">None yet: everything shows as an unknown {config.noun}.</p>}
      </CardContent>
    </Card>
  );
}

function MappingRow({ row, config, busy, run }: { row: Row; config: MappingConfig; busy: boolean; run: (a: () => Promise<unknown>) => Promise<boolean> }) {
  const [key, setKey] = useState(row.key);
  const [name, setName] = useState(row.name);
  const [shipFromName, setShipFromName] = useState(row.shipFromName ?? "");
  const [address, setAddress] = useState(row.address ?? "");
  const changed =
    key.trim().toUpperCase() !== row.key || name.trim() !== row.name || (config.shipFrom && (shipFromName.trim() !== (row.shipFromName ?? "") || address.trim() !== (row.address ?? "")));
  const body = { [config.keyField]: key, name, ...(config.shipFrom ? { shipFromName, address } : {}) };
  return (
    <>
    <tr className="border-t border-gray-200">
      <td className="px-4 py-2">
        <Input aria-label={`${config.keyLabel} for ${row.name}`} value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" maxLength={40} />
      </td>
      <td className="px-4 py-2">
        <Input aria-label={`Name for ${row.name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="outline" disabled={busy || !changed || !key.trim() || !name.trim()} onClick={() => run(() => apiFetch(`${config.endpoint}/${row.id}`, { method: "PATCH", body }))}>
            Save
          </Button>
          <button
            onClick={() => {
              if (window.confirm(`Remove ${row.name}? ${config.removedNote}`)) void run(() => apiFetch(`${config.endpoint}/${row.id}`, { method: "DELETE" }));
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
    {config.shipFrom && (
      <tr>
        <td className="px-4 pb-3 pt-0 align-top text-xs text-gray-500">Packing slip ship-from</td>
        <td className="px-4 pb-3 pt-0">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label={`Ship-from name for ${row.name}`} value={shipFromName} onChange={(e) => setShipFromName(e.target.value)} placeholder="e.g. JS PRODUCTS - 875062OH001" maxLength={120} />
            <Textarea aria-label={`Ship-from address for ${row.name}`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={"Street\nCity, ST ZIP"} rows={2} maxLength={500} />
          </div>
        </td>
        <td />
      </tr>
    )}
    </>
  );
}
