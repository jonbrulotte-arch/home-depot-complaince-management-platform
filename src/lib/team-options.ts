// Team pickers, safe for client components (src/lib/teams.ts reads the database).

export interface TeamOption {
  key: string;
  name: string;
  active: boolean;
}

/** The teams a picker offers: active ones, plus the one already chosen even if it's inactive. */
export function pickerTeams<T extends TeamOption>(teams: T[], current: string | null | undefined): T[] {
  return teams.filter((t) => t.active || t.key === current);
}
