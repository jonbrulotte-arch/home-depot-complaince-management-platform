import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { UsersManager } from "./users-manager";
import { inviteState } from "@/lib/invites";

export default async function UsersPage() {
  const me = await requirePagePermission("admin.users");
  const [users, roles, invites] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { role: { select: { name: true } } } }),
    prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.userInvite.findMany({
      where: { acceptedAt: null, revokedAt: null },
      orderBy: { sentAt: "desc" },
      include: { role: { select: { name: true } }, invitedBy: { select: { name: true } } },
    }),
  ]);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <UsersManager
        meId={me.id}
        invites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          name: i.name,
          roleName: i.role.name,
          invitedBy: i.invitedBy?.name ?? null,
          sentAt: i.sentAt.toISOString(),
          expiresAt: i.expiresAt.toISOString(),
          expired: inviteState(i) === "expired",
          emailed: i.emailed,
        }))}
        roles={roles}
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, roleId: u.roleId, roleName: u.role.name, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
