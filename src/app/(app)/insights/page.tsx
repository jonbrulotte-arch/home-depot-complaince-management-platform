import Link from "next/link";
import { Download } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { fiscalLabel } from "@/lib/fiscal";
import { INSIGHT_TABS, isInsightTab, monthsBetween, type InsightTab } from "@/lib/insights";
import { loadInsights, type InsightFilters as Filters } from "@/lib/insights-data";
import { PERIOD_BASIS_LABELS } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InsightFilters } from "./insight-filters";
import { loadCancellations } from "@/lib/cancellations-data";
import { cancelFrame, filterCancellations } from "@/lib/cancellations";
import { CancellationsTab } from "./cancellations-tab";
import { DisputesTab, IssuesTab, LocationsTab, OverviewTab, ProgramsTab, TeamsTab, TimeTab, type Access } from "./sections";

type CancelParams = { source?: string; team?: string; dc?: string; sku?: string; scope?: string; dispute?: string; q?: string };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Filters & CancelParams & { tab?: string }> }) {
  const user = await requirePagePermission("insights.view");
  const sp = await searchParams;
  const tab: InsightTab = isInsightTab(sp.tab) ? sp.tab : "overview";
  const data = await loadInsights(sp);
  const field = data.field;
  const access: Access = { poLookup: user.permissions.has("view.polookup"), issues: user.permissions.has("issues.view") };

  // Months with data, newest first, for the custom range pickers
  const months = data.earliest && data.latest ? monthsBetween(data.earliest, data.latest).reverse().map((m) => ({ value: m, label: fiscalLabel(m) })) : [];

  const params = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab, range: data.frame.key, from: data.frame.key === "custom" ? String(data.frame.from) : undefined, to: data.frame.key === "custom" ? String(data.frame.to) : undefined, program: data.programCode, ...next })) if (v) p.set(k, v);
    return p.toString();
  };
  const programName = data.programs.find((p) => p.code === data.programCode)?.name;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports &amp; Insights</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.frame.label} · {programName ?? "all programs"} · months by {PERIOD_BASIS_LABELS[field === "fiscalMonth" ? "FISCAL_MONTH" : "RECEIVED_MONTH"].toLowerCase()}. Offsets are THD&apos;s charges on violations; net is offsets less
            what disputes recovered.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/insights/export?${params({ tab: undefined })}`}>
            <Download className="h-4 w-4 mr-1.5" />
            Export to Excel
          </a>
        </Button>
      </div>

      <InsightFilters tab={tab} range={data.frame.key} from={data.frame.from} to={data.frame.to} program={data.programCode ?? null} months={months} programs={data.programs} />

      <nav className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 w-fit" aria-label="Insights">
        {INSIGHT_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/insights?${params({ tab: t.key })}`}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", t.key === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900")}
            aria-current={t.key === tab ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {!data.frame.months.length && tab !== "cancellations" ? (
        <p className="text-sm text-gray-500">No compliance data has been imported yet.</p>
      ) : tab === "overview" ? (
        <OverviewTab data={data} />
      ) : tab === "programs" ? (
        <ProgramsTab data={data} />
      ) : tab === "time" ? (
        <TimeTab data={data} />
      ) : tab === "teams" ? (
        <TeamsTab data={data} />
      ) : tab === "issues" ? (
        <IssuesTab data={data} access={access} />
      ) : tab === "disputes" ? (
        <DisputesTab data={data} />
      ) : tab === "cancellations" ? (
        await (async () => {
          const all = await loadCancellations();
          const f = { source: sp.source, team: sp.team, dc: sp.dc, sku: sp.sku, scope: sp.scope, dispute: sp.dispute, q: sp.q };
          const rows = filterCancellations(all, { ...f, ...cancelFrame(data.frame), program: data.programCode });
          return <CancellationsTab rows={rows} all={all} filters={f} poLookup={access.poLookup} issues={access.issues} />;
        })()
      ) : (
        <LocationsTab data={data} access={access} />
      )}
    </div>
  );
}
