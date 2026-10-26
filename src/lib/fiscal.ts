// THD fiscal months are numbered YYYYMM where month 01 is February, so FM 202408 is
// September 2024 and FM 202412 is January 2025.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isFiscalMonth(value: number): boolean {
  const month = value % 100;
  const year = Math.floor(value / 100);
  return Number.isInteger(value) && month >= 1 && month <= 12 && year >= 2000 && year <= 2100;
}

/** Calendar year and 0-based month a fiscal month mostly falls in. */
export function fiscalToCalendar(fiscalMonth: number): { year: number; month: number } {
  const fy = Math.floor(fiscalMonth / 100);
  const fm = fiscalMonth % 100;
  const month = fm % 12; // FM1 -> Feb (1), FM11 -> Dec (11), FM12 -> Jan (0)
  return { year: fm === 12 ? fy + 1 : fy, month };
}

export function calendarToFiscal(year: number, month: number): number {
  // month is 0-based; January belongs to the prior fiscal year as FM12
  if (month === 0) return (year - 1) * 100 + 12;
  return year * 100 + month;
}

export function fiscalLabel(fiscalMonth: number): string {
  const { year, month } = fiscalToCalendar(fiscalMonth);
  return `${MONTHS[month]} ${year}`;
}

export function shiftFiscalMonth(fiscalMonth: number, delta: number): number {
  const fy = Math.floor(fiscalMonth / 100);
  const index = fy * 12 + (fiscalMonth % 100) - 1 + delta;
  return Math.floor(index / 12) * 100 + (index % 12) + 1;
}

/** Parses folder or label text such as "Sep-2024", "Sept-2025", "July-2025" or "June 2026". */
export function parseMonthLabel(text: string): number | null {
  const match = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_-]*(\d{4})/i.exec(text);
  if (!match) return null;
  const month = MONTHS.findIndex((m) => m.toLowerCase() === match[1].toLowerCase());
  return calendarToFiscal(Number(match[2]), month);
}
