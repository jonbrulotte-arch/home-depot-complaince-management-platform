import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guard";
import { HELP_TOPICS, helpTopicsFor } from "@/lib/help-content";
import { prisma } from "@/lib/prisma";
import { seesAllSops, sopsFor } from "@/lib/sops";
import { HelpBrowser } from "./help-browser";

// Help & Docs: open to every signed-in user; topics follow the role unless ?all=1
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const all = (await searchParams).all === "1";
  const topics = helpTopicsFor(user.permissions, all);
  const isAdmin = seesAllSops(user);
  const [sopRows, roles] = await Promise.all([sopsFor(user), isAdmin ? prisma.role.findMany({ select: { id: true, name: true } }) : []]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  // Admins see every SOP with the roles it is for; everyone else only their role's
  const sops = sopRows.map((s) => ({
    id: s.id,
    title: s.title,
    size: s.size,
    roles: isAdmin ? s.roleIds.map((id) => roleName.get(id)).filter((n): n is string => !!n) : null,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; Docs</h1>
        <p className="text-sm text-gray-500 mt-1">How the platform works, step by step, for the parts your role uses.</p>
      </div>
      <HelpBrowser topics={topics} allShown={all} hiddenCount={HELP_TOPICS.length - helpTopicsFor(user.permissions).length} sops={sops} isAdmin={isAdmin} />
    </div>
  );
}
