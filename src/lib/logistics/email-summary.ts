// Pure helpers for the Logistics email log, safe in the browser.

import type { PoView, ShipmentView } from "@/lib/logistics/views";

/** Every PO and shipment an email concerns: the selection, plus the shipments of selected POs or the POs of selected shipments */
export function emailSubjects(kind: "po" | "shipment", pos: Pick<PoView, "poNumber" | "shipments">[], shipments: Pick<ShipmentView, "shipmentNumber" | "ourPos">[]) {
  const uniq = (xs: string[]) => [...new Set(xs)];
  if (kind === "po") return { selected: pos.map((p) => p.poNumber), poNumbers: uniq(pos.map((p) => p.poNumber)), shipmentNumbers: uniq(pos.flatMap((p) => p.shipments.map((s) => s.shipmentNumber))) };
  return { selected: shipments.map((s) => s.shipmentNumber), poNumbers: uniq(shipments.flatMap((s) => s.ourPos)), shipmentNumbers: uniq(shipments.map((s) => s.shipmentNumber)) };
}


/** Who it went to, in a few words: the team, else the first addresses */
export function recipientsSummary(e: { teamName: string | null; to: string[]; cc: string[] }) {
  const head = e.teamName ?? e.to.slice(0, 2).join(", ");
  const more = (e.teamName ? 0 : Math.max(0, e.to.length - 2)) + e.cc.length;
  return more ? `${head} +${more}` : head;
}

/** What it was about: "2 POs: 1191515251, 1191515201" */
export function selectionSummary(e: { kind: string; selected: string[] }, max = 3) {
  const noun = e.kind === "po" ? (e.selected.length === 1 ? "PO" : "POs") : e.selected.length === 1 ? "shipment" : "shipments";
  return `${e.selected.length} ${noun}: ${e.selected.slice(0, max).join(", ")}${e.selected.length > max ? "…" : ""}`;
}
