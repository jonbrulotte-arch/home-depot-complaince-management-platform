import Link from "next/link";
import { requirePagePermission } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { loadLogistics } from "@/lib/logistics/data";
import { wmsReportUrl } from "@/lib/logistics/import";
import { LOGISTICS_KIND_LABELS } from "@/lib/logistics/parse";
import { upsConfigured } from "@/lib/logistics/ups";
import { getTimeZone } from "@/lib/time-zone-server";
import { formatDateTime } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LOGISTICS_TABS,
  LogisticsTabs,
  type LogisticsTab,
} from "@/components/logistics/parts";
import { CarrierEditor } from "./carrier-editor";
import { ImportPanel } from "./import-panel";
import { WmsSyncButton } from "./wms-sync-button";
import {
  ImportHistory,
  OverviewTab,
  ParcelsTab,
  PosTab,
  ShipmentsTab,
} from "./sections";

type Search = {
  add?: string;
  tab?: string;
  q?: string;
  status?: string;
  flag?: string;
  severity?: string;
  scac?: string;
  late?: string;
};

export default async function LogisticsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requirePagePermission("logistics.view");
  const sp = await searchParams;
  const canManage = user.permissions.has("logistics.manage");
  const tab: LogisticsTab = LOGISTICS_TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as LogisticsTab)
    : "overview";
  const [l, tz, lastSync, wmsUrl] = await Promise.all([
    loadLogistics(),
    getTimeZone(),
    prisma.logisticsImport.findFirst({
      where: { source: "WMS", fetched: true },
      orderBy: { importedAt: "desc" },
      select: { importedAt: true },
    }),
    wmsReportUrl(),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Logistics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every PO and shipment from the WMS and TMS (Logistics Gateway), tied
            together, with delivery problems flagged.{" "}
            {l.latestImports.length ? (
              <>
                Data as of{" "}
                {l.latestImports.map((i, k) => (
                  <span key={i.source}>
                    {k > 0 && " · "}
                    {LOGISTICS_KIND_LABELS[i.source]}{" "}
                    {formatDateTime(i.importedAt, tz)}
                  </span>
                ))}
                .
              </>
            ) : null}
          </p>
        </div>
        {canManage &&
          (wmsUrl ? (
            <WmsSyncButton
              lastSync={lastSync ? formatDateTime(lastSync.importedAt, tz) : null}
            />
          ) : (
            <p className="max-w-xs text-right text-xs text-gray-500">
              Set the WMS report link{" "}
              {user.permissions.has("admin.settings") ? (
                <Link href="/admin/settings#wms-report" className="text-blue-600 hover:underline">
                  in Admin › Settings
                </Link>
              ) : (
                "in Admin › Settings (an administrator)"
              )}{" "}
              to sync the WMS lines from it.
            </p>
          ))}
      </div>
      <LogisticsTabs tab={tab} />

      {l.empty && tab !== "imports" && tab !== "carriers" ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-500">
            No logistics data yet.{" "}
            {canManage
              ? "Press Sync WMS lines, and import the two TMS exports under Imports."
              : "Ask someone who manages logistics to sync the WMS lines and import the TMS files."}
          </CardContent>
        </Card>
      ) : tab === "overview" ? (
        <OverviewTab l={l} />
      ) : tab === "pos" ? (
        <PosTab
          l={l}
          filters={{
            q: sp.q,
            status: sp.status,
            flag: sp.flag,
            severity: sp.severity,
            scac: sp.scac,
          }}
          notes={l.notes.po}
        />
      ) : tab === "shipments" ? (
        <ShipmentsTab l={l} scac={sp.scac} late={sp.late === "1"} />
      ) : tab === "parcels" ? (
        <ParcelsTab
          l={l}
          upsReady={await upsConfigured()}
          canManage={canManage}
          tz={tz}
        />
      ) : tab === "imports" ? (
        <ImportsTab canManage={canManage} tz={tz} />
      ) : (
        <CarriersTab l={l} canManage={canManage} add={sp.add?.toUpperCase()} />
      )}
    </div>
  );
}

async function ImportsTab({
  canManage,
  tz,
}: {
  canManage: boolean;
  tz: string;
}) {
  const history = await prisma.logisticsImport.findMany({
    orderBy: { importedAt: "desc" },
    take: 50,
    include: { importedBy: { select: { name: true } } },
  });
  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Import</CardTitle>
            <CardDescription>
              The WMS report covers the last 60 days; the TMS files are exported
              from Logistics Gateway (Shipments and Purchase Orders, CSV).
              {(await wmsReportUrl())
                ? " Sync WMS lines (top right) retrieves the WMS report straight from its link (Admin › Settings)."
                : " Set the WMS report link under Admin › Settings to sync it with one button."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportPanel wmsLink={false} />
          </CardContent>
        </Card>
      )}
      <ImportHistory
        tz={tz}
        rows={history.map((h) => ({
          id: h.id,
          source: h.source,
          fileName: h.fileName,
          rows: h.rows,
          created: h.created,
          updated: h.updated,
          fetched: h.fetched,
          importedAt: h.importedAt,
          importedBy: h.importedBy?.name ?? null,
          skipped: Array.isArray(h.warnings) ? h.warnings.length : 0,
        }))}
      />
    </div>
  );
}

function CarriersTab({
  l,
  canManage,
  add,
}: {
  l: Awaited<ReturnType<typeof loadLogistics>>;
  canManage: boolean;
  add?: string;
}) {
  const counts = new Map<string, number>();
  for (const s of l.shipments)
    if (s.scac) counts.set(s.scac, (counts.get(s.scac) ?? 0) + 1);
  const known = new Set(l.carriers.map((c) => c.scac));
  return (
    <CarrierEditor
      canManage={canManage}
      add={add}
      carriers={l.carriers.map((c) => ({
        id: c.id,
        scac: c.scac,
        name: c.name,
        mode: c.mode,
        trackingUrl: c.trackingUrl,
        notes: c.notes,
        shipments: counts.get(c.scac) ?? 0,
      }))}
      unknown={[...counts.entries()]
        .filter(([s]) => !known.has(s))
        .map(([scac, shipments]) => ({ scac, shipments }))
        .sort((a, b) => b.shipments - a.shipments)}
    />
  );
}
