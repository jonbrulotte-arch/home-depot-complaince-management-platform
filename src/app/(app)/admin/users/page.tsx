import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const me = await requirePagePermission("admin.users");
  const [users, roles] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { role: { select: { name: true } } } }),
    prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <UsersManager
        meId={me.id}
        roles={roles}
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, roleId: u.roleId, roleName: u.role.name, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
