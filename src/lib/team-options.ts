// Team pickers, safe for client components (src/lib/teams.ts reads the database).

import { parseAddresses } from "@/lib/email-address";

export interface TeamOption {
  key: string;
  name: string;
  active: boolean;
}

/** The teams a picker offers: active ones, plus the one already chosen even if it's inactive. */
export function pickerTeams<T extends TeamOption>(teams: T[], current: string | null | undefined): T[] {
  return teams.filter((t) => t.active || t.key === current);
}

/** A team's To and Cc addresses as typed in Admin › Teams (undefined = not sent); an error names the bad field */
export function parseTeamAddresses(input: { emailTo?: string; emailCc?: string }): { emailTo?: string[]; emailCc?: string[] } | { error: string } {
  const to = input.emailTo === undefined ? undefined : parseAddresses(input.emailTo);
  const cc = input.emailCc === undefined ? undefined : parseAddresses(input.emailCc);
  if (to === null) return { error: "Check the To addresses (separate them with commas)" };
  if (cc === null) return { error: "Check the Cc addresses (separate them with commas)" };
  // An address in both stays in To only
  return { emailTo: to, emailCc: cc && to ? cc.filter((a) => !to.some((t) => t.toLowerCase() === a.toLowerCase())) : cc };
}
