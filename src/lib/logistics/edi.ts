import { FLAGS, type Flag, type FlagCode, type PoView, type ShipmentView } from "@/lib/logistics/views";

export { parseAddresses } from "@/lib/email-address";

// Logistics › Send Email: the issue types an email can ask for, the one-line summary of each
// PO or shipment, and the draft email built from them. Pure (unit-tested) and safe in the browser.

export type SelectionKind = "po" | "shipment";
export const MAX_SELECTION = 200;

export interface EdiIssueType {
  key: string;
  label: string;
  /** What the email asks the team to do */
  request: string;
  /** Flags that suggest this type (pre-ticked when the selection has them) */
  flags: FlagCode[];
}

export const EDI_ISSUE_TYPES: EdiIssueType[] = [
  { key: "tms-id", label: "Correct the TMS shipment ID", request: "Correct the TMS shipment ID on the ASN and labels so it matches the shipment THD has the PO on.", flags: ["SUSPECT_TMS_ID", "TMS_ID_MISMATCH", "TMS_ID_NOT_FOUND"] },
  { key: "asn", label: "Send or resend the ASN", request: "Send (or resend) the ASN for these POs.", flags: ["NO_TMS_SHIPMENT"] },
  { key: "ship-to", label: "Correct the ship-to address", request: "Correct the ship-to address for these POs.", flags: ["WRONG_DESTINATION", "SHIP_TO_MISMATCH", "CITY_SPELLING"] },
  { key: "planex", label: "Confirm the destination in Vendor PlanEx", request: "These go to a THD crossdock: confirm the destination in Vendor PlanEx and that the ASN matches it.", flags: ["CHECK_PLANEX"] },
  { key: "cancel", label: "Cancel or close the PO", request: "Cancel or close these POs: THD shows them canceled.", flags: ["CANCELED_SHIPPED"] },
  { key: "status", label: "Check the shipment status in TMS", request: "Check and update the shipment status in TMS (pickup or delivery dates have passed).", flags: ["PICKUP_PASSED", "DELIVERY_OVERDUE", "NO_CARRIER"] },
  { key: "other", label: "Other (described below)", request: "See the note below.", flags: [] },
];

const flagLabels = (flags: Flag[]) => [...new Set(flags.filter((f) => f.severity !== "info").map((f) => FLAGS[f.code].label))];

/** One line per PO for the email and the dialog */
export function poLine(p: PoView): string {
  const shipments = p.shipments.map((s) => `TMS ${s.shipmentNumber}${s.scac ? ` (${s.scac})` : ""}`);
  const wmsIds = p.wmsTms.filter((id) => !p.shipments.some((s) => s.shipmentNumber === id));
  const flags = flagLabels(p.flags);
  return [
    `PO ${p.poNumber}`,
    p.warehouses?.length ? `from ${p.warehouses.map((w) => w.name).join(", ")}` : null,
    p.destination !== "—" ? `to ${p.destination}` : null,
    shipments.length ? shipments.join(", ") : p.ups.length ? `UPS ${p.ups.slice(0, 2).join(", ")}${p.ups.length > 2 ? "…" : ""}` : "no TMS shipment",
    wmsIds.length ? `WMS has TMS ID ${wmsIds.join(", ")}` : null,
    flags.length ? `flags: ${flags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One line per shipment for the email and the dialog */
export function shipmentLine(s: ShipmentView): string {
  const flags = flagLabels(s.flags);
  return [
    `Shipment ${s.shipmentNumber}`,
    s.scac ?? "no carrier",
    s.status,
    [s.destFacility, [s.destCity, s.destState].filter(Boolean).join(", ")].filter(Boolean).join(" ") || null,
    s.ourPos.length ? `PO${s.ourPos.length > 1 ? "s" : ""} ${s.ourPos.join(", ")}` : null,
    flags.length ? `flags: ${flags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Issue types the selection's flags point to */
export function suggestedTypes(flagCodes: string[]): string[] {
  return EDI_ISSUE_TYPES.filter((t) => t.flags.some((f) => flagCodes.includes(f))).map((t) => t.key);
}

/** The email as first drafted; people edit it before sending */
export function ediDraft({ kind, lines, poNumbers, types, sender, fileName, team }: { kind: SelectionKind; lines: string[]; poNumbers: string[]; types: string[]; sender: string; fileName: string; team?: string | null }) {
  const chosen = EDI_ISSUE_TYPES.filter((t) => types.includes(t.key));
  const noun = kind === "po" ? (lines.length === 1 ? "PO" : "POs") : lines.length === 1 ? "shipment" : "shipments";
  const subject = `Action needed: ${lines.length} ${noun}${chosen.length ? ` (${chosen.filter((t) => t.key !== "other").map((t) => t.label).join("; ") || "see note"})` : ""}`;
  const body = [
    greeting(team),
    "",
    `Please take action on the ${lines.length} ${noun} below.`,
    "",
    ...(chosen.length ? ["What's needed:", ...chosen.map((t) => `- ${t.request}`), ""] : []),
    `${kind === "po" ? "POs" : "Shipments"}:`,
    ...lines.map((l) => `- ${l}`),
    "",
    ...(kind === "shipment" && poNumbers.length ? [`PO numbers: ${poNumbers.join(", ")}`, ""] : []),
    `The attached report (${fileName}) has the details for each one.`,
    "",
    "Thanks,",
    sender,
  ].join("\n");
  return { subject: subject.slice(0, 250), body };
}

/** "Hi Ohio Shipping team," for the team picked, "Hi," without one */
function greeting(team?: string | null): string {
  const name = team?.trim();
  if (!name) return "Hi,";
  return /\bteam$/i.test(name) ? `Hi ${name},` : `Hi ${name} team,`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Plain text (the edited message) as email HTML that keeps its layout in Outlook, which ignores
 * `white-space: pre-wrap`: blank lines start paragraphs, lines starting "- " or "* " become a
 * bulleted list, and other line breaks are <br>.
 */
export function textToHtml(text: string): string {
  const font = "font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827";
  const out: string[] = [];
  let para: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p style="margin:0 0 12px 0;${font}">${para.join("<br>")}</p>`);
    if (items.length) out.push(`<ul style="margin:0 0 12px 0;padding-left:24px;${font}">${items.map((i) => `<li style="margin:0 0 4px 0">${i}</li>`).join("")}</ul>`);
    para = [];
    items = [];
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (bullet) {
      if (para.length) {
        out.push(`<p style="margin:0 0 4px 0;${font}">${para.join("<br>")}</p>`);
        para = [];
      }
      items.push(esc(bullet[1]));
    } else {
      if (items.length) flush();
      // Leading spaces kept (non-breaking), so indented lines stay indented
      para.push(esc(line).replace(/^ +/, (m) => "&nbsp;".repeat(m.length)));
    }
  }
  flush();
  return `<!doctype html><html><body style="${font}">${out.join("")}</body></html>`;
}
