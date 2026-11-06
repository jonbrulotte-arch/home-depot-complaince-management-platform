import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Teams responsible (Admin › Teams): who a violation or an issue is put on. Reviews and issues
// store the team's key, which never changes, so a renamed team shows its new name everywhere.
// Published scorecards are snapshots and keep the name the team had when they were generated.

import type { TeamOption } from "@/lib/team-options";

export { pickerTeams, type TeamOption } from "@/lib/team-options";

/** Every team, in the admins' order (cached per request). */
export const getTeams = cache(async (): Promise<(TeamOption & { id: string; description: string | null; sortOrder: number })[]> =>
  prisma.team.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, key: true, name: true, description: true, active: true, sortOrder: true } }),
);

/** Team names by key, for showing stored keys. */
export async function teamNames(): Promise<Record<string, string>> {
  return Object.fromEntries((await getTeams()).map((t) => [t.key, t.name]));
}

/** Whether a key may be saved on a review or issue: an active team, or the one it already has. */
export async function isAssignableTeam(key: string, current: string | null | undefined): Promise<boolean> {
  if (key === current) return true;
  const team = await prisma.team.findUnique({ where: { key }, select: { active: true } });
  return Boolean(team?.active);
}

/** A key for a new team from its name: upper case, A–Z, 0–9 and underscores, unique among `taken`. */
export function teamKeyFor(name: string, taken: string[]): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // drop accents: É becomes E
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase()
      .slice(0, 40) || "TEAM";
  const used = new Set(taken.map((t) => t.toUpperCase()));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
}
