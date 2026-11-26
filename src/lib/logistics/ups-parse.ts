// The UPS Track API answer, reduced to what the platform keeps. Pure and unit-tested.

export interface UpsStatus {
  status: string | null;
  statusCode: string | null;
  statusType: string | null;
  delivered: boolean;
  deliveredAt: Date | null;
  expectedAt: Date | null;
  lastActivity: string | null;
  lastLocation: string | null;
  activityAt: Date | null;
  error: string | null;
}

/** "20261112" (+ "135400") → a UTC-labelled wall-clock Date */
const upsDate = (d?: string, t?: string) => {
  if (!d || !/^\d{8}$/.test(d)) return null;
  const tt = t && /^\d{6}$/.test(t) ? t : "000000";
  return new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +tt.slice(0, 2), +tt.slice(2, 4), +tt.slice(4, 6)));
};

type UpsActivity = { date?: string; time?: string; status?: { type?: string; description?: string; code?: string }; location?: { address?: { city?: string; stateProvince?: string; country?: string } } };
type UpsPackage = {
  currentStatus?: { description?: string; code?: string };
  activity?: UpsActivity[];
  deliveryDate?: { type?: string; date?: string }[];
  deliveryTime?: { endTime?: string; type?: string };
};

/** The parts of a Track API answer the platform keeps. Pure (unit-tested). */
export function parseUpsTrack(json: unknown): UpsStatus {
  const shipment = (json as { trackResponse?: { shipment?: { package?: UpsPackage[]; warnings?: { message?: string }[] }[] } })?.trackResponse?.shipment?.[0];
  const pkg = shipment?.package?.[0];
  if (!pkg) {
    const msg = shipment?.warnings?.[0]?.message ?? (json as { response?: { errors?: { message?: string }[] } })?.response?.errors?.[0]?.message ?? "UPS returned no tracking for this number";
    return { status: null, statusCode: null, statusType: null, delivered: false, deliveredAt: null, expectedAt: null, lastActivity: null, lastLocation: null, activityAt: null, error: msg };
  }
  const last = pkg.activity?.[0];
  const type = last?.status?.type ?? null;
  const delivered = type === "D" || /delivered/i.test(pkg.currentStatus?.description ?? "");
  const del = pkg.deliveryDate?.find((d) => d.type === "DEL");
  const expected = pkg.deliveryDate?.find((d) => d.type === "SDD" || d.type === "RDD" || d.type === "EDD");
  const addr = last?.location?.address;
  return {
    status: pkg.currentStatus?.description?.trim() || last?.status?.description?.trim() || null,
    statusCode: pkg.currentStatus?.code ?? last?.status?.code ?? null,
    statusType: type,
    delivered,
    deliveredAt: delivered ? (upsDate(del?.date, pkg.deliveryTime?.endTime) ?? upsDate(last?.date, last?.time)) : null,
    expectedAt: upsDate(expected?.date),
    lastActivity: last?.status?.description?.trim() ?? null,
    lastLocation: addr ? [addr.city, addr.stateProvince, addr.country].filter(Boolean).join(", ") || null : null,
    activityAt: upsDate(last?.date, last?.time),
    error: null,
  };
}
