export const PERMISSIONS = {
  "view.dashboard": "View dashboard and scorecards",
  "view.polookup": "Use PO Lookup",
  "reports.view": "View compliance reports",
  "reports.create": "Create compliance reports",
  "reports.import": "Import SPM data into reports",
  "reports.advance": "Advance report status",
  "lines.triage": "Review and triage non-compliant lines",
  "disputes.manage": "Manage disputes",
  "feedback.view": "View published scorecards and their violation feedback",
  "feedback.submit": "Give feedback on scorecard violations",
  "summarizer.use": "Build scorecard summaries to email the team",
  "admin.users": "Manage users",
  "admin.rbac": "Manage roles and permissions",
  "admin.programs": "Manage programs, metrics, thresholds and column mappings",
  "admin.backup": "Backup and restore",
  "admin.settings": "Manage site settings and branding",
  "admin.audit": "View the audit log",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  { name: "Admin", description: "Full access", permissions: ALL_PERMISSIONS },
  {
    name: "Analyst",
    description: "Creates reports, imports data and triages lines",
    permissions: [
      "view.dashboard",
      "view.polookup",
      "reports.view",
      "reports.create",
      "reports.import",
      "reports.advance",
      "lines.triage",
      "disputes.manage",
      "feedback.view",
      "feedback.submit",
      "summarizer.use",
    ],
  },
  { name: "Viewer", description: "Read-only dashboard and PO Lookup", permissions: ["view.dashboard", "view.polookup"] },
  {
    name: "Warehouse",
    description: "Warehouse team: reviews published scorecards and gives feedback on violations",
    permissions: ["feedback.view", "feedback.submit"],
  },
];

/** Landing pages in order of preference; a user starts on the first one their role allows. */
const HOME_PAGES: [Permission, string][] = [
  ["view.dashboard", "/dashboard"],
  ["reports.view", "/reports"],
  ["feedback.view", "/feedback"],
  ["view.polookup", "/po-lookup"],
  ["admin.users", "/admin/users"],
  ["admin.settings", "/admin/settings"],
];

export function homePath(permissions: Set<Permission>): string {
  return HOME_PAGES.find(([p]) => permissions.has(p))?.[1] ?? "/no-access";
}

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
