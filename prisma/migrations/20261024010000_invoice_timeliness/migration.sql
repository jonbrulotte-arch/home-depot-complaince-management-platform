-- AlterTable
ALTER TABLE "ComplianceLine" ADD COLUMN     "firstReportedDate" TIMESTAMP(3),
ADD COLUMN     "goodsReceiptDate" TIMESTAMP(3),
ADD COLUMN     "lastReportedDate" TIMESTAMP(3),
ADD COLUMN     "locationType" TEXT,
ADD COLUMN     "weeksOnReport" DECIMAL(8,2);


-- Invoice Timeliness exports are named US_INVOICE_TIMELINESS_RECORDS_… with one "All LOC" sheet.
-- Seeded values are updated only where an admin has not changed them.
UPDATE "Program" SET "filePrefix" = 'US_INVOICE_TIMELINESS'
WHERE "code" = 'INVOICE_TIMELINESS' AND "filePrefix" = 'INVOICE';

UPDATE "Metric" SET "sheetNames" = array_prepend('All LOC', "sheetNames")
WHERE "code" = 'INVOICE_TIMELINESS' AND NOT ('All LOC' = ANY ("sheetNames"));

UPDATE "MetricRule" r SET "notes" = 'Every PO on THD''s report is a violation: goods received, invoice not yet received. THD charges no offset.'
FROM "Metric" m
WHERE r."metricId" = m.id AND m."code" = 'INVOICE_TIMELINESS' AND r."notes" = 'Configure once a sample export is available';

-- Global column mappings for the export's headers (skipped where one already exists)
INSERT INTO "ColumnAlias" ("id", "sourceHeader", "canonicalField")
SELECT gen_random_uuid()::text, v.header, v.field
FROM (VALUES
  ('m-vendor number', 'mVendor'),
  ('location number', 'dcNumber'),
  ('location type', 'locationType'),
  ('goods receipt', 'goodsReceiptDate'),
  ('original report date', 'firstReportedDate'),
  ('current report date', 'lastReportedDate'),
  ('weeks on report', 'weeksOnReport')
) AS v(header, field)
WHERE NOT EXISTS (
  SELECT 1 FROM "ColumnAlias" a WHERE a."programId" IS NULL AND a."metricId" IS NULL AND a."sourceHeader" = v.header
);
