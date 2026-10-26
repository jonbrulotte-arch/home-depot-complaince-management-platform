import type { Prisma } from "@prisma/client";

/** What each logged action means, as shown in Admin › App Log. Actions are written with `audit()` (`src/lib/audit.ts`). */
export const ACTION_LABELS: Record<string, string> = {
  "auth.signIn": "Signed in",
  "auth.signInFailed": "Failed sign-in",
  "auth.signOut": "Signed out",
  "report.create": "Created a compliance report",
  "report.update": "Updated a compliance report",
  "report.status": "Moved a report to another stage",
  "report.lineCount": "Entered a line count",
  "report.packageId": "Entered a Package ID",
  "report.shipments": "Entered shipment counts",
  "report.purge": "Purged a program's imports",
  "reports.historical": "Created historical reports",
  "import.confirm": "Imported an SPM export",
  "line.review": "Reviewed a line",
  "period.disputeWindow": "Changed a dispute window",
  "dispute.update": "Updated a dispute",
  "dispute.status": "Changed a dispute's status",
  "dispute.note": "Added a dispute note",
  "dispute.attach": "Attached a dispute document",
  "dispute.detach": "Removed a dispute document",
  "disputes.sync": "Created disputes for a report",
  "scorecard.generate": "Generated a scorecard",
  "scorecard.download": "Downloaded a scorecard",
  "feedback.create": "Gave scorecard feedback",
  "feedback.delete": "Deleted scorecard feedback",
  "package.export": "Exported a chargeback package",
  "summary.export": "Exported a Summarizer PDF",
  "appLog.export": "Exported the App Log",
  "user.create": "Added a user",
  "user.update": "Changed a user",
  "role.create": "Added a role",
  "role.update": "Changed a role",
  "role.delete": "Deleted a role",
  "metric.update": "Changed a metric",
  "rule.create": "Added a threshold/offset rule",
  "rule.delete": "Deleted a threshold/offset rule",
  "alias.create": "Added a column mapping",
  "alias.delete": "Deleted a column mapping",
  "reasonCode.create": "Added a dispute reason code",
  "reasonCode.update": "Changed a dispute reason code",
  "settings.branding": "Changed the branding",
  "settings.publicDashboard": "Changed the public dashboard link",
  "settings.reportPeriods": "Changed the report period basis",
  "backup.create": "Took a backup",
  "backup.download": "Downloaded a backup",
  "backup.delete": "Deleted a backup",
  "backup.restore": "Restored a backup",
};

/** Filter groups, by the action's prefix (the part before the dot) */
export const LOG_CATEGORIES = [
  { key: "signin", label: "Sign-ins", prefixes: ["auth"] },
  { key: "reports", label: "Reports & imports", prefixes: ["report", "reports", "import", "line", "period"] },
  { key: "disputes", label: "Disputes", prefixes: ["dispute", "disputes"] },
  { key: "scorecards", label: "Scorecards & feedback", prefixes: ["scorecard", "feedback"] },
  { key: "exports", label: "Lookups & exports", prefixes: ["package", "summary", "appLog"] },
  { key: "access", label: "Users & roles", prefixes: ["user", "role"] },
  { key: "config", label: "Configuration & settings", prefixes: ["metric", "rule", "alias", "reasonCode", "settings"] },
  { key: "backups", label: "Backups", prefixes: ["backup"] },
] as const;

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function actionCategory(action: string): string {
  const prefix = action.split(".")[0];
  return LOG_CATEGORIES.find((c) => (c.prefixes as readonly string[]).includes(prefix))?.label ?? "Other";
}

export interface LogFilters {
  q?: string;
  userId?: string;
  category?: string;
  /** YYYY-MM-DD, inclusive, in the server's time zone */
  from?: string;
  to?: string;
}

const isDay = (s: string | undefined): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));

/** Prisma filter for the App Log's search box, user, category and date range. */
export function logWhere(f: LogFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    // Event names match by their label too, so "package" finds "Exported a chargeback package"
    const actions = Object.entries(ACTION_LABELS)
      .filter(([, label]) => label.toLowerCase().includes(q.toLowerCase()))
      .map(([action]) => action);
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        { action: { in: actions } },
        { entity: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        // The email typed on a failed sign-in, which may belong to no user
        { details: { path: ["email"], string_contains: q.toLowerCase() } },
      ],
    });
  }
  if (f.userId === "none") and.push({ userId: null });
  else if (f.userId) and.push({ userId: f.userId });
  const category = LOG_CATEGORIES.find((c) => c.key === f.category);
  if (category) and.push({ OR: category.prefixes.map((p) => ({ action: { startsWith: `${p}.` } })) });
  if (isDay(f.from)) and.push({ at: { gte: new Date(`${f.from}T00:00:00`) } });
  if (isDay(f.to)) {
    const end = new Date(`${f.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    and.push({ at: { lt: end } });
  }
  return and.length ? { AND: and } : {};
}

/** The page in the app an entry is about, where there is one. */
export function entryLink(entity: string, entityId: string | null, details: unknown): string | null {
  const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>;
  const reportId = typeof d.reportId === "string" ? d.reportId : null;
  switch (entity) {
    case "ComplianceReport":
      return entityId ? `/reports/${entityId}` : "/reports";
    case "ImportBatch":
      return reportId ? `/reports/${reportId}` : null;
    case "Scorecard":
      return reportId ? `/reports/${reportId}/scorecard` : null;
    case "ScorecardFeedback":
      return reportId ? `/feedback/${reportId}` : null;
    case "ChargebackPackage":
      return entityId ? `/po-lookup/package/${encodeURIComponent(entityId)}` : null;
    case "User":
      return entityId ? "/admin/users" : null;
    case "Role":
      return "/admin/rbac";
    case "Metric":
    case "MetricRule":
    case "ColumnAlias":
    case "DisputeReasonCode":
      return "/admin/programs";
    case "SiteSettings":
      return "/admin/settings";
    case "Backup":
      return "/admin/backup";
    default:
      return null;
  }
}

/** The entry's details as short "key: value" pairs for the table; the full JSON is shown on request. */
export function detailPairs(details: unknown, max = 4): string[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return details == null ? [] : [String(JSON.stringify(details)).slice(0, 80)];
  return Object.entries(details as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, max)
    .map(([k, v]) => {
      const text = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k}: ${text.length > 60 ? `${text.slice(0, 57)}…` : text}`;
    });
}

/**
 * One CSV line, quoting every field. Text starting with = + - @ is prefixed with ' so a spreadsheet
 * doesn't run it as a formula (a failed sign-in logs whatever email was typed).
 */
export function csvLine(fields: (string | number | null | undefined)[]): string {
  return fields
    .map((f) => {
      const text = typeof f === "number" ? String(f) : String(f ?? "").replace(/^([=+\-@\t\r])/, "'$1");
      return `"${text.replace(/"/g, '""')}"`;
    })
    .join(",");
}
