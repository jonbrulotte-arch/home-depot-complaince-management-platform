import { localDateOf } from "@/lib/logistics/parse";
import { matchesWarehouse, warehouseRank, warehousesOf, type WarehouseInfo } from "@/lib/logistics/warehouses";
import { channelsOf, matchesChannel, type ChannelInfo } from "@/lib/logistics/channels";
import { cartonRefs } from "@/lib/logistics/refs";
import { addressLines, facilityIndex, facilityKey, poShipTo, type ShipTo } from "@/lib/logistics/ship-to";

// Logistics views: every PO and TMS shipment with the WMS cartons, TMS records and UPS tracking
// tied together, a status, and flags for what needs looking at. Pure and unit-tested; data.ts
// loads the rows.

export interface Carton {
  lineKey?: string;
  label: string;
  poNumber: string;
  orderNum: string;
  /** The WMS OrderNumber, whose prefix tells the warehouse ("3-…" is Site 3) */
  orderNumber?: string | null;
  customer: string | null;
  trackingNumber: string | null;
  secondTrack: string | null;
  product: string | null;
  quantity: number | null;
  shippedAt: Date;
  /** The WMS ship-to: Store/DC number, name and street lines (newer WMS reports) */
  shipTo?: string | null;
  shipName?: string | null;
  shipAddress1?: string | null;
  shipAddress2?: string | null;
  shipAddress3?: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
}

export interface Shipment {
  shipmentNumber: string;
  status: string;
  scac: string | null;
  pickupAt: Date | null;
  pickupLocal: string | null;
  deliveryAt: Date | null;
  deliveryLocal: string | null;
  originFacility: string | null;
  originCity: string | null;
  originState: string | null;
  destFacility: string | null;
  destCity: string | null;
  destState: string | null;
  poNumbers: string[];
  appointment: string | null;
  tmsFlags: string[];
  /** The SCAC as TMS has it, when it was changed (an RG shipment whose POs went UPS shows UPSN) */
  tmsScac?: string | null;
}

export interface TmsPo {
  poNumber: string;
  status: string;
  originFacility: string | null;
  originCity: string | null;
  originState: string | null;
  destFacility: string | null;
  destCity: string | null;
  destState: string | null;
  appointment: string | null;
  tmsFlags: string[];
}

export interface Parcel {
  trackingNumber: string;
  status: string | null;
  statusType: string | null;
  delivered: boolean;
  deliveredAt: Date | null;
  expectedAt: Date | null;
  lastActivity: string | null;
  lastLocation: string | null;
  activityAt: Date | null;
  checkedAt: Date | null;
  error: string | null;
}

export type Severity = "high" | "medium" | "info";

export const FLAGS = {
  CANCELED_SHIPPED: { severity: "high", label: "Canceled PO shipped" },
  CANCELED_BY_ISSUE: { severity: "info", label: "Canceled (Issue Log)" },
  NO_TMS_SHIPMENT: { severity: "high", label: "No TMS shipment" },
  SUSPECT_TMS_ID: { severity: "high", label: "Invalid TMS ID" },
  TMS_ID_MISMATCH: { severity: "high", label: "TMS ID mismatch" },
  WRONG_DESTINATION: { severity: "high", label: "Wrong destination" },
  SHIP_TO_MISMATCH: { severity: "high", label: "Ship-to Store/DC differs" },
  DELIVERY_OVERDUE: { severity: "high", label: "Delivery overdue" },
  PICKUP_PASSED: { severity: "high", label: "Pickup date passed" },
  UPS_EXCEPTION: { severity: "high", label: "UPS exception" },
  TMS_ID_NOT_FOUND: { severity: "medium", label: "TMS ID not in TMS file" },
  MULTIPLE_SHIPMENTS: { severity: "info", label: "On several shipments" },
  SHIPPED_AFTER_PICKUP: { severity: "medium", label: "Shipped after pickup date" },
  NO_CARRIER: { severity: "medium", label: "No carrier" },
  UPS_LATE: { severity: "medium", label: "UPS past expected date" },
  CITY_SPELLING: { severity: "medium", label: "Ship-to city misspelled" },
  ORIGIN_MISMATCH: { severity: "info", label: "Different ship-from" },
  NOT_IN_TMS: { severity: "info", label: "PO not in TMS file" },
  CHECK_PLANEX: { severity: "high", label: "Check destination in PlanEx" },
  CROSSDOCK: { severity: "info", label: "Crossdock (IFC)" },
  ASN_RECEIVED: { severity: "info", label: "ASN received (POM)" },
  DATES_REVERSED: { severity: "info", label: "Delivery before pickup" },
  TMS_FLAGGED: { severity: "info", label: "TMS errors or alerts" },
} as const satisfies Record<string, { severity: Severity; label: string }>;

export type FlagCode = keyof typeof FLAGS;
export interface Flag {
  code: FlagCode;
  severity: Severity;
  message: string;
}
/** A flag at its usual priority, or another where the situation calls for it */
const flag = (code: FlagCode, message: string, severity: Severity = FLAGS[code].severity): Flag => ({ code, severity, message });
const SEVERITY_ORDER: Severity[] = ["high", "medium", "info"];
const bySeverity = (a: Flag, b: Flag) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);

export type PoStatus = "Canceled" | "Delivered" | "In transit" | "Shipped" | "Scheduled" | "Open";
export const PO_STATUSES: PoStatus[] = ["Open", "Scheduled", "Shipped", "In transit", "Delivered", "Canceled"];

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
/** A THD crossdock (IFC): its facility ID starts with XD */
export const isCrossdock = (facility: string | null | undefined) => /^XD/i.test(facility?.trim() ?? "");
/** Newest PO first: by number (numbers of different lengths by length), as THD numbers POs in creation order */
export function byPoNumberDesc(a: { poNumber: string }, b: { poNumber: string }): number {
  const x = bareNumber(a.poNumber), y = bareNumber(b.poNumber);
  return y.length - x.length || (y < x ? -1 : y > x ? 1 : 0);
}
/** A PO number without leading zeros, for matching numbers typed elsewhere */
const bareNumber = (po: string) => po.trim().toUpperCase().replace(/^0+(?=\d)/, "");
/** The SCAC of UPS (parcel) */
export const UPS_SCAC = "UPSN";
const isCanceled = (status: string) => /^cancel/i.test(status);
const isDelivered = (status: string) => /^deliver/i.test(status);
const isMoving = (status: string) => /transit|picked|dispatch|out for/i.test(status);
const notYetMoving = (status: string) => /^(available|tendered|accepted|planned|booked|assigned|created)/i.test(status);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
/** Edit distance, for telling a misspelled city from a different one */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}
const place = (facility: string | null, city: string | null, state: string | null) => [facility, [city, state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—";

/** Flags of a shipment by itself */
function shipmentFlags(s: Shipment, today: string): Flag[] {
  const out: Flag[] = [];
  const pickup = localDateOf(s.pickupLocal);
  const delivery = localDateOf(s.deliveryLocal);
  if (isCanceled(s.status)) return out;
  if (!s.scac) out.push(flag("NO_CARRIER", `TMS shipment ${s.shipmentNumber} has no carrier assigned (${s.status}).`));
  if (!isDelivered(s.status) && delivery && delivery < today) out.push(flag("DELIVERY_OVERDUE", `Shipment ${s.shipmentNumber} was due for delivery on ${delivery}; TMS still shows ${s.status}.`));
  else if (notYetMoving(s.status) && pickup && pickup < today) out.push(flag("PICKUP_PASSED", `Pickup for shipment ${s.shipmentNumber} was ${pickup}; TMS still shows ${s.status}.`));
  if (pickup && delivery && delivery < pickup) out.push(flag("DATES_REVERSED", `Shipment ${s.shipmentNumber} shows delivery (${delivery}) before pickup (${pickup}).`));
  if (isCrossdock(s.destFacility)) {
    out.push(flag("CROSSDOCK", `Shipment ${s.shipmentNumber} goes to crossdock ${s.destFacility} (an IFC), where THD consolidates its POs with other shipments.`));
    // The ship-to sent over EDI is the PO's DC, not the crossdock: check where it really goes
    out.push(
      flag(
        "CHECK_PLANEX",
        `Shipment ${s.shipmentNumber} goes to crossdock ${s.destFacility}${s.destCity ? ` (${[s.destCity, s.destState].filter(Boolean).join(", ")})` : ""}: the shipping address received over EDI may not be accurate. Check the destination in Vendor PlanEx.`,
        isDelivered(s.status) ? "info" : "high",
      ),
    );
  }
  if (s.tmsFlags.length) out.push(flag("TMS_FLAGGED", `TMS marks shipment ${s.shipmentNumber}: ${s.tmsFlags.join(", ")}.`));
  return out;
}

export interface PoView {
  poNumber: string;
  status: PoStatus;
  tms: TmsPo | null;
  shipments: Shipment[];
  /** WMS lines (a mixed carton has one per product) */
  cartons: Carton[];
  /** Distinct carton labels */
  cartonCount: number;
  units: number;
  /** The PO's create date, from THD's compliance data (PO records) when it has the PO */
  createdAt: Date | null;
  firstShipped: Date | null;
  lastShipped: Date | null;
  /** TMS shipment IDs, UPS numbers and PROs on the WMS cartons */
  wmsTms: string[];
  ups: string[];
  pros: string[];
  parcels: Parcel[];
  destination: string;
  origin: string;
  /** The warehouses its WMS cartons shipped from (by OrderNumber prefix) */
  warehouses: WarehouseInfo[];
  /** Its channels, from its WMS cartons' CUST_NUM */
  channels: ChannelInfo[];
  /** The destination's parts, for sorting: Store/DC number, city, state */
  dest: Destination;
  /** Where the WMS shipped it: Store/DC number, name and full address; null before it ships */
  shipTo: ShipTo | null;
  /** Its ASN/ship status as confirmed in POM (the ASN/Shipped Confirmation import); null when never imported */
  asn: AsnInfo | null;
  flags: Flag[];
}

export interface AsnInfo {
  status: "SHIPPED" | "UNSHIPPED";
  /** When an import marked it Shipped */
  confirmedAt: Date | null;
}

/** A PO confirmed in POM, from the ASN/Shipped Confirmation import */
export interface AsnConfirmationInfo extends AsnInfo {
  poNumber: string;
}

/** Whether a PO's ASN is confirmed received */
export const asnReceived = (a: AsnInfo | null | undefined) => a?.status === "SHIPPED";

export interface Destination {
  facility: string | null;
  city: string | null;
  state: string | null;
}

export interface ShipmentView extends Shipment {
  pos: { poNumber: string; tms: TmsPo | null }[];
  /** The shipment's POs that are this supplier's (seen elsewhere in the data) */
  ourPos: string[];
  /** Other suppliers' POs on the same truck: THD books shipments that pick up from several suppliers */
  otherPos: string[];
  cartons: Carton[];
  cartonCount: number;
  units: number;
  pros: string[];
  /** UPS numbers on its cartons (a shipment shown as UPSN) */
  ups: string[];
  flags: Flag[];
  /** TMS's own status when the shipment is shown Canceled because all our POs on it were canceled through the Issue Log */
  tmsStatus: string | null;
  /** The warehouses it shipped from: its cartons', else its POs' */
  warehouses: WarehouseInfo[];
  /** Its channels: its cartons', else its POs' */
  channels: ChannelInfo[];
  /** Our POs on it confirmed ASN received in POM, of all our POs on it */
  asn: { received: number; total: number };
}

/** A PO on a resolved Issue Log issue in the "Order cancellation" category */
export interface IssueCancellation {
  poNumber: string;
  issueNumber: number;
  /** The issue's date (YYYY-MM-DD) */
  issueDate: string;
  /** The PO create date given on the issue (YYYY-MM-DD), which picks the use of a reused number */
  poCreateDate: string | null;
}

/**
 * Whether a cancellation issue is about this use of the PO number (THD reuses numbers): the create
 * date given on the issue must match the PO's; without one, the issue must be dated on or after the
 * PO's creation. When the PO's create date isn't known, the issue counts.
 */
export function cancellationApplies(c: IssueCancellation, poCreated: string | null): boolean {
  if (!poCreated) return true;
  if (c.poCreateDate) return c.poCreateDate === poCreated;
  return c.issueDate >= poCreated;
}

/** Shipment flags that only say an open shipment is late; meaningless for a PO canceled through the Issue Log */
const TIMING_FLAGS: FlagCode[] = ["PICKUP_PASSED", "DELIVERY_OVERDUE", "NO_CARRIER"];

export interface LogisticsData {
  cartons: Carton[];
  shipments: Shipment[];
  pos: TmsPo[];
  /** PO numbers known from the rest of the platform (THD compliance data, the Issue Log) */
  knownPos?: string[];
  /** PO create dates (YYYY-MM-DD) from THD's compliance data, keyed by PO number without leading zeros */
  poCreated?: Record<string, string>;
  /** POs on resolved "Order cancellation" issues: TMS sometimes keeps a canceled PO open */
  canceledByIssue?: IssueCancellation[];
  /** Warehouses by OrderNumber prefix, in the admins' order */
  warehouses?: WarehouseInfo[];
  /** Channels by CUST_NUM, in the admins' order */
  channels?: ChannelInfo[];
  /** POs' ASN/ship status confirmed in POM (the ASN/Shipped Confirmation import) */
  asn?: AsnConfirmationInfo[];
  parcels: Parcel[];
}

/** Every PO and shipment with its flags. `today` is the viewer's date (YYYY-MM-DD). */
export function buildLogistics(input: LogisticsData, today: string) {
  // RG (routing guide) shipments whose POs went out with UPS numbers are UPS: show them as UPSN
  const upsPos = new Set(input.cartons.filter((c) => cartonRefs(c.trackingNumber, c.secondTrack).ups).map((c) => c.poNumber));
  const data: LogisticsData = {
    ...input,
    shipments: input.shipments.map((s) => (s.scac?.toUpperCase() === "RG" && s.poNumbers.some((po) => upsPos.has(po)) ? { ...s, scac: UPS_SCAC, tmsScac: s.scac } : s)),
  };
  const shipmentsByNumber = new Map(data.shipments.map((s) => [s.shipmentNumber, s]));
  const tmsByPo = new Map(data.pos.map((p) => [p.poNumber, p]));
  const parcelsByNumber = new Map(data.parcels.map((p) => [p.trackingNumber, p]));
  const cartonsByPo = new Map<string, Carton[]>();
  for (const c of data.cartons) cartonsByPo.set(c.poNumber, [...(cartonsByPo.get(c.poNumber) ?? []), c]);
  // Store/DC numbers by street address, for WMS lines that don't give theirs
  const facilities = facilityIndex(data.cartons);
  const shipmentsByPo = new Map<string, Shipment[]>();
  for (const s of data.shipments) for (const po of s.poNumbers) shipmentsByPo.set(po, [...(shipmentsByPo.get(po) ?? []), s]);
  // The TMS shipments file covers pickups from this date on; older cartons may simply predate it
  const tmsFrom = data.shipments.map((s) => localDateOf(s.pickupLocal)).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
  const shipmentFlagCache = new Map<string, Flag[]>();
  const flagsOf = (s: Shipment) => {
    if (!shipmentFlagCache.has(s.shipmentNumber)) shipmentFlagCache.set(s.shipmentNumber, shipmentFlags(s, today));
    return shipmentFlagCache.get(s.shipmentNumber)!;
  };

  // POs that are only on TMS shipments belong to other suppliers sharing the truck, once the TMS
  // purchase orders file (this supplier's POs) is in
  // A PO on a TMS shipment is this supplier's only when the rest of the data has it (the TMS purchase
  // orders, the WMS, THD's compliance data or the Issue Log): THD books shipments that pick up from
  // several suppliers, so the others' POs ride along
  const known = new Set((data.knownPos ?? []).map(bareNumber));
  const asnBy = new Map((data.asn ?? []).map((a) => [bareNumber(a.poNumber), { status: a.status, confirmedAt: a.confirmedAt }]));
  const isOurs = (po: string) => tmsByPo.has(po) || cartonsByPo.has(po) || known.has(bareNumber(po));
  const poNumbers = new Set([...tmsByPo.keys(), ...cartonsByPo.keys(), ...[...shipmentsByPo.keys()].filter(isOurs)]);
  const pos: PoView[] = [...poNumbers].map((poNumber) => {
    const tms = tmsByPo.get(poNumber) ?? null;
    const created = data.poCreated?.[bareNumber(poNumber)] ?? null;
    const canceledBy = (data.canceledByIssue ?? []).filter((c) => bareNumber(c.poNumber) === bareNumber(poNumber) && cancellationApplies(c, created)).sort((a, b) => a.issueNumber - b.issueNumber)[0];
    const cartons = (cartonsByPo.get(poNumber) ?? []).sort((a, b) => a.shippedAt.getTime() - b.shippedAt.getTime());
    const shipments = (shipmentsByPo.get(poNumber) ?? []).slice().sort((a, b) => (a.pickupAt?.getTime() ?? 0) - (b.pickupAt?.getTime() ?? 0));
    const live = shipments.filter((s) => !isCanceled(s.status));
    const refs = cartons.map((c) => cartonRefs(c.trackingNumber, c.secondTrack));
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
    const wmsTms = uniq(refs.map((r) => r.tms));
    const ups = uniq(refs.map((r) => r.ups));
    const pros = uniq(refs.map((r) => r.pro));
    const suspect = uniq(refs.map((r) => r.suspectTms));
    const parcels = ups.map((n) => parcelsByNumber.get(n)).filter((p): p is Parcel => Boolean(p));
    const firstShipped = cartons[0]?.shippedAt ?? null;
    const lastShipped = cartons.at(-1)?.shippedAt ?? null;
    const flags: Flag[] = [];

    if (tms && isCanceled(tms.status) && (cartons.length || live.length))
      flags.push(flag("CANCELED_SHIPPED", `TMS shows this PO as ${tms.status}, but ${cartons.length ? `the WMS shipped ${new Set(cartons.map((c) => c.label)).size} carton(s)` : `it is on shipment ${live[0].shipmentNumber}`}.`));
    // TMS ID problems are flagged the same whether or not the shipment goes to a crossdock (IFC)
    for (const v of suspect) flags.push(flag("SUSPECT_TMS_ID", `The WMS has "${v}" as the TMS shipment ID, which isn't a valid 9-digit ID. THD fines invalid TMS IDs ($100).`));
    if (cartons.length && !live.length && !wmsTms.length && !ups.length && !suspect.length)
      flags.push(flag("NO_TMS_SHIPMENT", `The WMS shipped this PO on ${isoDate(firstShipped!)}, but no TMS shipment lists it.`));
    for (const id of wmsTms) {
      const s = shipmentsByNumber.get(id);
      if (!s && live.length && !live.some((x) => x.shipmentNumber === id))
        flags.push(flag("TMS_ID_MISMATCH", `The WMS cartons carry TMS shipment ${id}, but TMS has this PO on ${live.map((x) => x.shipmentNumber).join(", ")}. Labels and ASNs with the WMS's ID would carry the wrong TMS ID.`));
      else if (!s) {
        if (data.shipments.length && (!tmsFrom || isoDate(firstShipped!) >= tmsFrom))
          flags.push(flag("TMS_ID_NOT_FOUND", `The WMS cartons carry TMS shipment ${id}, which isn't in the TMS shipments file.`));
      } else if (!s.poNumbers.includes(poNumber)) flags.push(flag("TMS_ID_MISMATCH", `The WMS cartons carry TMS shipment ${id}, but that shipment lists ${s.poNumbers.join(", ") || "no POs"}, not this PO.`));
    }
    if (live.length > 1) flags.push(flag("MULTIPLE_SHIPMENTS", `This PO is on ${live.length} TMS shipments: ${live.map((s) => `${s.shipmentNumber} (${s.status})`).join(", ")}.`));
    const destCity = norm(tms?.destCity ?? live[0]?.destCity);
    const destState = norm(tms?.destState ?? live[0]?.destState);
    const dc = tms?.destFacility ?? live[0]?.destFacility ?? "?";
    const differs = cartons.filter((c) => c.shipCity && destCity && (norm(c.shipCity) !== destCity || (c.shipState && destState && norm(c.shipState) !== destState)));
    // A different state or a different city is a wrong destination; a near spelling is a typo in the WMS ship-to
    const wrong = differs.find((c) => (c.shipState && destState && norm(c.shipState) !== destState) || editDistance(norm(c.shipCity), destCity) > 2);
    const typo = differs.find((c) => c !== wrong);
    const shipTo = poShipTo(cartons, facilities);
    // The WMS's Store/DC against TMS's (a crossdock's TMS destination is the crossdock, not the store)
    const tmsFacility = tms?.destFacility ?? live[0]?.destFacility ?? null;
    if (shipTo?.facility && tmsFacility && !isCrossdock(tmsFacility) && facilityKey(shipTo.facility) !== facilityKey(tmsFacility))
      flags.push(
        flag(
          "SHIP_TO_MISMATCH",
          `The WMS shipped to Store/DC ${shipTo.facility}${shipTo.name ? ` (${shipTo.name})` : ""}, ${addressLines(shipTo).join(", ")}; TMS has the PO going to ${place(tmsFacility, tms?.destCity ?? live[0]?.destCity ?? null, tms?.destState ?? live[0]?.destState ?? null)}.`,
        ),
      );
    if (wrong) flags.push(flag("WRONG_DESTINATION", `The WMS shipped to ${wrong.shipCity}, ${wrong.shipState ?? ""}; TMS has the PO going to ${tms?.destCity ?? live[0]?.destCity}, ${tms?.destState ?? live[0]?.destState ?? ""} (DC ${dc}).`));
    else if (typo) flags.push(flag("CITY_SPELLING", `The WMS ship-to city is "${typo.shipCity}", TMS has "${tms?.destCity ?? live[0]?.destCity}" for DC ${dc}: likely a typo in the WMS ship-to address.`));
    const asn = asnBy.get(bareNumber(poNumber));
    if (asn?.status === "SHIPPED") flags.push(flag("ASN_RECEIVED", `Confirmed shipped in POM (Supplier Hub)${asn.confirmedAt ? ` on ${isoDate(asn.confirmedAt)}` : ""}: THD has the ASN.`));
    if (tms?.originFacility) {
      const other = live.find((s) => s.originFacility && norm(s.originFacility) !== norm(tms.originFacility) && norm(s.originFacility).slice(0, 6) === norm(tms.originFacility).slice(0, 6));
      if (other) flags.push(flag("ORIGIN_MISMATCH", `The PO ships from ${place(tms.originFacility, tms.originCity, tms.originState)} in TMS, but shipment ${other.shipmentNumber} left ${place(other.originFacility, other.originCity, other.originState)}.`));
    }
    if (firstShipped) {
      for (const s of live) {
        const pickup = localDateOf(s.pickupLocal);
        const late = pickup ? days(pickup, isoDate(firstShipped)) : 0;
        if (late > 0) flags.push(flag("SHIPPED_AFTER_PICKUP", `The WMS shipped it ${late} day(s) after the TMS pickup date (${pickup}) of shipment ${s.shipmentNumber}.`));
      }
    }
    for (const s of live)
      for (const f of flagsOf(s)) {
        if (canceledBy && TIMING_FLAGS.includes(f.code)) continue;
        if (!flags.some((x) => x.message === f.message || (f.code === "CROSSDOCK" && x.code === "CROSSDOCK"))) flags.push(f);
      }
    if (canceledBy)
      flags.push(
        flag(
          "CANCELED_BY_ISSUE",
          `Canceled: Issue Log #${canceledBy.issueNumber} (Order cancellation) is resolved${tms && !isCanceled(tms.status) ? `, though TMS still shows the PO ${tms.status}` : ""}${live.length ? ` and has it on ${live.map((x) => `${x.shipmentNumber} (${x.status})`).join(", ")}` : ""}.`,
        ),
      );
    for (const p of parcels) {
      if (p.statusType === "X") flags.push(flag("UPS_EXCEPTION", `UPS ${p.trackingNumber}: ${p.status ?? "exception"}${p.lastActivity ? ` (${p.lastActivity})` : ""}.`));
      else if (!p.delivered && p.expectedAt && isoDate(p.expectedAt) < today) flags.push(flag("UPS_LATE", `UPS ${p.trackingNumber} was expected ${isoDate(p.expectedAt)} and isn't delivered (${p.status ?? "no status"}).`));
    }
    if (!tms && data.pos.length && cartons.length) flags.push(flag("NOT_IN_TMS", "This PO isn't in the TMS purchase orders file (it may be older than the export)."));
    if (tms?.tmsFlags.length) flags.push(flag("TMS_FLAGGED", `TMS marks this PO: ${tms.tmsFlags.join(", ")}.`));

    let status: PoStatus = "Open";
    if ((tms && isCanceled(tms.status)) || canceledBy) status = "Canceled";
    else if ((live.length && live.every((s) => isDelivered(s.status))) || (ups.length && parcels.length === ups.length && parcels.every((p) => p.delivered) && !live.length)) status = "Delivered";
    else if (live.some((s) => isMoving(s.status) || isDelivered(s.status)) || parcels.some((p) => !p.delivered && p.statusType && p.statusType !== "M")) status = "In transit";
    else if (cartons.length) status = "Shipped";
    else if (live.length) status = "Scheduled";

    return {
      poNumber,
      status,
      tms,
      shipments,
      cartons,
      cartonCount: new Set(cartons.map((c) => c.label)).size,
      units: cartons.reduce((s, c) => s + (c.quantity ?? 0), 0),
      createdAt: created ? new Date(created) : null,
      firstShipped,
      lastShipped,
      wmsTms,
      ups,
      pros,
      parcels,
      destination: tms ? place(tms.destFacility, tms.destCity, tms.destState) : live[0] ? place(live[0].destFacility, live[0].destCity, live[0].destState) : shipTo ? place(shipTo.facility, shipTo.city, shipTo.state) : "—",
      origin: tms ? place(tms.originFacility, tms.originCity, tms.originState) : live[0] ? place(live[0].originFacility, live[0].originCity, live[0].originState) : "—",
      warehouses: warehousesOf(cartons, data.warehouses ?? []),
      channels: channelsOf(cartons, data.channels ?? []),
      dest: tms
        ? { facility: tms.destFacility, city: tms.destCity, state: tms.destState }
        : live[0]
          ? { facility: live[0].destFacility, city: live[0].destCity, state: live[0].destState }
          : { facility: shipTo?.facility ?? null, city: shipTo?.city ?? null, state: shipTo?.state ?? null },
      shipTo,
      asn: asnBy.get(bareNumber(poNumber)) ?? null,
      flags: flags.sort(bySeverity),
    };
  });
  // Newest PO first. THD numbers its POs in the order it creates them, so the number orders POs by
  // create date, including the many whose date isn't known (it's only in THD's compliance data)
  pos.sort(byPoNumberDesc);

  const poByNumber = new Map(pos.map((p) => [p.poNumber, p]));
  const shipments: ShipmentView[] = data.shipments
    .map((s) => {
      // The cartons carrying this shipment's TMS ID, and those of its POs whose WMS TMS ID is missing,
      // malformed or a shipment that doesn't list the PO (a TMS ID mismatch): matched by PO instead
      const cartons = data.cartons.filter((c) => {
        const r = cartonRefs(c.trackingNumber, c.secondTrack);
        if (r.tms === s.shipmentNumber) return true;
        if (!s.poNumbers.includes(c.poNumber)) return false;
        // UPS cartons belong to a shipment that turned out to be UPS
        if (r.ups) return s.scac === UPS_SCAC && Boolean(s.tmsScac);
        return !r.tms || !shipmentsByNumber.get(r.tms)?.poNumbers.includes(c.poNumber);
      });
      const flags = [...flagsOf(s)];
      for (const po of s.poNumbers) {
        const tms = tmsByPo.get(po);
        if (tms && isCanceled(tms.status) && !isCanceled(s.status)) flags.push(flag("CANCELED_SHIPPED", `PO ${po} on this shipment is ${tms.status} in TMS.`));
        const byIssue = poByNumber.get(po)?.flags.find((f) => f.code === "CANCELED_BY_ISSUE");
        if (byIssue && !isCanceled(s.status)) flags.push({ ...byIssue, message: `PO ${po}: ${byIssue.message}` });
        for (const f of poByNumber.get(po)?.flags ?? []) if (["WRONG_DESTINATION", "SHIP_TO_MISMATCH", "SUSPECT_TMS_ID", "TMS_ID_MISMATCH", "ORIGIN_MISMATCH", "SHIPPED_AFTER_PICKUP"].includes(f.code) && !flags.some((x) => x.message === f.message)) flags.push({ ...f, message: `PO ${po}: ${f.message}` });
      }
      // Every one of our POs on it canceled through the Issue Log: the shipment is canceled too,
      // whatever TMS still says, and its lateness flags no longer apply
      const ours = s.poNumbers.filter(isOurs);
      const canceledByIssue = !isCanceled(s.status) && ours.length > 0 && ours.every((po) => poByNumber.get(po)?.flags.some((f) => f.code === "CANCELED_BY_ISSUE"));
      const asnCount = ours.filter((po) => asnReceived(poByNumber.get(po)?.asn)).length;
      if (ours.length && asnCount === ours.length) flags.push(flag("ASN_RECEIVED", ours.length === 1 ? `PO ${ours[0]} is confirmed shipped in POM: THD has the ASN.` : `All ${ours.length} of our POs on it are confirmed shipped in POM: THD has the ASNs.`));
      return {
        ...s,
        status: canceledByIssue ? "Canceled" : s.status,
        tmsStatus: canceledByIssue ? s.status : null,
        warehouses: cartons.length ? warehousesOf(cartons, data.warehouses ?? []) : (data.warehouses ?? []).filter((w) => ours.some((po) => poByNumber.get(po)?.warehouses.some((x) => x.prefix === w.prefix))),
        channels: cartons.length ? channelsOf(cartons, data.channels ?? []) : (data.channels ?? []).filter((c) => ours.some((po) => poByNumber.get(po)?.channels.some((x) => x.code === c.code))),
        pos: s.poNumbers.map((po) => ({ poNumber: po, tms: tmsByPo.get(po) ?? null })),
        ourPos: ours,
        asn: { received: asnCount, total: ours.length },
        otherPos: s.poNumbers.filter((po) => !isOurs(po)),
        cartons,
        cartonCount: new Set(cartons.map((c) => c.label)).size,
        units: cartons.reduce((n, c) => n + (c.quantity ?? 0), 0),
        pros: [...new Set(cartons.map((c) => cartonRefs(c.trackingNumber, c.secondTrack).pro).filter((x): x is string => Boolean(x)))],
        ups: [...new Set(cartons.map((c) => cartonRefs(c.trackingNumber, c.secondTrack).ups).filter((x): x is string => Boolean(x)))],
        flags: (canceledByIssue ? flags.filter((f) => !TIMING_FLAGS.includes(f.code)) : flags).sort(bySeverity),
      };
    })
    .sort((a, b) => (b.pickupAt?.getTime() ?? 0) - (a.pickupAt?.getTime() ?? 0) || b.shipmentNumber.localeCompare(a.shipmentNumber));

  // POs list their shipments as canceled too
  const canceled = new Set(shipments.filter((s) => s.tmsStatus).map((s) => s.shipmentNumber));
  if (canceled.size) for (const p of pos) p.shipments = p.shipments.map((s) => (canceled.has(s.shipmentNumber) ? { ...s, status: "Canceled" } : s));

  return { pos, shipments };
}

export type LogisticsViews = ReturnType<typeof buildLogistics>;

/** Overview counts: POs by status, flags by type (POs affected), and per carrier. */
export function logisticsOverview(views: LogisticsViews, warehouses: WarehouseInfo[] = []) {
  // POs per flag and priority: a flag can be informational in one case (e.g. at a crossdock) and not another
  const flagCounts = new Map<string, number>();
  for (const p of views.pos) for (const key of new Set(p.flags.map((f) => `${f.code}|${f.severity}`))) flagCounts.set(key, (flagCounts.get(key) ?? 0) + 1);
  const carriers = new Map<string, { scac: string; shipments: number; delivered: number; open: number; overdue: number; flagged: number }>();
  for (const s of views.shipments) {
    if (isCanceled(s.status)) continue;
    const k = s.scac ?? "—";
    const g = carriers.get(k) ?? { scac: k, shipments: 0, delivered: 0, open: 0, overdue: 0, flagged: 0 };
    g.shipments++;
    if (isDelivered(s.status)) g.delivered++;
    else g.open++;
    if (s.flags.some((f) => f.code === "DELIVERY_OVERDUE" || f.code === "PICKUP_PASSED")) g.overdue++;
    if (s.flags.some((f) => f.severity !== "info")) g.flagged++;
    carriers.set(k, g);
  }
  const dests = new Map<string, { dest: string; pos: number; flagged: number; units: number }>();
  for (const p of views.pos) {
    if (p.status === "Canceled") continue;
    const g = dests.get(p.destination) ?? { dest: p.destination, pos: 0, flagged: 0, units: 0 };
    g.pos++;
    g.units += p.units;
    if (p.flags.some((f) => f.severity === "high")) g.flagged++;
    dests.set(p.destination, g);
  }
  return {
    pos: views.pos.length,
    byStatus: PO_STATUSES.map((s) => ({ status: s, count: views.pos.filter((p) => p.status === s).length })),
    withHigh: views.pos.filter((p) => p.flags.some((f) => f.severity === "high")).length,
    withMedium: views.pos.filter((p) => !p.flags.some((f) => f.severity === "high") && p.flags.some((f) => f.severity === "medium")).length,
    shipments: views.shipments.filter((s) => !isCanceled(s.status)).length,
    openShipments: views.shipments.filter((s) => !isCanceled(s.status) && !isDelivered(s.status)).length,
    flags: (Object.keys(FLAGS) as FlagCode[])
      .flatMap((code) => SEVERITY_ORDER.map((severity) => ({ code, label: FLAGS[code].label, severity, pos: flagCounts.get(`${code}|${severity}`) ?? 0 })))
      .filter((f) => f.pos > 0)
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
    carriers: [...carriers.values()].sort((a, b) => b.shipments - a.shipments),
    destinations: [...dests.values()].sort((a, b) => b.flagged - a.flagged || b.pos - a.pos).slice(0, 15),
    warehouses: byWarehouse(views, warehouses),
  };
}

/** POs and shipments per warehouse (admins' order, then unknown), leaving canceled ones out */
function byWarehouse(views: Pick<LogisticsViews, "pos" | "shipments">, warehouses: WarehouseInfo[]) {
  const rows = [...warehouses.map((w) => ({ prefix: w.prefix, name: w.name })), { prefix: "none", name: "No WMS cartons yet" }].map((w) => {
    const has = (items: WarehouseInfo[]) => (w.prefix === "none" ? items.length === 0 : items.some((x) => x.prefix === w.prefix));
    const pos = views.pos.filter((p) => p.status !== "Canceled" && has(p.warehouses));
    const shipments = views.shipments.filter((s) => !isCanceled(s.status) && has(s.warehouses));
    return {
      ...w,
      pos: pos.length,
      high: pos.filter((p) => p.flags.some((f) => f.severity === "high")).length,
      inTransit: pos.filter((p) => p.status === "Shipped" || p.status === "In transit").length,
      shipments: shipments.length,
      openShipments: shipments.filter((s) => !isDelivered(s.status)).length,
    };
  });
  return rows.filter((r) => r.prefix !== "none" || r.pos || r.shipments);
}

export interface PoFilters {
  q?: string;
  status?: string;
  flag?: string;
  severity?: string;
  scac?: string;
  /** A warehouse's OrderNumber prefix, or "none" for unknown */
  wh?: string;
  /** A channel's CUST_NUM, or "none" for unknown */
  ch?: string;
  /** "received" (confirmed in POM) or "pending" (not confirmed) */
  asn?: string;
  /** "warehouse" or "shipped"; newest PO first otherwise */
  sort?: string;
  /** A date range (PO_RANGES key); "custom" uses from and to (YYYY-MM-DD) */
  range?: string;
  from?: string;
  to?: string;
}

/** Date ranges for POs, by the PO's date (poDate) */
export const PO_RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "14", label: "Last 2 weeks", days: 14 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
  { key: "all", label: "All time", days: 0 },
  { key: "custom", label: "Custom", days: 0 },
] as const;

const isDay = (s: string | undefined): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));

/**
 * A PO's date for date ranges (YYYY-MM-DD): when the WMS first shipped it, else its earliest TMS
 * pickup, else its create date; null when none is known (such POs are only in All time).
 */
export function poDate(p: Pick<PoView, "firstShipped" | "shipments" | "createdAt">): string | null {
  if (p.firstShipped) return isoDate(p.firstShipped);
  const pickups = p.shipments.map((s) => localDateOf(s.pickupLocal) ?? (s.pickupAt ? isoDate(s.pickupAt) : null)).filter((d): d is string => Boolean(d)).sort();
  if (pickups.length) return pickups[0];
  return p.createdAt ? isoDate(p.createdAt) : null;
}

/**
 * The bounds a range stands for, given today (YYYY-MM-DD): "Last N days" runs from N days before
 * today with no end, so POs scheduled ahead still count; Custom runs from and to, inclusive, either
 * one optional. Null for All time (or no range, or a custom range with no dates).
 */
export function rangeBounds(f: Pick<PoFilters, "range" | "from" | "to">, today: string): { from: string | null; to: string | null } | null {
  if (f.range === "custom") {
    const from = isDay(f.from) ? f.from : null;
    const to = isDay(f.to) ? f.to : null;
    if (!from && !to) return null;
    return from && to && from > to ? { from: to, to: from } : { from, to };
  }
  const r = PO_RANGES.find((x) => x.key === f.range);
  if (!r || !r.days) return null;
  return { from: isoDate(new Date(Date.parse(`${today}T00:00:00Z`) - r.days * 86_400_000)), to: null };
}

/** A range in words, e.g. "Last 2 weeks" or "Nov 1, 2026 – Nov 15, 2026" */
export function rangeLabel(f: Pick<PoFilters, "range" | "from" | "to">, today: string): string {
  const b = rangeBounds(f, today);
  if (!b) return "All time";
  if (f.range !== "custom") return PO_RANGES.find((x) => x.key === f.range)!.label;
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  return b.from && b.to ? `${fmt(b.from)} – ${fmt(b.to)}` : b.from ? `From ${fmt(b.from)}` : `Up to ${fmt(b.to!)}`;
}

/** POs matching a search (PO, shipment, tracking, PRO, order or DC) and filters; date ranges need today (YYYY-MM-DD). */
export function filterPos(pos: PoView[], f: PoFilters, today?: string): PoView[] {
  const q = f.q?.trim().toUpperCase();
  const bounds = today ? rangeBounds(f, today) : null;
  return pos.filter((p) => {
    if (bounds) {
      const d = poDate(p);
      if (!d || (bounds.from && d < bounds.from) || (bounds.to && d > bounds.to)) return false;
    }
    if (f.status && p.status !== f.status) return false;
    // With a flag, the priority applies to that flag; on its own, to any flag
    const pool = f.flag ? p.flags.filter((x) => x.code === f.flag) : p.flags;
    if (f.flag && !pool.length) return false;
    if (f.severity === "any" && !pool.some((x) => x.severity !== "info")) return false;
    if (f.severity && f.severity !== "any" && !pool.some((x) => x.severity === f.severity)) return false;
    if (f.scac && !p.shipments.some((s) => s.scac === f.scac)) return false;
    if (!matchesWarehouse(p.warehouses, f.wh)) return false;
    if (!matchesChannel(p.channels, f.ch)) return false;
    if (f.asn === "received" && !asnReceived(p.asn)) return false;
    if (f.asn === "pending" && asnReceived(p.asn)) return false;
    if (!q) return true;
    const hay = [p.poNumber, p.destination, p.origin, p.shipTo?.facility ?? "", p.shipTo?.name ?? "", ...(p.shipTo?.street ?? []), ...p.wmsTms, ...p.ups, ...p.pros, ...p.shipments.map((s) => s.shipmentNumber), ...p.cartons.map((c) => c.orderNum), ...p.cartons.map((c) => c.label)].join(" ").toUpperCase();
    return hay.includes(q);
  });
}

/** Sorts offered on the POs, Shipments and UPS parcels tabs, besides each tab's default */
export const DEST_SORTS = [
  { key: "dest", label: "Destination Store/DC #" },
  { key: "city", label: "Destination city" },
  { key: "state", label: "Destination state" },
] as const;

const text = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();
const byText = (a: string, b: string) => (!a ? (b ? 1 : 0) : !b ? -1 : a.localeCompare(b, "en", { numeric: true }));

/** Compares destinations by Store/DC number, city or state (then the others); blanks last */
export function destCompare(sort: string): ((a: Destination, b: Destination) => number) | null {
  const order: (keyof Destination)[] | null = sort === "dest" ? ["facility", "state", "city"] : sort === "city" ? ["city", "state", "facility"] : sort === "state" ? ["state", "city", "facility"] : null;
  if (!order) return null;
  return (a, b) => {
    for (const k of order) {
      const c = byText(text(a[k]), text(b[k]));
      if (c) return c;
    }
    return 0;
  };
}

/** A shipment's destination parts */
export const shipmentDest = (s: Pick<Shipment, "destFacility" | "destCity" | "destState">): Destination => ({ facility: s.destFacility, city: s.destCity, state: s.destState });

/** POs in the order asked: by warehouse (admins' order, unknown last), by WMS ship date (newest first), by destination, else newest PO first */
export function sortPos(pos: PoView[], sort: string | undefined, warehouses: WarehouseInfo[]): PoView[] {
  const out = [...pos].sort(byPoNumberDesc);
  const dest = sort ? destCompare(sort) : null;
  if (dest) return out.sort((a, b) => dest(a.dest, b.dest));
  if (sort === "warehouse") return out.sort((a, b) => warehouseRank(a.warehouses, warehouses) - warehouseRank(b.warehouses, warehouses));
  if (sort === "shipped") return out.sort((a, b) => (b.firstShipped?.getTime() ?? 0) - (a.firstShipped?.getTime() ?? 0));
  return out;
}

/** ASN filter choices, on the POs and Shipments tabs */
export const ASN_FILTERS = [
  { key: "received", label: "ASN received (POM)" },
  { key: "pending", label: "ASN not confirmed" },
] as const;

/** A shipment's date for the date range: its pickup, else its delivery (local dates as TMS writes them) */
export function shipmentDate(s: Pick<Shipment, "pickupLocal" | "pickupAt" | "deliveryLocal" | "deliveryAt">): string | null {
  return localDateOf(s.pickupLocal) ?? (s.pickupAt ? isoDate(s.pickupAt) : null) ?? localDateOf(s.deliveryLocal) ?? (s.deliveryAt ? isoDate(s.deliveryAt) : null);
}

export interface ShipmentFilters {
  /** Shipment, PO, SCAC, PRO, UPS, Store/DC, city or state */
  q?: string;
  status?: string;
  flag?: string;
  /** "any" (high or medium), "high", "medium" or "info" */
  severity?: string;
  /** "received" (all our POs confirmed in POM) or "pending" */
  asn?: string;
  /** A date range (PO_RANGES key) by pickup date; "custom" uses from and to */
  range?: string;
  from?: string;
  to?: string;
  scac?: string;
  /** A channel's CUST_NUM, or "none" */
  ch?: string;
  /** Only shipments past their pickup or delivery date */
  late?: boolean;
  wh?: string;
  /** "warehouse"; latest pickup first otherwise */
  sort?: string;
}

/** Shipments matching the Shipments tab's filters, in the order asked */
export function filterShipments(shipments: ShipmentView[], f: ShipmentFilters, warehouses: WarehouseInfo[], today?: string): ShipmentView[] {
  const q = f.q?.trim().toUpperCase();
  const bounds = today ? rangeBounds(f, today) : null;
  const rows = shipments.filter((s) => {
    if (f.scac && s.scac !== f.scac) return false;
    if (f.late && !s.flags.some((x) => x.code === "DELIVERY_OVERDUE" || x.code === "PICKUP_PASSED")) return false;
    if (!matchesWarehouse(s.warehouses, f.wh) || !matchesChannel(s.channels, f.ch)) return false;
    if (f.status && s.status !== f.status) return false;
    // With a flag, the priority applies to that flag; on its own, to any flag
    const pool = f.flag ? s.flags.filter((x) => x.code === f.flag) : s.flags;
    if (f.flag && !pool.length) return false;
    if (f.severity === "any" && !pool.some((x) => x.severity !== "info")) return false;
    if (f.severity && f.severity !== "any" && !pool.some((x) => x.severity === f.severity)) return false;
    const allAsn = s.asn.total > 0 && s.asn.received === s.asn.total;
    if (f.asn === "received" && !allAsn) return false;
    if (f.asn === "pending" && (allAsn || !s.asn.total)) return false;
    if (bounds) {
      const d = shipmentDate(s);
      if (!d || (bounds.from && d < bounds.from) || (bounds.to && d > bounds.to)) return false;
    }
    if (!q) return true;
    const hay = [s.shipmentNumber, s.scac ?? "", s.tmsScac ?? "", s.status, ...s.poNumbers, ...s.pros, ...s.ups, s.originFacility ?? "", s.originCity ?? "", s.destFacility ?? "", s.destCity ?? "", s.destState ?? "", ...s.cartons.map((c) => c.label)].join(" ").toUpperCase();
    return hay.includes(q);
  });
  const dest = f.sort ? destCompare(f.sort) : null;
  if (dest) return [...rows].sort((a, b) => dest(shipmentDest(a), shipmentDest(b)));
  // Array sort is stable: within a warehouse, the latest pickup stays first
  return f.sort === "warehouse" ? [...rows].sort((a, b) => warehouseRank(a.warehouses, warehouses) - warehouseRank(b.warehouses, warehouses)) : rows;
}

/** What the UPS parcels tab can filter by, worked out from UPS tracking and today */
export const PARCEL_STATES = [
  { key: "transit", label: "In transit" },
  { key: "label", label: "Label created" },
  { key: "late", label: "Past expected date" },
  { key: "exception", label: "UPS exception" },
  { key: "delivered", label: "Delivered" },
  { key: "unchecked", label: "Not checked yet" },
  { key: "error", label: "Tracking error" },
] as const;
export type ParcelState = (typeof PARCEL_STATES)[number]["key"];

export interface ParcelRow {
  number: string;
  pos: string[];
  shipped: Date | null;
  tracking: Parcel | null;
  state: ParcelState;
  destination: string;
  dest: Destination;
  warehouses: WarehouseInfo[];
  channels: ChannelInfo[];
}

export interface ParcelFilters {
  /** Tracking number, PO or destination */
  q?: string;
  ch?: string;
  wh?: string;
  state?: string;
  range?: string;
  from?: string;
  to?: string;
  /** "expected", "status", or a destination sort; latest shipped first otherwise */
  sort?: string;
}

/** A UPS parcel's state from its tracking (UPS status types: D delivered, X exception, M label created) */
export function parcelState(t: Parcel | null, today: string): ParcelState {
  if (!t) return "unchecked";
  if (t.delivered) return "delivered";
  if (t.error && !t.status) return "error";
  if (t.statusType === "X") return "exception";
  if (t.expectedAt && isoDate(t.expectedAt) < today) return "late";
  if (t.statusType === "M") return "label";
  return "transit";
}

/** One row per UPS number on the POs' WMS cartons, with its POs, tracking, warehouse and channel */
export function parcelRows(views: Pick<LogisticsViews, "pos">, today: string, warehouses: WarehouseInfo[] = [], channels: ChannelInfo[] = []): ParcelRow[] {
  const rows = new Map<string, ParcelRow & { cartons: Carton[] }>();
  for (const p of views.pos)
    for (const u of p.ups) {
      const cartons = p.cartons.filter((c) => c.trackingNumber?.toUpperCase() === u || c.secondTrack?.toUpperCase() === u);
      const row = rows.get(u) ?? { number: u, pos: [], shipped: null, tracking: null, state: "unchecked" as ParcelState, destination: p.destination, dest: p.dest, warehouses: [], channels: [], cartons: [] };
      row.pos.push(p.poNumber);
      row.cartons.push(...cartons);
      row.tracking ??= p.parcels.find((x) => x.trackingNumber === u) ?? null;
      for (const c of cartons) if (!row.shipped || c.shippedAt < row.shipped) row.shipped = c.shippedAt;
      rows.set(u, row);
    }
  return [...rows.values()].map(({ cartons, ...r }) => ({ ...r, state: parcelState(r.tracking, today), warehouses: warehousesOf(cartons, warehouses), channels: channelsOf(cartons, channels) }));
}

/** The UPS parcels tab's rows as filtered and sorted */
export function filterParcels(rows: ParcelRow[], f: ParcelFilters, today: string): ParcelRow[] {
  const q = f.q?.trim().toUpperCase();
  const bounds = rangeBounds(f, today);
  const out = rows.filter((r) => {
    if (f.state && r.state !== f.state) return false;
    if (!matchesWarehouse(r.warehouses, f.wh) || !matchesChannel(r.channels, f.ch)) return false;
    if (bounds) {
      const d = r.shipped ? isoDate(r.shipped) : null;
      if (!d || (bounds.from && d < bounds.from) || (bounds.to && d > bounds.to)) return false;
    }
    return !q || [r.number, ...r.pos, r.destination].join(" ").toUpperCase().includes(q);
  });
  const dest = f.sort ? destCompare(f.sort) : null;
  if (dest) return out.sort((a, b) => dest(a.dest, b.dest));
  if (f.sort === "expected") {
    // Soonest expected first; then those with no expected date; delivered last
    const at = (r: ParcelRow) => (r.tracking?.delivered ? Number.MAX_SAFE_INTEGER : (r.tracking?.expectedAt?.getTime() ?? Number.MAX_SAFE_INTEGER - 1));
    return out.sort((a, b) => at(a) - at(b));
  }
  if (f.sort === "status") {
    const rank = (r: ParcelRow) => PARCEL_STATES.findIndex((s) => s.key === r.state);
    return out.sort((a, b) => rank(a) - rank(b) || (b.shipped?.getTime() ?? 0) - (a.shipped?.getTime() ?? 0));
  }
  return out.sort((a, b) => (b.shipped?.getTime() ?? 0) - (a.shipped?.getTime() ?? 0));
}
