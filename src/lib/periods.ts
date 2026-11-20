import { cache } from "react";
import type { PeriodBasis, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Reports group lines either by the month they were received (the monthly report they arrived
// in, matching the team's workbooks) or by THD's fiscal month on each line. Fill Rate is
// assessed about eight weeks after the expected arrival, so it arrives a month or two later
// than its fiscal month. Admins choose the basis under Admin › Settings.

export type PeriodField = "receivedMonth" | "fiscalMonth";

export const PERIOD_BASIS_LABELS: Record<PeriodBasis, string> = {
  RECEIVED_MONTH: "Month received",
  FISCAL_MONTH: "THD fiscal month",
};

export const getPeriodBasis = cache(async (): Promise<PeriodBasis> => {
  const s = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { reportPeriodBasis: true } });
  return s?.reportPeriodBasis ?? "RECEIVED_MONTH";
});

export async function getPeriodField(): Promise<PeriodField> {
  return (await getPeriodBasis()) === "FISCAL_MONTH" ? "fiscalMonth" : "receivedMonth";
}

/** Lines that belong to a period (an exact month or a range filter) under the chosen basis. */
export function linesInPeriod(field: PeriodField, month: number | Prisma.IntFilter): Prisma.ComplianceLineWhereInput {
  return field === "receivedMonth" ? { receivedMonth: month } : { fiscalMonth: month };
}

/** The period a line belongs to under the chosen basis. */
export function periodOf(field: PeriodField, line: { fiscalMonth: number; receivedMonth: number }): number {
  return line[field];
}
