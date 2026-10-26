-- Newer SPM exports give Fill Rate as a fraction (1 = 100%); it was stored as-is and read as 1%.
-- Imports whose Fill Rate values are all 1 or less used the fraction format: store percents.
UPDATE "ComplianceLine" l
SET "fillRatePct" = ROUND(l."fillRatePct" * 100, 2)
FROM "Metric" m
WHERE m.id = l."metricId" AND m."code" = 'FILL_RATE' AND l."fillRatePct" IS NOT NULL
  AND l."batchId" IN (
    SELECT f."batchId" FROM "ComplianceLine" f JOIN "Metric" fm ON fm.id = f."metricId"
    WHERE fm."code" = 'FILL_RATE' AND f."fillRatePct" IS NOT NULL
    GROUP BY f."batchId" HAVING MAX(f."fillRatePct") <= 1
  );

-- Fill Rate lines are classified by quantity when the export has it (see classifyLine): a line
-- received in full, not cancelled and without an offset is compliant. Lines from full-results
-- exports that the fraction misread flagged as violations become compliant again.
UPDATE "ComplianceLine" l
SET "isCompliant" = true
FROM "Metric" m, "ImportBatch" b
WHERE m.id = l."metricId" AND m."code" = 'FILL_RATE' AND b.id = l."batchId" AND b."exportKind" <> 'NON_COMPLIANT'
  AND l."isCompliant" = false AND l."cancelDate" IS NULL
  AND l."orderedQty" IS NOT NULL AND l."receivedQty" IS NOT NULL AND l."receivedQty" >= l."orderedQty"
  AND l."offsetAmount" = 0
  AND (l."spmStatus" IS NULL OR lower(l."spmStatus") = 'pending supplier');
