export const PERMISSIONS = {
  "view.dashboard": "View dashboard and scorecards",
  "view.polookup": "Use PO Lookup",
  "reports.view": "View compliance reports",
  "reports.create": "Create compliance reports",
  "reports.import": "Import SPM data into reports",
  "reports.advance": "Advance report status",
  "lines.triage": "Review and triage non-compliant lines",
  "disputes.manage": "Manage disputes",
  "admin.users": "Manage users",
  "admin.rbac": "Manage roles and permissions",
  "admin.programs": "Manage programs, metrics, thresholds and column mappings",
  "admin.backup": "Backup and restore",
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
    ],
  },
  { name: "Viewer", description: "Read-only dashboard and PO Lookup", permissions: ["view.dashboard", "view.polookup"] },
];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
