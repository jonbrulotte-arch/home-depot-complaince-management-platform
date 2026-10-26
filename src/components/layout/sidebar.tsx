"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  LayoutDashboard,
  ClipboardCheck,
  Gavel,
  FileBarChart,
  Search,
  Users,
  ShieldCheck,
  SlidersHorizontal,
  DatabaseBackup,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FileText,
  LifeBuoy,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import type { Permission } from "@/lib/permissions";
import type { Branding } from "@/lib/brand";
import { BrandMark } from "./brand-mark";

type NavItem = { href: string; label: string; icon: React.ElementType; permission: Permission };

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "view.dashboard" },
  { href: "/scorecards", label: "Scorecards", icon: FileBarChart, permission: "view.dashboard" },
  { href: "/reports", label: "Compliance Reports", icon: ClipboardCheck, permission: "reports.view" },
  { href: "/disputes", label: "Disputes", icon: Gavel, permission: "reports.view" },
  { href: "/po-lookup", label: "PO Lookup", icon: Search, permission: "view.polookup" },
  { href: "/feedback", label: "Scorecard Feedback", icon: MessageSquare, permission: "feedback.view" },
  { href: "/summarizer", label: "Summarizer", icon: FileText, permission: "summarizer.use" },
];

/** Open to everyone, below the other sections */
const helpItem = { href: "/help", label: "Help & Docs", icon: LifeBuoy };

const adminNavItems: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users, permission: "admin.users" },
  { href: "/admin/rbac", label: "Roles & Access", icon: ShieldCheck, permission: "admin.rbac" },
  { href: "/admin/programs", label: "Programs & Rules", icon: SlidersHorizontal, permission: "admin.programs" },
  { href: "/admin/backup", label: "Backup & Restore", icon: DatabaseBackup, permission: "admin.backup" },
  { href: "/admin/settings", label: "Settings", icon: Settings, permission: "admin.settings" },
];

// Exact match or a child route, so "/psir" doesn't also light up "/psir-generator".
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function Sidebar({ user, permissions, branding }: { user: { name: string; role: string }; permissions: Permission[]; branding: Branding }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const granted = new Set(permissions);
  const visibleNav = navItems.filter((i) => granted.has(i.permission));
  const visibleAdmin = adminNavItems.filter((i) => granted.has(i.permission));

  const renderItem = ({ href, label, icon: Icon }: Pick<NavItem, "href" | "label" | "icon">) => (
    <Link
      key={href}
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
        isActive(pathname, href) ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );

  return (
    <aside className={cn("flex flex-col h-screen bg-gray-900 text-white transition-all duration-200 shrink-0", collapsed ? "w-16" : "w-56")}>
      <div className="flex items-center h-14 px-4 border-b border-gray-700">
        <BrandMark branding={branding} collapsed={collapsed} />
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {visibleNav.map(renderItem)}
        {visibleAdmin.length > 0 && (
          <>
            <div className={cn("pt-4 pb-1", collapsed ? "px-0" : "px-2")}>
              {!collapsed && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</p>}
            </div>
            {visibleAdmin.map(renderItem)}
          </>
        )}
        <div className="pt-4">{renderItem(helpItem)}</div>
      </nav>

      <div className="border-t border-gray-700 p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
            {getInitials(user.name)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.role}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-8 border-t border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
