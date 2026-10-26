import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { PERMISSIONS } from "@/lib/permissions";
import { RoleMatrix } from "./role-matrix";

export default async function RbacPage() {
  await requirePagePermission("admin.rbac");
  const roles = await prisma.role.findMany({ orderBy: [{ system: "desc" }, { name: "asc" }], include: { _count: { select: { users: true } } } });
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <RoleMatrix
        permissions={Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label }))}
        roles={roles.map((r) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions, system: r.system, users: r._count.users }))}
      />
    </div>
  );
}
