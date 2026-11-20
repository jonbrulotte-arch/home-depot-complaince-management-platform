import type { Permission } from "@/lib/permissions";
import type { ScorecardData } from "@/lib/scorecard";
import { issuesForPoNumbers } from "@/lib/issues-data";
import { logisticsForPos } from "@/lib/logistics/data";

// Live context for a scorecard's violations, shown on the in-app scorecard pages only: the PO's
// logistics (Logistics module) and the Issue Log issues that list it. Like Scorecard Feedback it is
// attached when the page is shown and never stored, so the published snapshot doesn't change; the
// public pages and the PDF/Excel downloads don't include it.

export async function withPoContext(data: ScorecardData, permissions: Set<Permission>): Promise<ScorecardData> {
  const pos = [...new Set(data.violations.map((v) => v.poNumber?.trim()).filter((p): p is string => Boolean(p)))];
  if (!pos.length) return data;
  const [logistics, issues] = await Promise.all([
    permissions.has("logistics.view") ? logisticsForPos(pos) : null,
    permissions.has("issues.view") ? issuesForPoNumbers(pos) : null,
  ]);
  if (!logistics?.size && !issues?.size) return data;
  return {
    ...data,
    violations: data.violations.map((v) => {
      const po = v.poNumber?.trim();
      if (!po) return v;
      const l = logistics?.get(po);
      const i = issues?.get(po.toUpperCase());
      return {
        ...v,
        ...(l ? { logistics: { poNumber: l.poNumber, status: l.status, shipped: l.shipped, shipments: l.shipments.map((s) => ({ number: s.number, scac: s.scac, url: s.url, status: s.status })), ups: l.ups, flags: l.flags } } : {}),
        ...(i?.length ? { issues: i.map((x) => ({ id: x.id, number: x.number, title: x.title, status: x.status })) } : {}),
      };
    }),
  };
}
