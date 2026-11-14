// Tracking references and carrier links. Pure and unit-tested.
//
// The WMS writes one reference per carton in TrackingNumber and another in secondtrack:
// - a TMS (Logistics Gateway) shipment ID, nine digits (233480675);
// - a UPS number (1Z…);
// - a carrier PRO number, with the TMS shipment ID in secondtrack;
// - the WMS's own shipment number (SHP…) beside a UPS number.

export interface CartonRefs {
  tms: string | null;
  ups: string | null;
  pro: string | null;
  /** Looks like a mistyped TMS shipment ID (THD fines invalid TMS IDs) */
  suspectTms: string | null;
}

export const isUps = (v: string) => /^1Z[0-9A-Z]{16}$/i.test(v);
export const isTmsShipment = (v: string) => /^\d{9}$/.test(v);
const nearTms = (v: string) => /^23\d{6}$|^23\d{8}$/.test(v);

export function cartonRefs(trackingNumber: string | null, secondTrack: string | null): CartonRefs {
  const out: CartonRefs = { tms: null, ups: null, pro: null, suspectTms: null };
  for (const raw of [trackingNumber, secondTrack]) {
    const v = raw?.trim().toUpperCase();
    if (!v) continue;
    if (isUps(v)) out.ups ??= v;
    else if (isTmsShipment(v)) out.tms ??= v;
    else if (nearTms(v)) out.suspectTms ??= v;
    else if (/^\d{6,15}$/.test(v)) out.pro ??= v;
  }
  if (out.pro && out.pro === out.tms) out.pro = null;
  return out;
}

export const upsTrackingUrl = (n: string) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(n)}`;

export interface CarrierLinkInfo {
  scac: string;
  name: string;
  mode: string | null;
  trackingUrl: string | null;
}

/**
 * Where a SCAC's link goes: the carrier's tracking page with {pro}, {shipment} and {po} filled in;
 * when a placeholder has no value, the page without its query. A carrier with no page set opens a
 * web search for its SCAC.
 */
export function carrierUrl(scac: string, link: CarrierLinkInfo | null | undefined, refs: { pro?: string | null; shipment?: string | null; po?: string | null }): { url: string; known: boolean } {
  if (link?.trackingUrl) {
    const values: Record<string, string | null | undefined> = { pro: refs.pro, shipment: refs.shipment, po: refs.po };
    let missing = false;
    const url = link.trackingUrl.replace(/\{(pro|shipment|po)\}/g, (_m, k: string) => {
      const v = values[k];
      if (!v) missing = true;
      return encodeURIComponent(v ?? "");
    });
    return { url: missing ? link.trackingUrl.split("?")[0] : url, known: true };
  }
  return { url: `https://www.google.com/search?q=${encodeURIComponent(`${scac} SCAC freight tracking`)}`, known: false };
}

/** A tracking link template must be an http(s) address; null when it isn't. */
export function cleanTrackingUrl(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s) return null;
  try {
    const u = new URL(s.replace(/\{(pro|shipment|po)\}/g, "x"));
    return u.protocol === "https:" || u.protocol === "http:" ? s : null;
  } catch {
    return null;
  }
}
