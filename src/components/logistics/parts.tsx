import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { upsTrackingUrl } from "@/lib/logistics/refs";
import { FLAGS, type Flag, type PoStatus } from "@/lib/logistics/views";

// Small pieces shared by the Logistics pages, the Issue Log and scorecards.

const STATUS_VARIANT: Record<PoStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "purple" | "outline"> = {
  Open: "outline",
  Scheduled: "secondary",
  Shipped: "purple",
  "In transit": "default",
  Delivered: "success",
  Canceled: "destructive",
};

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

/** A TMS shipment status as TMS writes it */
export function TmsStatusBadge({ status }: { status: string }) {
  const v = /^deliver/i.test(status) ? "success" : /^cancel/i.test(status) ? "destructive" : /transit|picked/i.test(status) ? "default" : /^available/i.test(status) ? "warning" : "secondary";
  return <Badge variant={v}>{status}</Badge>;
}

const SEVERITY_VARIANT = { high: "destructive", medium: "warning", info: "secondary" } as const;

/** Flag labels as badges; `withInfo` also shows the informational ones */
export function FlagBadges({ flags, withInfo = false, max = 3 }: { flags: Flag[]; withInfo?: boolean; max?: number }) {
  const shown = [...new Map(flags.filter((f) => withInfo || f.severity !== "info").map((f) => [f.code, f])).values()];
  if (!shown.length) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.slice(0, max).map((f) => (
        <Badge key={f.code} variant={SEVERITY_VARIANT[f.severity]} title={f.message}>
          {FLAGS[f.code].label}
        </Badge>
      ))}
      {shown.length > max && <span className="text-xs text-gray-500">+{shown.length - max}</span>}
    </span>
  );
}

/** Each flag with its explanation */
export function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <p className="text-sm text-gray-500">Nothing flagged.</p>;
  return (
    <ul className="space-y-2">
      {flags.map((f, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Badge variant={SEVERITY_VARIANT[f.severity]} className="shrink-0">
            {FLAGS[f.code].label}
          </Badge>
          <span className="text-gray-700">{f.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** The SCAC, linking to the carrier's tracking page in a new tab */
export function ScacLink({ scac, url, known }: { scac: string | null; url?: string | null; known?: boolean }) {
  if (!scac) return <span className="text-gray-400">—</span>;
  if (!url) return <span className="font-mono">{scac}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-blue-600 hover:underline" title={known === false ? `No tracking page set for ${scac}: searches the web (add it under Logistics › Carriers)` : `Track with ${scac}`}>
      {scac}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function UpsLink({ number }: { number: string }) {
  return (
    <a href={upsTrackingUrl(number)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-blue-600 hover:underline">
      {number}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function PoLink({ po, className }: { po: string; className?: string }) {
  return (
    <Link href={`/logistics/po/${encodeURIComponent(po)}`} className={cn("font-medium text-blue-600 hover:underline", className)}>
      {po}
    </Link>
  );
}

export function ShipmentLink({ number }: { number: string }) {
  return (
    <Link href={`/logistics/shipment/${encodeURIComponent(number)}`} className="font-medium text-blue-600 hover:underline">
      {number}
    </Link>
  );
}

export const LOGISTICS_TABS = [
  { key: "overview", label: "Overview" },
  { key: "pos", label: "POs" },
  { key: "shipments", label: "Shipments" },
  { key: "parcels", label: "UPS parcels" },
  { key: "imports", label: "Imports" },
  { key: "carriers", label: "Carriers" },
] as const;
export type LogisticsTab = (typeof LOGISTICS_TABS)[number]["key"];

export function LogisticsTabs({ tab }: { tab: LogisticsTab }) {
  return (
    <nav className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1" aria-label="Logistics views">
      {LOGISTICS_TABS.map((t) => (
        <Link
          key={t.key}
          href={`/logistics?tab=${t.key}`}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900")}
          aria-current={tab === t.key ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
