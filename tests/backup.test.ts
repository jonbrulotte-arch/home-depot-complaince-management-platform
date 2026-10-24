import { gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { BackupError, backupName, isBackupName, readBackup, TABLE_ORDER } from "@/lib/backup";

describe("backups", () => {
  it("covers every model in the schema", () => {
    const models = Prisma.dmmf.datamodel.models.map((m) => m.name).sort();
    expect([...TABLE_ORDER].sort()).toEqual(models);
  });

  it("names files safely and rejects anything else", () => {
    const name = backupName(new Date("2026-10-22T21:05:09Z"), "Before June Import!");
    expect(name).toBe("sympl-cm-backup-20261022-210509-before-june-import.json.gz");
    expect(isBackupName(name)).toBe(true);
    expect(isBackupName("../../etc/passwd")).toBe(false);
    expect(isBackupName("sympl-cm-backup-20261022-210509.json.gz/../x")).toBe(false);
  });

  it("rejects files that are not backups", () => {
    expect(() => readBackup(Buffer.from("not gzip"))).toThrow(BackupError);
    expect(() => readBackup(gzipSync(Buffer.from(JSON.stringify({ format: "other" }))))).toThrow(/not a backup from this platform/);
    const unknown = { format: "sympl-cm-backup", formatVersion: 1, tables: { Secrets: [] } };
    expect(() => readBackup(gzipSync(Buffer.from(JSON.stringify(unknown))))).toThrow(/unknown tables/);
  });
});
