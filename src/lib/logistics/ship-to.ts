// The WMS ship-to (where the warehouse sent a PO): THD's Store/DC number, name and full address, from
// the WMS report's ship_to, ship_name, ship_add1–3, ship_city, ship_prov and ship_zip. Pure (unit-tested).

export interface ShipToFields {
  shipTo?: string | null;
  shipName?: string | null;
  shipAddress1?: string | null;
  shipAddress2?: string | null;
  shipAddress3?: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
}

export interface ShipTo {
  /** THD's Store/DC number: ship_to, else the number in the name, else another line's for the same address */
  facility: string | null;
  name: string | null;
  /** Street lines (ship_add1–3), blanks left out */
  street: string[];
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** A Store/DC number for comparing: digits without leading zeros, else the value in upper case */
export const facilityKey = (f: string | null | undefined) => {
  const v = (f ?? "").trim().toUpperCase();
  return /^\d+$/.test(v) ? v.replace(/^0+(?=\d)/, "") : v;
};

/** The Store/DC number written into a ship-to name: "The Home Depot-5023", "DFC - DALLAS DFC #5823" */
export function facilityFromName(name: string | null | undefined): string | null {
  const m = (name ?? "").match(/#\s*(\d{3,5})\b/) ?? (name ?? "").match(/-\s*(\d{3,5})\s*$/);
  return m ? m[1] : null;
}

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/,+$/, "").replace(/\s+/g, " ");

/** A key for the street address, to find the Store/DC of lines that don't give it */
export const addressKey = (c: Pick<ShipToFields, "shipAddress1" | "shipZip">) => {
  const street = clean(c.shipAddress1).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const zip = clean(c.shipZip).slice(0, 5);
  return street && zip ? `${street}|${zip}` : "";
};

/** The facility a line names itself */
const ownFacility = (c: ShipToFields) => clean(c.shipTo) || facilityFromName(c.shipName);

/** Store/DC numbers by street address, from the lines that name theirs */
export function facilityIndex(lines: ShipToFields[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of lines) {
    const f = ownFacility(c);
    const k = addressKey(c);
    if (f && k && !out.has(k)) out.set(k, f);
  }
  return out;
}

/** One line's ship-to */
export function shipToOf(c: ShipToFields, index?: Map<string, string>): ShipTo {
  return {
    facility: ownFacility(c) || index?.get(addressKey(c)) || null,
    name: clean(c.shipName) || null,
    street: [c.shipAddress1, c.shipAddress2, c.shipAddress3].map(clean).filter(Boolean),
    city: clean(c.shipCity) || null,
    state: clean(c.shipState) || null,
    zip: clean(c.shipZip) || null,
  };
}

/** A PO's ship-to: the one most of its lines have (lines with a street address first); null without lines */
export function poShipTo(lines: ShipToFields[], index?: Map<string, string>): ShipTo | null {
  if (!lines.length) return null;
  const withStreet = lines.filter((c) => clean(c.shipAddress1));
  const pool = withStreet.length ? withStreet : lines;
  const counts = new Map<string, { n: number; line: ShipToFields }>();
  for (const c of pool) {
    const k = addressKey(c) || `${clean(c.shipCity)}|${clean(c.shipState)}`;
    const g = counts.get(k) ?? { n: 0, line: c };
    g.n++;
    // Prefer a line that names its Store/DC, best in ship_to (the newer report's fuller lines)
    if ((!ownFacility(g.line) && ownFacility(c)) || (!clean(g.line.shipTo) && clean(c.shipTo))) g.line = c;
    counts.set(k, g);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0].line;
  return shipToOf(best, index);
}

/** "JOLIET, IL 60436" */
export function cityLine(city: string | null, state: string | null, zip: string | null): string {
  return [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
}

/** The address as lines: street lines, then city, state and ZIP */
export const addressLines = (s: ShipTo) => [...s.street, cityLine(s.city, s.state, s.zip)].filter(Boolean);

/** Whether the ship-to's name is only the brand ("The Home Depot", "HomeDepot.com"), not a particular DC */
export const genericName = (name: string | null) => !name || /^(the\s*)?home\s*depot(\.com)?$/i.test(name.trim());
