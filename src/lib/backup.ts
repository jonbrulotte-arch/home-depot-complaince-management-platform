import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";

// Logical backups: every table as JSON, gzipped. They need no pg_dump on the server and
// restore into any instance at the same schema migration.

export const BACKUP_FORMAT = "sympl-cm-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Every model, parents before children, so inserts satisfy foreign keys (deletes run in
 * reverse). tests/backup.test.ts fails when a model is missing, so new tables are not
 * silently left out of backups.
 */
export const TABLE_ORDER = [
  "Role",
  "User",
  "AuditLog",
  "Program",
  "Metric",
  "MetricRule",
  "ColumnAlias",
  "DisputeReasonCode",
  "CompliancePeriod",
  "ComplianceReport",
  "ReportProgram",
  "ImportBatch",
  "SpmSummaryRow",
  "PoRecord",
  "ComplianceLine",
  "LineReview",
  "Dispute",
  "DisputeEvent",
  "DisputeAttachment",
  "Scorecard",
  "ShipmentCount",
  "LineCount",
  "ChargebackPackage",
  "ScorecardFeedback",
  "ScorecardHit",
  "SiteSettings",
] as const;

type Row = Record<string, unknown>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  /** Latest applied Prisma migration; restores require the same one */
  migration: string;
  createdAt: string;
  label: string | null;
  counts: Record<string, number>;
  tables: Record<string, Row[]>;
}

export class BackupError extends Error {}

const delegate = (db: PrismaClient | Prisma.TransactionClient, model: string) =>
  (db as unknown as Record<string, { findMany: (a?: object) => Promise<Row[]>; createMany: (a: { data: Row[] }) => Promise<unknown>; deleteMany: () => Promise<unknown> }>)[
    model.charAt(0).toLowerCase() + model.slice(1)
  ];

function fieldsOfType(model: string, type: string): string[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  return (m?.fields ?? []).filter((f) => f.kind === "scalar" && f.type === type).map((f) => f.name);
}

export async function latestMigration(db: PrismaClient): Promise<string> {
  const rows = await db.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC, migration_name DESC LIMIT 1`;
  if (!rows.length) throw new BackupError("The database has no applied migrations");
  return rows[0].migration_name;
}

/** Reads every table into a gzipped backup. */
export async function createBackup(db: PrismaClient, label: string | null = null): Promise<{ buffer: Buffer; backup: Omit<BackupFile, "tables"> }> {
  const tables: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  for (const model of TABLE_ORDER) {
    const bytes = fieldsOfType(model, "Bytes");
    // Ordered so two backups of the same data are identical
    const rows = await delegate(db, model).findMany({ orderBy: { id: "asc" } });
    tables[model] = rows.map((row) => {
      const out: Row = { ...row };
      for (const f of bytes) if (out[f] != null) out[f] = Buffer.from(out[f] as Uint8Array).toString("base64");
      return out;
    });
    counts[model] = rows.length;
  }
  const meta = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    migration: await latestMigration(db),
    createdAt: new Date().toISOString(),
    label,
    counts,
  } as const;
  const backup: BackupFile = { ...meta, tables };
  return { buffer: gzipSync(Buffer.from(JSON.stringify(backup))), backup: meta };
}

/** Parses and checks a backup file without touching the database. */
export function readBackup(buffer: Buffer): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(buffer).toString("utf8"));
  } catch {
    throw new BackupError("This is not a backup from this platform (expected a .json.gz file)");
  }
  const b = parsed as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT || typeof b.tables !== "object" || !b.tables) throw new BackupError("This is not a backup from this platform");
  if (b.formatVersion !== BACKUP_FORMAT_VERSION) throw new BackupError(`Unsupported backup format version ${b.formatVersion}`);
  const unknown = Object.keys(b.tables).filter((t) => !(TABLE_ORDER as readonly string[]).includes(t));
  if (unknown.length) throw new BackupError(`Backup contains unknown tables: ${unknown.join(", ")}`);
  return b as BackupFile;
}

/**
 * Replaces all data with the backup's, in one transaction: on any error nothing changes.
 * The backup must come from the same schema migration as this database.
 */
export async function restoreBackup(db: PrismaClient, backup: BackupFile): Promise<Record<string, number>> {
  const current = await latestMigration(db);
  if (backup.migration !== current) {
    throw new BackupError(`This backup was taken at schema migration "${backup.migration}" but the database is at "${current}". Restore it into an instance at the same version.`);
  }
  const counts: Record<string, number> = {};
  await db.$transaction(
    async (tx) => {
      for (const model of [...TABLE_ORDER].reverse()) await delegate(tx, model).deleteMany();
      for (const model of TABLE_ORDER) {
        const bytes = fieldsOfType(model, "Bytes");
        const json = fieldsOfType(model, "Json");
        const rows = (backup.tables[model] ?? []).map((row) => {
          const out: Row = { ...row };
          for (const f of bytes) if (typeof out[f] === "string") out[f] = Buffer.from(out[f] as string, "base64");
          // A null in an optional Json column has to be written as a database NULL
          for (const f of json) if (out[f] === null) out[f] = Prisma.DbNull;
          return out;
        });
        for (let i = 0; i < rows.length; i += 1000) await delegate(tx, model).createMany({ data: rows.slice(i, i + 1000) });
        counts[model] = rows.length;
      }
    },
    { timeout: 600_000, maxWait: 30_000 },
  );
  return counts;
}

// ─── Server-side backup files ──────────────────────────────────

const NAME = /^sympl-cm-backup-\d{8}-\d{6}(-[a-z0-9-]{1,40})?\.json\.gz$/;

// The turbopackIgnore hints stop the build tracing the whole project for these runtime paths
export function backupDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.BACKUP_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "backups"));
}

export function isBackupName(name: string): boolean {
  return NAME.test(name);
}

export function backupName(date: Date, label: string | null): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const slug = label?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  return `sympl-cm-backup-${stamp}${slug ? `-${slug}` : ""}.json.gz`;
}

export async function saveBackup(db: PrismaClient, label: string | null): Promise<{ name: string; size: number; counts: Record<string, number> }> {
  const { buffer, backup } = await createBackup(db, label);
  const dir = backupDir();
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const name = backupName(new Date(backup.createdAt), label);
  await writeFile(/* turbopackIgnore: true */ path.join(dir, name), buffer);
  return { name, size: buffer.length, counts: backup.counts };
}

export async function listBackups(): Promise<{ name: string; size: number; createdAt: string }[]> {
  const dir = backupDir();
  const names = await readdir(/* turbopackIgnore: true */ dir).catch(() => [] as string[]);
  const files = await Promise.all(
    names.filter(isBackupName).map(async (name) => {
      const s = await stat(/* turbopackIgnore: true */ path.join(dir, name));
      return { name, size: s.size, createdAt: s.mtime.toISOString() };
    }),
  );
  return files.sort((a, b) => b.name.localeCompare(a.name));
}

export async function readBackupFile(name: string): Promise<Buffer> {
  if (!isBackupName(name)) throw new BackupError("Invalid backup name");
  return readFile(/* turbopackIgnore: true */ path.join(backupDir(), name)).catch(() => {
    throw new BackupError("Backup not found");
  });
}

export async function deleteBackupFile(name: string): Promise<void> {
  if (!isBackupName(name)) throw new BackupError("Invalid backup name");
  await rm(/* turbopackIgnore: true */ path.join(backupDir(), name));
}

/** Keeps the newest `keep` backups whose name carries `label`; returns the names removed. */
export async function pruneBackups(label: string, keep: number): Promise<string[]> {
  const matching = (await listBackups()).filter((b) => b.name.endsWith(`-${label}.json.gz`));
  const remove = matching.slice(keep).map((b) => b.name);
  for (const name of remove) await deleteBackupFile(name);
  return remove;
}
