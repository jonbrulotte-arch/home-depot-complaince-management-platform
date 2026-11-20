// Channels (Admin › Settings): which channel a PO belongs to, from the WMS report's CUST_NUM ("THD"
// is the Rapid Distribution Center, "THD.COM-DFDC" the Direct Fulfillment Center). Pure and safe in
// the browser.

export interface ChannelInfo {
  /** The CUST_NUM value, upper case */
  code: string;
  name: string;
}

/** The filter value for POs, shipments and parcels whose channel isn't known */
export const UNKNOWN_CHANNEL = "none";

/** A CUST_NUM as stored: trimmed, upper case */
export const cleanChannelCode = (s: string) => s.trim().toUpperCase();

/** The channel a CUST_NUM belongs to (an exact match, ignoring case and spaces at the ends) */
export function channelOf(custNum: string | null | undefined, channels: ChannelInfo[]): ChannelInfo | null {
  const v = custNum ? cleanChannelCode(custNum) : "";
  return v ? (channels.find((c) => cleanChannelCode(c.code) === v) ?? null) : null;
}

/** The channels of some WMS cartons, in the admins' order */
export function channelsOf(cartons: { customer?: string | null }[], channels: ChannelInfo[]): ChannelInfo[] {
  const found = new Set(cartons.map((c) => channelOf(c.customer, channels)?.code).filter(Boolean));
  return channels.filter((c) => found.has(c.code));
}

/** Whether an item's channels match a filter value (a code, or UNKNOWN_CHANNEL) */
export function matchesChannel(items: ChannelInfo[], ch: string | undefined): boolean {
  if (!ch) return true;
  if (ch === UNKNOWN_CHANNEL) return items.length === 0;
  return items.some((c) => c.code === ch);
}

/** Names for display, e.g. "Direct Fulfillment Center (DFC)" */
export const channelNames = (items: ChannelInfo[]) => items.map((c) => c.name).join(", ");
