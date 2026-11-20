import type { DisputeStatus } from "@prisma/client";

// Disputes › Send Email: what an email about disputes can ask for, one line per dispute, and the
// drafted email. Pure (unit-tested) and safe in the browser; the window itself is EmailComposer.

export const MAX_DISPUTE_SELECTION = 200;

export interface DisputeRequest {
  key: string;
  label: string;
  /** What the email asks for */
  request: string;
}

export const DISPUTE_REQUESTS: DisputeRequest[] = [
  { key: "docs", label: "Send the supporting documents", request: "Send the supporting documents each dispute needs (listed for each PO in the attached report)." },
  { key: "pod", label: "Send the proof of delivery", request: "Send the signed proof of delivery for these POs." },
  { key: "bol", label: "Send the bill of lading", request: "Send the signed bill of lading for these POs." },
  { key: "shipped", label: "Confirm what shipped", request: "Confirm what shipped on these POs: quantities, ship dates and carrier." },
  { key: "cause", label: "Explain what happened", request: "Tell us what caused these violations, so we can dispute them or keep them from happening again." },
  { key: "outcome", label: "Share THD's decision", request: "For your information: THD has decided these disputes (see each one below)." },
  { key: "other", label: "Other (described below)", request: "See the note below." },
];

export interface DisputeEmailItem {
  poNumber: string | null;
  program: string;
  metric: string;
  amountDisputed: number;
  status: DisputeStatus;
  statusLabel: string;
  reasonCode: string | null;
  requiredDocs: string | null;
  /** Checklist items still open */
  openItems: number;
  /** e.g. "SKU 41562" */
  item: string | null;
  /** THD's decision code and amount recovered, once decided */
  decision: string | null;
}

const DECIDED: DisputeStatus[] = ["APPROVED", "PARTIAL", "DENIED"];

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** One line per dispute for the email */
export function disputeLine(d: DisputeEmailItem): string {
  return [
    `PO ${d.poNumber ?? "(none)"}`,
    `${d.program} ${d.metric}`,
    d.item,
    `${money(d.amountDisputed)} disputed`,
    d.reasonCode ? `reason: ${d.reasonCode}` : null,
    !DECIDED.includes(d.status) && d.requiredDocs ? `needs: ${d.requiredDocs}` : null,
    DECIDED.includes(d.status) ? `THD: ${d.statusLabel}${d.decision ? ` (${d.decision})` : ""}` : d.statusLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Requests the selection points to: documents while disputes are being prepared, the decision once decided */
export function suggestedDisputeRequests(items: Pick<DisputeEmailItem, "status" | "openItems">[]): string[] {
  const out: string[] = [];
  if (items.some((d) => (d.status === "PREPARING" || d.status === "READY") && d.openItems > 0)) out.push("docs");
  if (items.some((d) => DECIDED.includes(d.status))) out.push("outcome");
  return out;
}

/** "Hi Ohio Shipping team," for the team picked, "Hi," without one */
function greeting(team?: string | null): string {
  const name = team?.trim();
  if (!name) return "Hi,";
  return /\bteam$/i.test(name) ? `Hi ${name},` : `Hi ${name} team,`;
}

/** The email as first drafted; people edit it before sending */
export function disputeDraft({
  items,
  types,
  sender,
  fileName,
  reportTitle,
  windowCloses,
  team,
}: {
  items: DisputeEmailItem[];
  types: string[];
  sender: string;
  fileName: string;
  reportTitle: string;
  /** The SPM dispute window's last day, as shown (e.g. 12/08/2026) */
  windowCloses: string | null;
  team?: string | null;
}) {
  const chosen = DISPUTE_REQUESTS.filter((t) => types.includes(t.key));
  const n = items.length;
  const noun = n === 1 ? "PO" : "POs";
  const onlyOutcome = chosen.length > 0 && chosen.every((t) => t.key === "outcome");
  const labels = chosen.filter((t) => t.key !== "other").map((t) => t.label);
  const subject = onlyOutcome ? `Dispute update: ${n} ${noun} (${reportTitle})` : `Dispute support needed: ${n} ${noun}${labels.length ? ` (${labels.join("; ")})` : ""}`;
  const open = items.some((d) => !DECIDED.includes(d.status) && d.status !== "WITHDRAWN");
  const body = [
    greeting(team),
    "",
    onlyOutcome
      ? `Here is where the disputes on these ${n} ${noun} from the ${reportTitle} stand.`
      : `We're disputing THD's compliance chargebacks on the ${n} ${noun} below (${reportTitle}) and need your help.`,
    "",
    ...(chosen.length ? ["What's needed:", ...chosen.map((t) => `- ${t.request}`), ""] : []),
    "Disputes:",
    ...items.map((d) => `- ${disputeLine(d)}`),
    "",
    ...(open && windowCloses && !onlyOutcome ? [`THD's dispute window closes ${windowCloses}, so please reply as soon as you can.`, ""] : []),
    `The attached report (${fileName}) has the details for each one.`,
    "",
    "Thanks,",
    sender,
  ].join("\n");
  return { subject: subject.slice(0, 250), body };
}

export function disputeReportFileName(count: number, today: string) {
  return `Dispute_Report_${count}_${count === 1 ? "PO" : "POs"}_${today}.pdf`;
}
