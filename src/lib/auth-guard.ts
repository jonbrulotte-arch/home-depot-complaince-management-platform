import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPermission, type Permission } from "@/lib/permissions";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: Set<Permission>;
}

/** The signed-in, active user with permissions loaded from their role (cached per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, include: { role: true } });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
    permissions: new Set(user.role.permissions.filter(isPermission)),
  };
});

/** For server pages: redirects to /login when signed out and /dashboard when not permitted. */
export async function requirePagePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.has(permission)) redirect("/dashboard");
  return user;
}

type GuardResult = { user: CurrentUser; error?: never } | { user?: never; error: NextResponse };

/** For route handlers: returns the user, or a 401/403 response to send back. */
export async function requireApiPermission(permission: Permission): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!user.permissions.has(permission)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}
