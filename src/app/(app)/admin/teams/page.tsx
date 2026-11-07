import { requirePagePermission } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { TeamsManager } from "./teams-manager";

/** Admin › Teams: the teams a violation or an issue can be put on. */
export default async function TeamsPage() {
  await requirePagePermission("admin.teams");
  const teams = await prisma.team.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, key: true, name: true, description: true, active: true, _count: { select: { reviews: true, issues: true } } },
  });
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <TeamsManager teams={teams.map((t) => ({ id: t.id, key: t.key, name: t.name, description: t.description, active: t.active, reviews: t._count.reviews, issues: t._count.issues }))} />
    </div>
  );
}
