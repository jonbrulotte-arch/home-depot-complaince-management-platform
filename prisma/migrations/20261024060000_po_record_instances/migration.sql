-- THD reuses PO numbers, so a PO record becomes one use of a number: the number plus its PO
-- create date ("instanceKey"). Records were one per number, dated by the first line seen.

-- Several records may now share a number, so the one-per-number index goes first
DROP INDEX "PoRecord_poNumber_key";
ALTER TABLE "PoRecord" ADD COLUMN "instanceKey" TEXT;
UPDATE "PoRecord" SET "instanceKey" = "poNumber" || '|' || COALESCE(to_char("poCreateDate", 'YYYY-MM-DD'), '');

-- A record for each other create date the lines carry, with the vendor details of the record
-- the lines were on
INSERT INTO "PoRecord" ("id", "poNumber", "instanceKey", "pVendor", "mVendor", "mVendorName", "dept", "dcNumber", "poCreateDate", "firstSeenAt", "lastSeenAt")
SELECT gen_random_uuid()::text, x."poNumber", x."key", r."pVendor", r."mVendor", r."mVendorName", r."dept", x."dcNumber", x."created", x."firstSeen", x."lastSeen"
FROM (
  SELECT l."poNumber",
         l."poNumber" || '|' || to_char(l."poCreateDate", 'YYYY-MM-DD') AS "key",
         date_trunc('day', MIN(l."poCreateDate")) AS "created",
         MIN(l."dcNumber") AS "dcNumber",
         MIN(l."poRecordId") AS "recordId",
         MIN(b."importedAt") AS "firstSeen",
         MAX(b."importedAt") AS "lastSeen"
  FROM "ComplianceLine" l JOIN "ImportBatch" b ON b.id = l."batchId"
  WHERE l."poNumber" IS NOT NULL AND l."poCreateDate" IS NOT NULL
  GROUP BY l."poNumber", to_char(l."poCreateDate", 'YYYY-MM-DD')
) x
LEFT JOIN "PoRecord" r ON r.id = x."recordId"
WHERE NOT EXISTS (SELECT 1 FROM "PoRecord" p WHERE p."instanceKey" = x."key");

-- Lines with a create date move to the record for it; lines without one stay where they are
UPDATE "ComplianceLine" l SET "poRecordId" = p.id
FROM "PoRecord" p
WHERE l."poNumber" IS NOT NULL AND l."poCreateDate" IS NOT NULL
  AND p."instanceKey" = l."poNumber" || '|' || to_char(l."poCreateDate", 'YYYY-MM-DD')
  AND l."poRecordId" IS DISTINCT FROM p.id;

-- Lines without a date join the dated record when their PO number has exactly one
UPDATE "ComplianceLine" l SET "poRecordId" = d.id
FROM "PoRecord" u, "PoRecord" d
WHERE l."poRecordId" = u.id AND u."poCreateDate" IS NULL AND l."poCreateDate" IS NULL
  AND d."poNumber" = u."poNumber" AND d."poCreateDate" IS NOT NULL
  AND (SELECT COUNT(*) FROM "PoRecord" x WHERE x."poNumber" = u."poNumber" AND x."poCreateDate" IS NOT NULL) = 1;

DELETE FROM "PoRecord" p WHERE NOT EXISTS (SELECT 1 FROM "ComplianceLine" l WHERE l."poRecordId" = p.id);

ALTER TABLE "PoRecord" ALTER COLUMN "instanceKey" SET NOT NULL;
CREATE UNIQUE INDEX "PoRecord_instanceKey_key" ON "PoRecord"("instanceKey");
CREATE INDEX "PoRecord_poNumber_idx" ON "PoRecord"("poNumber");
