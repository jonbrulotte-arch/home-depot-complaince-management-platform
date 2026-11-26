import type { PomLine, PomPo } from "@/lib/logistics/views";

// POM (THD's Purchase Order Management) as evidence for a compliance line: the PO's SKU line for the
// violation, and what it says about shipping and cancellation. Pure (unit-tested) and safe in the browser.

/** A compliance line's PO in POM, and its SKU line there */
export interface PomEvidence {
  poNumber: string;
  /** Open, Shipped (THD has the ASN) or Cancelled */
  poStatus: string;
  poCreateDate: string | null;
  /** POM's PO-level reason code */
  reasonCode: string | null;
  /** Where POM has it received: the final receiving location, else the destination DC */
  destination: string | null;
  crossDock: string | null;
  /** The SKU line for the violation's SKU; null when the PO has none for it */
  line: PomLine | null;
  /** The PO's other SKU lines */
  otherLines: PomLine[];
  /** Shipped in full (POM shipped quantity ≥ the adjusted order quantity), for Order Shipped Complete */
  shippedComplete: boolean | null;
  /** What POM shows, in a sentence */
  summary: string;
  /** What it means for a Fill Rate dispute, when there is something to say */
  hint: string | null;
}

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.trim().replace(/^0+/, "").toUpperCase() === b.trim().replace(/^0+/, "").toUpperCase());

/** The POM SKU line for a compliance line's SKU: by THD's SKU, else our SKU (SKU Part #) */
export function pomLineFor(pom: Pick<PomPo, "lines">, sku: { thdSku: string | null; vendorSku: string | null }): PomLine | null {
  return pom.lines.find((l) => same(l.thdSku, sku.thdSku)) ?? pom.lines.find((l) => same(l.partNumber, sku.vendorSku)) ?? null;
}

/** "SKU 1002977047 (our 41562)" */
export function pomSkuText(l: PomLine): string {
  return `SKU ${l.thdSku ?? "?"}${l.partNumber ? ` (our ${l.partNumber})` : ""}`;
}

/** POM's evidence for a compliance line */
export function pomEvidence(pom: PomPo, sku: { thdSku: string | null; vendorSku: string | null }): PomEvidence {
  const line = pomLineFor(pom, sku);
  const ordered = line ? (line.adjOrderQty ?? line.orderQty) : null;
  const cancelled = Boolean(line?.status && /^cancel/i.test(line.status));
  const shippedComplete = line && ordered !== null && line.shippedQty !== null && !cancelled ? line.shippedQty >= ordered && ordered > 0 : line ? false : null;
  let summary: string;
  let hint: string | null = null;
  if (!line) {
    summary = `POM has PO ${pom.poNumber} (${pom.status}) but no line for this SKU.`;
  } else {
    const adjusted = line.orderQty !== null && line.adjOrderQty !== null && line.adjOrderQty !== line.orderQty ? ` THD adjusted the order from ${line.orderQty} to ${line.adjOrderQty}.` : "";
    if (cancelled) {
      summary = `POM shows ${pomSkuText(line)} Cancelled: ${ordered ?? "?"} ordered, ${line.shippedQty ?? 0} shipped.${adjusted}`;
      hint = /^cancel/i.test(pom.status)
        ? "The whole PO is Cancelled in POM. If THD cancelled it, dispute the Fill Rate charge as PO/SKU Cancelled with THD's cancellation."
        : "POM doesn't say who cancelled the SKU. If THD cancelled it (buyer or PO change), dispute as PO/SKU Cancelled with that communication; if we cancelled it (no stock), it is a supplier cancellation and counts against Fill Rate.";
    } else {
      summary = `POM shows ${pomSkuText(line)} ${line.status ?? pom.status}: ${ordered ?? "?"} ordered, ${line.shippedQty ?? 0} shipped${line.receivedQty !== null ? `, ${line.receivedQty} received` : ""}.${adjusted}`;
      if (shippedComplete) hint = "POM shows it shipped complete: evidence for Order Shipped Complete.";
      else if (line.shippedQty && ordered && line.shippedQty < ordered) hint = `POM shows a short shipment (${line.shippedQty} of ${ordered}).`;
    }
  }
  return {
    poNumber: pom.poNumber,
    poStatus: pom.status,
    poCreateDate: pom.poCreateDate,
    reasonCode: pom.reasonCode,
    destination: pom.finalRecvLocation ?? pom.destinationDc,
    crossDock: pom.crossDock,
    line,
    otherLines: pom.lines.filter((l) => l !== line),
    shippedComplete,
    summary,
    hint,
  };
}

/** A sentence for the SPM dispute comment, from POM's numbers */
export function pomCommentText(e: PomEvidence): string | null {
  if (!e.line) return null;
  const ordered = e.line.adjOrderQty ?? e.line.orderQty;
  return `Per THD POM, PO ${e.poNumber} ${pomSkuText(e.line)} shows ${e.line.shippedQty ?? 0} of ${ordered ?? "?"} units shipped (status ${e.line.status ?? e.poStatus}).`;
}

/** Whether a dispute reason code is Order Shipped Complete (where POM's shipped quantity is evidence) */
export const isShippedCompleteCode = (code: string | null | undefined) => Boolean(code && /shipped\s+complete/i.test(code));
