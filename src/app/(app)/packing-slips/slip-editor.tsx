"use client";

import { useState } from "react";
import { Database, Download, FileSpreadsheet, Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/client-api";
import { emptySlip, MAX_SLIP_ITEMS, slipFileName, totalUnits, type PackingSlip, type SlipItem } from "@/lib/packing-slip";
import type { SlipLookup, WarehouseOption } from "@/lib/packing-slip-data";

const label = "block text-xs font-medium text-gray-500 mb-1";
const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
const OTHER = "__other";

const blankItem = (): SlipItem => ({ thdSku: "", vendorSku: "", description: "", units: 0 });

function Field({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
      </label>
      {children}
    </div>
  );
}

export function SlipEditor({ warehouses, initialPo, initial }: { warehouses: WarehouseOption[]; initialPo: string; initial: SlipLookup | null }) {
  const start = (l: SlipLookup | null): PackingSlip => (l ? { ...l.slip, items: l.slip.items.length ? l.slip.items : [blankItem()] } : { ...emptySlip(), poNumber: initialPo, items: [blankItem()] });
  const [slip, setSlip] = useState<PackingSlip>(() => start(initial));
  const [warehouse, setWarehouse] = useState<string>(initial?.warehouse ?? OTHER);
  const [sources, setSources] = useState<SlipLookup["sources"] | null>(initial?.sources ?? null);
  const [lookup, setLookup] = useState(initialPo);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(
    initialPo && !initial ? { kind: "error", text: `Nothing in Logistics or THD's compliance data has PO ${initialPo}. Fill the slip in by hand.` } : null,
  );
  const [busy, setBusy] = useState<"lookup" | "pdf" | "xlsx" | null>(null);

  const set = <K extends keyof PackingSlip>(key: K, value: PackingSlip[K]) => setSlip((s) => ({ ...s, [key]: value }));
  const setItem = (i: number, patch: Partial<SlipItem>) => setSlip((s) => ({ ...s, items: s.items.map((it, n) => (n === i ? { ...it, ...patch } : it)) }));

  async function fill() {
    const po = lookup.trim();
    if (!po) return;
    setBusy("lookup");
    setMessage(null);
    try {
      const found = await apiFetch<SlipLookup>(`/api/packing-slips/lookup?po=${encodeURIComponent(po)}`);
      setSlip(start(found));
      setWarehouse(found.warehouse ?? OTHER);
      setSources(found.sources);
      window.history.replaceState(null, "", `/packing-slips?po=${encodeURIComponent(found.slip.poNumber)}`);
    } catch (e) {
      setSources(null);
      setSlip((s) => ({ ...s, poNumber: po.toUpperCase() }));
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not look the PO up" });
    } finally {
      setBusy(null);
    }
  }

  function clear() {
    setSlip({ ...emptySlip(), items: [blankItem()] });
    setWarehouse(OTHER);
    setSources(null);
    setLookup("");
    setMessage(null);
    window.history.replaceState(null, "", "/packing-slips");
  }

  function pickWarehouse(prefix: string) {
    setWarehouse(prefix);
    const w = warehouses.find((x) => x.prefix === prefix);
    if (w) setSlip((s) => ({ ...s, originName: w.shipFromName, originAddress: w.address }));
  }

  async function download(format: "pdf" | "xlsx") {
    setBusy(format);
    setMessage(null);
    try {
      const res = await fetch("/api/packing-slips/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slip, format }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Download failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = slipFileName(slip.poNumber, format);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (slip.destFacility && slip.destName && slip.destAddress) setMessage({ kind: "info", text: `Downloaded. The address for ${slip.destFacility} is saved for the next slip to it.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Download failed" });
    } finally {
      setBusy(null);
    }
  }

  const filled = slip.items.filter((i) => i.thdSku || i.vendorSku || i.description || i.units);
  const canDownload = Boolean(slip.poNumber.trim()) && filled.length > 0 && !busy;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void fill();
            }}
          >
            <div className="w-full max-w-xs">
              <label htmlFor="slip-lookup" className={label}>
                PO number
              </label>
              <Input id="slip-lookup" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="e.g. 41562087" className="font-mono" maxLength={40} autoFocus={!initialPo} />
            </div>
            <Button type="submit" disabled={!lookup.trim() || busy !== null}>
              {busy === "lookup" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              Fill from data
            </Button>
            <Button type="button" variant="outline" onClick={clear} disabled={busy !== null}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Clear
            </Button>
            {sources && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 sm:ml-auto">
                <Database className="h-4 w-4 text-gray-400" />
                Filled from
                {sources.logistics && <Badge variant="secondary">Logistics</Badge>}
                {sources.compliance && <Badge variant="secondary">THD compliance data</Badge>}
                {sources.pom && <Badge variant="secondary">POM</Badge>}
                {sources.addressBook && <Badge variant="secondary">Saved address</Badge>}
              </div>
            )}
          </form>
          {message && (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{message.text}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="slip-po" title="PO Number">
            <Input id="slip-po" value={slip.poNumber} onChange={(e) => set("poNumber", e.target.value)} className="font-mono" maxLength={40} />
          </Field>
          <Field id="slip-po-date" title="PO Date">
            <Input id="slip-po-date" type="date" value={slip.poDate} onChange={(e) => set("poDate", e.target.value)} />
          </Field>
          <Field id="slip-ship-date" title="Ship Date">
            <Input id="slip-ship-date" type="date" value={slip.shipDate} onChange={(e) => set("shipDate", e.target.value)} />
          </Field>
          <Field id="slip-shipment" title="Shipment ID">
            <Input id="slip-shipment" value={slip.shipmentId} onChange={(e) => set("shipmentId", e.target.value)} className="font-mono" maxLength={60} />
          </Field>
          <Field id="slip-carrier" title="Carrier">
            <Input id="slip-carrier" value={slip.carrier} onChange={(e) => set("carrier", e.target.value)} maxLength={80} />
          </Field>
          <Field id="slip-cartons" title="Cartons">
            <Input id="slip-cartons" value={slip.cartons} onChange={(e) => set("cartons", e.target.value)} maxLength={20} />
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ship From</CardTitle>
            <CardDescription>Warehouses and their addresses are set under Admin › Settings › Warehouses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="slip-warehouse" title="Warehouse">
              <Select value={warehouse} onValueChange={pickWarehouse}>
                <SelectTrigger id="slip-warehouse">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.prefix} value={w.prefix}>
                      {w.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Other (type it below)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="slip-origin-name" title="Name">
              <Input id="slip-origin-name" value={slip.originName} onChange={(e) => set("originName", e.target.value)} maxLength={120} />
            </Field>
            <Field id="slip-origin-address" title="Address">
              <Textarea id="slip-origin-address" value={slip.originAddress} onChange={(e) => set("originAddress", e.target.value)} rows={3} maxLength={500} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ship To</CardTitle>
            <CardDescription>Filled in from the WMS ship-to (Store/DC #, name and address). An address you type is saved for the Store/DC # when you download, for slips the WMS has no address for.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="slip-facility" title="Store / DC #">
              <Input id="slip-facility" value={slip.destFacility} onChange={(e) => set("destFacility", e.target.value)} className="font-mono" maxLength={20} />
            </Field>
            <Field id="slip-dest-name" title="Name">
              <Input id="slip-dest-name" value={slip.destName} onChange={(e) => set("destName", e.target.value)} maxLength={120} />
            </Field>
            <Field id="slip-dest-address" title="Address">
              <Textarea id="slip-dest-address" value={slip.destAddress} onChange={(e) => set("destAddress", e.target.value)} rows={3} maxLength={500} placeholder={"Street\nCity, ST ZIP"} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>One row per product, with the units shipped (from the WMS lines) or ordered (from THD&apos;s data when nothing has shipped yet).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className={`${th} w-10`}>#</th>
                  <th className={`${th} w-44`}>Home Depot SKU #</th>
                  <th className={`${th} w-40`}>Our SKU</th>
                  <th className={th}>Description</th>
                  <th className={`${th} w-28 text-right`}>Units</th>
                  <th className={`${th} w-12`} />
                </tr>
              </thead>
              <tbody>
                {slip.items.map((it, i) => (
                  <tr key={i} className="border-t border-gray-200">
                    <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Input aria-label={`Item ${i + 1} Home Depot SKU`} value={it.thdSku} onChange={(e) => setItem(i, { thdSku: e.target.value })} className="font-mono" maxLength={40} />
                    </td>
                    <td className="px-3 py-2">
                      <Input aria-label={`Item ${i + 1} our SKU`} value={it.vendorSku} onChange={(e) => setItem(i, { vendorSku: e.target.value })} className="font-mono" maxLength={40} />
                    </td>
                    <td className="px-3 py-2">
                      <Input aria-label={`Item ${i + 1} description`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} maxLength={300} />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Item ${i + 1} units`}
                        type="number"
                        min={0}
                        value={it.units || ""}
                        onChange={(e) => setItem(i, { units: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        className="text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => setSlip((s) => ({ ...s, items: s.items.length > 1 ? s.items.filter((_, n) => n !== i) : [blankItem()] }))}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-3 py-2">
                    <Button type="button" size="sm" variant="outline" disabled={slip.items.length >= MAX_SLIP_ITEMS} onClick={() => setSlip((s) => ({ ...s, items: [...s.items, blankItem()] }))}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add item
                    </Button>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{totalUnits(slip.items).toLocaleString("en-US")}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">total</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea aria-label="Notes" value={slip.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={2000} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!filled.length && <span className="text-sm text-gray-500">Add at least one item to download.</span>}
        <Button variant="outline" disabled={!canDownload} onClick={() => void download("xlsx")}>
          {busy === "xlsx" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}
          Export to Excel
        </Button>
        <Button disabled={!canDownload} onClick={() => void download("pdf")}>
          {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
          Download PDF
        </Button>
      </div>
    </div>
  );
}
