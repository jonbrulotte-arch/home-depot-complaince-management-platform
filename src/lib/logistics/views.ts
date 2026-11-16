import { localDateOf } from "@/lib/logistics/parse";
import { cartonRefs } from "@/lib/logistics/refs";

// Logistics views: every PO and TMS shipment with the WMS cartons, TMS records and UPS tracking
// tied together, a status, and flags for what needs looking at. Pure and unit-tested; data.ts
// loads the rows.

export interface Carton {
  lineKey?: string;
  label: string;
  poNumber: string;
  orderNum: string;
  customer: string | null;
  trackingNumber: string | null;
  secondTrack: string | null;
  product: string | null;
  quantity: number | null;
  shippedAt: Date;
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
  DELIVERY_OVERDUE: { severity: "high", label: "Delivery overdue" },
  PICKUP_PASSED: { severity: "high", label: "Pickup date passed" },
  UPS_EXCEPTION: { severity: "high", label: "UPS exception" },
  TMS_ID_NOT_FOUND: { severity: "medium", label: "TMS ID not in TMS file" },
  MULTIPLE_SHIPMENTS: { severity: "medium", label: "On several shipments" },
  SHIPPED_AFTER_PICKUP: { severity: "medium", label: "Shipped after pickup date" },
  NO_CARRIER: { severity: "medium", label: "No carrier" },
  UPS_LATE: { severity: "medium", label: "UPS past expected date" },
  CITY_SPELLING: { severity: "medium", label: "Ship-to city misspelled" },
  ORIGIN_MISMATCH: { severity: "info", label: "Different ship-from" },
  NOT_IN_TMS: { severity: "info", label: "PO not in TMS file" },
  CHECK_PLANEX: { severity: "medium", label: "Check destination in PlanEx" },
  CROSSDOCK: { severity: "info", label: "Crossdock (IFC)" },
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
        isDelivered(s.status) ? "info" : "medium",
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
  flags: Flag[];
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
    if (wrong) flags.push(flag("WRONG_DESTINATION", `The WMS shipped to ${wrong.shipCity}, ${wrong.shipState ?? ""}; TMS has the PO going to ${tms?.destCity ?? live[0]?.destCity}, ${tms?.destState ?? live[0]?.destState ?? ""} (DC ${dc}).`));
    else if (typo) flags.push(flag("CITY_SPELLING", `The WMS ship-to city is "${typo.shipCity}", TMS has "${tms?.destCity ?? live[0]?.destCity}" for DC ${dc}: likely a typo in the WMS ship-to address.`));
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
      destination: tms ? place(tms.destFacility, tms.destCity, tms.destState) : live[0] ? place(live[0].destFacility, live[0].destCity, live[0].destState) : cartons[0] ? place(null, cartons[0].shipCity, cartons[0].shipState) : "—",
      origin: tms ? place(tms.originFacility, tms.originCity, tms.originState) : live[0] ? place(live[0].originFacility, live[0].originCity, live[0].originState) : "—",
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
        for (const f of poByNumber.get(po)?.flags ?? []) if (["WRONG_DESTINATION", "SUSPECT_TMS_ID", "TMS_ID_MISMATCH", "ORIGIN_MISMATCH", "SHIPPED_AFTER_PICKUP"].includes(f.code) && !flags.some((x) => x.message === f.message)) flags.push({ ...f, message: `PO ${po}: ${f.message}` });
      }
      // Every one of our POs on it canceled through the Issue Log: the shipment is canceled too,
      // whatever TMS still says, and its lateness flags no longer apply
      const ours = s.poNumbers.filter(isOurs);
      const canceledByIssue = !isCanceled(s.status) && ours.length > 0 && ours.every((po) => poByNumber.get(po)?.flags.some((f) => f.code === "CANCELED_BY_ISSUE"));
      return {
        ...s,
        status: canceledByIssue ? "Canceled" : s.status,
        tmsStatus: canceledByIssue ? s.status : null,
        pos: s.poNumbers.map((po) => ({ poNumber: po, tms: tmsByPo.get(po) ?? null })),
        ourPos: ours,
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
export function logisticsOverview(views: LogisticsViews) {
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
  };
}

export interface PoFilters {
  q?: string;
  status?: string;
  flag?: string;
  severity?: string;
  scac?: string;
}

/** POs matching a search (PO, shipment, tracking, PRO, order or DC) and filters. */
export function filterPos(pos: PoView[], f: PoFilters): PoView[] {
  const q = f.q?.trim().toUpperCase();
  return pos.filter((p) => {
    if (f.status && p.status !== f.status) return false;
    // With a flag, the priority applies to that flag; on its own, to any flag
    const pool = f.flag ? p.flags.filter((x) => x.code === f.flag) : p.flags;
    if (f.flag && !pool.length) return false;
    if (f.severity === "any" && !pool.some((x) => x.severity !== "info")) return false;
    if (f.severity && f.severity !== "any" && !pool.some((x) => x.severity === f.severity)) return false;
    if (f.scac && !p.shipments.some((s) => s.scac === f.scac)) return false;
    if (!q) return true;
    const hay = [p.poNumber, p.destination, p.origin, ...p.wmsTms, ...p.ups, ...p.pros, ...p.shipments.map((s) => s.shipmentNumber), ...p.cartons.map((c) => c.orderNum), ...p.cartons.map((c) => c.label)].join(" ").toUpperCase();
    return hay.includes(q);
  });
}
