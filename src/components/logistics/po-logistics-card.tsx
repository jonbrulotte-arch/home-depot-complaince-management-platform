import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logisticsForPos } from "@/lib/logistics/data";
import { PoLink, PoStatusBadge, ScacLink, ShipmentLink, TmsStatusBadge, UpsLink } from "@/components/logistics/parts";

const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
const td = "px-4 py-2.5 text-sm align-top";
const SEV = { high: "destructive", medium: "warning", info: "secondary" } as const;

/** Logistics for a list of POs (an issue's): status, shipments with carrier links, UPS and flags. */
export async function PoLogisticsCard({ poNumbers }: { poNumbers: string[] }) {
  const found = await logisticsForPos(poNumbers);
  if (!poNumbers.length) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-gray-400" />
          Logistics
        </CardTitle>
        <p className="text-sm text-gray-500">
          {found.size ? `${found.size} of ${poNumbers.length} PO(s) in the WMS and TMS data.` : "None of these POs is in the WMS or TMS data imported so far."}
        </p>
      </CardHeader>
      {found.size > 0 && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["PO #", "Status", "Shipped (WMS)", "Shipments / tracking", "Flags"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...found.entries()].map(([typed, l]) => (
                  <tr key={typed} className="border-t border-gray-200">
                    <td className={td}>
                      <PoLink po={l.poNumber} />
                    </td>
                    <td className={td}>
                      <PoStatusBadge status={l.status} />
                    </td>
                    <td className={`${td} text-gray-700`}>{l.shipped ?? "—"}</td>
                    <td className={td}>
                      <span className="space-y-1">
                        {l.shipments.map((s) => (
                          <span key={s.number} className="flex flex-wrap items-center gap-1.5">
                            <ShipmentLink number={s.number} />
                            <ScacLink scac={s.scac} url={s.url} />
                            <TmsStatusBadge status={s.status} />
                            {s.delivery && <span className="text-xs text-gray-500">delivery {s.delivery}</span>}
                          </span>
                        ))}
                        {l.ups.slice(0, 3).map((u) => (
                          <span key={u} className="block">
                            <UpsLink number={u} />
                          </span>
                        ))}
                        {!l.shipments.length && !l.ups.length && <span className="text-gray-400">—</span>}
                      </span>
                    </td>
                    <td className={td}>
                      {l.flags.length ? (
                        <ul className="space-y-1">
                          {l.flags.map((f, i) => (
                            <li key={i} className="text-xs text-gray-700">
                              <Badge variant={SEV[f.severity as keyof typeof SEV]} className="mr-1.5">
                                {f.label}
                              </Badge>
                              {f.message}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
