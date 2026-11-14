import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { LOGISTICS_KIND_LABELS, type LogisticsKind } from "@/lib/logistics/parse";
import { readLogisticsFile } from "@/lib/logistics/read";

// Saves logistics files: each source is upserted by its key (carton label, shipment number, PO
// number), so files can be imported again and overlap (the WMS report covers the last 60 days).
// Rows missing from a later file are kept: the history outlives the report's window.

export interface ImportResult {
  importId: string;
  kind: LogisticsKind;
  label: string;
  fileName: string;
  rows: number;
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
}

const CHUNK = 200;
async function inChunks<T>(items: T[], fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += CHUNK) await fn(items.slice(i, i + CHUNK));
}

export async function importLogisticsFile(bytes: Uint8Array, fileName: string, userId: string | null, opts: { fetched?: boolean } = {}): Promise<ImportResult> {
  const file = await readLogisticsFile(bytes);
  const log = await prisma.logisticsImport.create({
    data: { source: file.kind, fileName: fileName.slice(0, 200), rows: file.parsed.rows.length, created: 0, updated: 0, fetched: Boolean(opts.fetched), importedById: userId },
  });
  let created = 0;
  let updated = 0;

  if (file.kind === "WMS") {
    // The last row for a carton line wins when a file repeats one
    const rows = [...new Map(file.parsed.rows.map((r) => [r.lineKey, r])).values()];
    const existing = new Set((await prisma.wmsCarton.findMany({ where: { lineKey: { in: rows.map((r) => r.lineKey) } }, select: { lineKey: true } })).map((r) => r.lineKey));
    const data = (r: (typeof rows)[number]) => ({ ...r, importId: log.id });
    await inChunks(
      rows.filter((r) => !existing.has(r.lineKey)),
      (c) => prisma.wmsCarton.createMany({ data: c.map(data), skipDuplicates: true }),
    );
    await inChunks(
      rows.filter((r) => existing.has(r.lineKey)),
      (c) => prisma.$transaction(c.map((r) => prisma.wmsCarton.update({ where: { lineKey: r.lineKey }, data: data(r) }))),
    );
    created = rows.filter((r) => !existing.has(r.lineKey)).length;
    updated = rows.length - created;
  } else if (file.kind === "TMS_SHIPMENTS") {
    const rows = [...new Map(file.parsed.rows.map((r) => [r.shipmentNumber, r])).values()];
    const existing = new Set((await prisma.tmsShipment.findMany({ where: { shipmentNumber: { in: rows.map((r) => r.shipmentNumber) } }, select: { shipmentNumber: true } })).map((r) => r.shipmentNumber));
    const data = ({ pickup, delivery, raw, ...r }: (typeof rows)[number]) => ({
      ...r,
      pickupAt: pickup?.at ?? null,
      pickupLocal: pickup?.local ?? null,
      deliveryAt: delivery?.at ?? null,
      deliveryLocal: delivery?.local ?? null,
      raw: raw as Prisma.InputJsonObject,
      importId: log.id,
    });
    await inChunks(rows.filter((r) => !existing.has(r.shipmentNumber)), (c) => prisma.tmsShipment.createMany({ data: c.map(data), skipDuplicates: true }));
    await inChunks(rows.filter((r) => existing.has(r.shipmentNumber)), (c) => prisma.$transaction(c.map((r) => prisma.tmsShipment.update({ where: { shipmentNumber: r.shipmentNumber }, data: data(r) }))));
    created = rows.filter((r) => !existing.has(r.shipmentNumber)).length;
    updated = rows.length - created;
  } else {
    const rows = [...new Map(file.parsed.rows.map((r) => [r.poNumber, r])).values()];
    const existing = new Set((await prisma.tmsPurchaseOrder.findMany({ where: { poNumber: { in: rows.map((r) => r.poNumber) } }, select: { poNumber: true } })).map((r) => r.poNumber));
    const data = ({ raw, ...r }: (typeof rows)[number]) => ({ ...r, raw: raw as Prisma.InputJsonObject, importId: log.id });
    await inChunks(rows.filter((r) => !existing.has(r.poNumber)), (c) => prisma.tmsPurchaseOrder.createMany({ data: c.map(data), skipDuplicates: true }));
    await inChunks(rows.filter((r) => existing.has(r.poNumber)), (c) => prisma.$transaction(c.map((r) => prisma.tmsPurchaseOrder.update({ where: { poNumber: r.poNumber }, data: data(r) }))));
    created = rows.filter((r) => !existing.has(r.poNumber)).length;
    updated = rows.length - created;
  }

  const skipped = file.parsed.skipped;
  await prisma.logisticsImport.update({ where: { id: log.id }, data: { created, updated, warnings: skipped.length ? (skipped.slice(0, 200) as unknown as Prisma.InputJsonArray) : undefined } });
  await audit(userId, "logistics.import", "LogisticsImport", log.id, { file: fileName, source: file.kind, rows: file.parsed.rows.length, created, updated, skipped: skipped.length, fetched: Boolean(opts.fetched) });
  return { importId: log.id, kind: file.kind, label: LOGISTICS_KIND_LABELS[file.kind], fileName, rows: file.parsed.rows.length, created, updated, skipped };
}

/** The WMS report link set under Admin › Settings, or null when it isn't set. */
export async function wmsReportUrl(): Promise<string | null> {
  const s = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { wmsReportUrl: true } });
  return s?.wmsReportUrl?.trim() || null;
}

/** A WMS report link must be an http(s) address; null when it isn't. */
export function cleanReportUrl(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Pulls the WMS report from its link and imports it. */
export async function fetchWmsReport(userId: string | null): Promise<ImportResult> {
  const url = await wmsReportUrl();
  if (!url) throw new Error("The WMS report link isn't set (Admin › Settings › WMS report link)");
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), cache: "no-store" }).catch((e: Error) => {
    throw new Error(`Couldn't reach the WMS report at ${url} (${e.message}). Check that the server can reach it.`);
  });
  if (!res.ok) throw new Error(`The WMS report answered ${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength) throw new Error("The WMS report came back empty");
  const result = await importLogisticsFile(bytes, `WMS sync ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, userId, { fetched: true });
  if (result.kind !== "WMS") throw new Error("The WMS report link returned a file that isn't the WMS shipped-lines report");
  return result;
}
