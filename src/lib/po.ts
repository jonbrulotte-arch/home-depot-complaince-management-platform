// THD reuses PO numbers, so a PO record is one use of a number: the number plus the PO create
// date from the exports. This module is database-free so the rules can be unit-tested.

/** "1127217279|2026-04-21", or "1127217279|" when no export has given the create date */
export function poInstanceKey(poNumber: string, createDate: Date | null | undefined): string {
  return `${poNumber}|${createDate ? createDate.toISOString().slice(0, 10) : ""}`;
}

/** The date a line without a PO create date is anchored on, to find which use of the PO it belongs to */
export function lineAnchorDate(fields: {
  trailerCheckIn?: Date | null;
  actualShipDate?: Date | null;
  pickupRequestDate?: Date | null;
  estShipDate?: Date | null;
  expectedArrivalDate?: Date | null;
  closedDate?: Date | null;
}): Date | null {
  return fields.trailerCheckIn ?? fields.actualShipDate ?? fields.pickupRequestDate ?? fields.estShipDate ?? fields.expectedArrivalDate ?? fields.closedDate ?? null;
}

/**
 * Which use of a PO number a line without a create date belongs to: the latest one created on or
 * before the line's anchor date, else the earliest; without an anchor, the latest. Records
 * without a create date are used only when no dated one exists.
 */
export function pickPoInstance<T extends { poCreateDate: Date | null }>(records: T[], anchor: Date | null): T | null {
  const dated = records.filter((r) => r.poCreateDate).sort((a, b) => b.poCreateDate!.getTime() - a.poCreateDate!.getTime());
  if (!dated.length) return records[0] ?? null;
  if (!anchor) return dated[0];
  return dated.find((r) => r.poCreateDate!.getTime() <= anchor.getTime()) ?? dated[dated.length - 1];
}
