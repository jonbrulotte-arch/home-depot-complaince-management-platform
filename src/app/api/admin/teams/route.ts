import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { parseTeamAddresses, teamKeyFor } from "@/lib/teams";

const teamSchema = z.object({
  name: z.string().trim().min(1, "is required").max(60),
  description: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((d) => d || null),
  /** Addresses for Logistics › Send Email, separated by commas */
  emailTo: z.string().max(2000).optional(),
  emailCc: z.string().max(2000).optional(),
});

/** Adds a team responsible, at the end of the list. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.teams");
  if (guard.error) return guard.error;
  const body = await parseJson(req, teamSchema);
  if (body.error) return body.error;
  const emails = parseTeamAddresses(body.data);
  if ("error" in emails) return badRequest(emails.error);
  const teams = await prisma.team.findMany({ select: { key: true, name: true, sortOrder: true } });
  if (teams.some((t) => t.name.toLowerCase() === body.data.name.toLowerCase())) return badRequest("A team with that name already exists");
  const team = await prisma.team.create({
    data: {
      key: teamKeyFor(body.data.name, teams.map((t) => t.key)),
      name: body.data.name,
      description: body.data.description,
      emailTo: emails.emailTo ?? [],
      emailCc: emails.emailCc ?? [],
      sortOrder: Math.max(0, ...teams.map((t) => t.sortOrder)) + 10,
    },
    select: { id: true, key: true },
  });
  await audit(guard.user.id, "team.create", "Team", team.id, { name: body.data.name, key: team.key });
  return NextResponse.json(team, { status: 201 });
}
