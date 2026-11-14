"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-api";

export interface CarrierRow {
  id: string;
  scac: string;
  name: string;
  mode: string | null;
  trackingUrl: string | null;
  notes: string | null;
  shipments: number;
}

const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
const td = "px-4 py-2.5 text-sm";

/** Carriers by SCAC and where their link goes; SCACs in the data without a carrier are listed to add. */
export function CarrierEditor({ carriers, unknown, canManage }: { carriers: CarrierRow[]; unknown: { scac: string; shipments: number }[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<CarrierRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remove = async (c: CarrierRow) => {
    if (!confirm(`Delete ${c.scac} (${c.name})? Its SCAC links will search the web instead.`)) return;
    try {
      await apiFetch(`/api/logistics/carriers/${c.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    }
  };
  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {unknown.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            <strong>SCACs in your shipments with no carrier set:</strong> their links search the web for now.{canManage ? " Add them to link straight to the carrier's tracking page." : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unknown.map((u) =>
              canManage ? (
                <Button key={u.scac} size="sm" variant="outline" onClick={() => setEditing({ scac: u.scac })}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {u.scac} ({u.shipments})
                </Button>
              ) : (
                <Badge key={u.scac} variant="warning">
                  {u.scac} ({u.shipments})
                </Badge>
              ),
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className={th}>SCAC</th>
              <th className={th}>Carrier</th>
              <th className={th}>Mode</th>
              <th className={th}>Tracking link</th>
              <th className={th}>Shipments</th>
              {canManage && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {carriers.map((c) => (
              <tr key={c.id} className="border-t border-gray-200">
                <td className={`${td} font-mono font-medium text-gray-900`}>{c.scac}</td>
                <td className={`${td} text-gray-900`}>
                  {c.name}
                  {c.notes && <span className="block text-xs text-gray-500">{c.notes}</span>}
                </td>
                <td className={`${td} text-gray-700`}>{c.mode ?? "—"}</td>
                <td className={`${td} max-w-md break-all text-gray-700`}>
                  {c.trackingUrl ? (
                    <a href={c.trackingUrl.split("?")[0]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                      {c.trackingUrl}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-gray-400">None (no public tracking)</span>
                  )}
                </td>
                <td className={`${td} text-gray-700`}>{c.shipments || "—"}</td>
                {canManage && (
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <button className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Edit" onClick={() => setEditing(c)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Delete" onClick={() => remove(c)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage && (
        <Button variant="outline" onClick={() => setEditing({})}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add carrier
        </Button>
      )}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>{editing && <CarrierForm key={editing.scac ?? "new"} carrier={editing} onDone={() => (setEditing(null), router.refresh())} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function CarrierForm({ carrier, onDone }: { carrier: Partial<CarrierRow>; onDone: () => void }) {
  const [scac, setScac] = useState(carrier.scac ?? "");
  const [name, setName] = useState(carrier.name ?? "");
  const [mode, setMode] = useState(carrier.mode ?? "LTL");
  const [url, setUrl] = useState(carrier.trackingUrl ?? "");
  const [notes, setNotes] = useState(carrier.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = "mb-1.5 block text-sm font-medium text-gray-700";
  return (
    <>
      <DialogHeader>
        <DialogTitle>{carrier.id ? `Edit ${carrier.scac}` : "Add carrier"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="c-scac" className={label}>
              SCAC
            </label>
            <Input id="c-scac" value={scac} onChange={(e) => setScac(e.target.value.toUpperCase())} maxLength={4} disabled={Boolean(carrier.id)} />
          </div>
          <div className="col-span-2">
            <label htmlFor="c-name" className={label}>
              Carrier name
            </label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Estes Express Lines" />
          </div>
        </div>
        <div>
          <span className={label}>Mode</span>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger aria-label="Mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LTL">LTL</SelectItem>
              <SelectItem value="TL">TL</SelectItem>
              <SelectItem value="Parcel">Parcel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="c-url" className={label}>
            Tracking link
          </label>
          <Input id="c-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://carrier.example/track?pro={pro}" />
          <p className="mt-1 text-xs text-gray-500">
            The carrier&apos;s tracking page. Put <code>{"{pro}"}</code>, <code>{"{shipment}"}</code> (the TMS shipment #) or <code>{"{po}"}</code> where the carrier&apos;s link takes a number; when it isn&apos;t known the page opens without it. Leave empty for carriers with no public tracking.
          </p>
        </div>
        <div>
          <label htmlFor="c-notes" className={label}>
            Notes
          </label>
          <Input id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Track by BOL; dispatch 555-0100" />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
      <DialogFooter>
        <Button
          disabled={busy || !scac.trim() || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await apiFetch("/api/logistics/carriers", { method: "PUT", body: { scac, name, mode, trackingUrl: url || null, notes: notes || null } });
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't save");
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
