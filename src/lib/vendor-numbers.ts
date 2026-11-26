// THD vendor numbers assigned to programs (Admin › Programs & Rules, `Program.vendorNumbers`).
// POM's Vendor # and SPM's M-Vendor are the same numbers, so a vendor number tells which program
// an order belongs to when nothing else does. Pure: used by the route and the Cancellations analysis.

/** A vendor number as stored and compared: digits only, without leading zeros; null when it isn't one */
export function normalizeVendorNumber(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!/^\d{1,12}$/.test(s)) return null;
  return s.replace(/^0+(?=\d)/, "");
}

/** Vendor numbers typed as a list (commas, spaces or new lines): the valid ones, unique and in order, and what wasn't a number */
export function parseVendorNumbers(input: string | string[]): { numbers: string[]; invalid: string[] } {
  const parts = (Array.isArray(input) ? input : input.split(/[\s,;]+/)).map((s) => s.trim()).filter(Boolean);
  const numbers: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    const n = normalizeVendorNumber(p);
    if (n === null) invalid.push(p);
    else if (!numbers.includes(n)) numbers.push(n);
  }
  return { numbers, invalid };
}

export interface VendorProgram {
  code: string;
  name: string;
}

/** Vendor number → program, from each program's list */
export function vendorProgramMap(programs: { code: string; name: string; vendorNumbers: string[] }[]): Map<string, VendorProgram> {
  const map = new Map<string, VendorProgram>();
  for (const p of programs) for (const v of p.vendorNumbers) if (!map.has(v)) map.set(v, { code: p.code, name: p.name });
  return map;
}

/** The program a vendor number belongs to, if any */
export function programOfVendor(map: Map<string, VendorProgram>, vendor: string | null | undefined): VendorProgram | null {
  const n = normalizeVendorNumber(vendor);
  return n === null ? null : (map.get(n) ?? null);
}

/** The numbers in `numbers` already assigned to another program, with that program's name */
export function vendorConflicts(numbers: string[], others: { name: string; vendorNumbers: string[] }[]): { vendor: string; program: string }[] {
  return numbers.flatMap((v) => {
    const o = others.find((p) => p.vendorNumbers.includes(v));
    return o ? [{ vendor: v, program: o.name }] : [];
  });
}
