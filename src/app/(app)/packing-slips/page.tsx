import { requirePagePermission } from "@/lib/auth-guard";
import { lookupSlip, slipWarehouses } from "@/lib/packing-slip-data";
import { SlipEditor } from "./slip-editor";

export default async function PackingSlipsPage({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  await requirePagePermission("packingslips.use");
  const po = ((await searchParams).po ?? "").trim().slice(0, 40);
  const [warehouses, initial] = await Promise.all([slipWarehouses(), po ? lookupSlip(po) : null]);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Packing Slip Generator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter a PO to fill the slip in from Logistics (WMS lines, TMS shipment, warehouse) and THD&apos;s compliance data (Home Depot SKUs and descriptions). Check and edit anything, then download it as a PDF to
          print or as Excel.
        </p>
      </div>
      <SlipEditor key={po} warehouses={warehouses} initialPo={po} initial={initial} />
    </div>
  );
}
