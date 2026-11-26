-- An issue can have several HD Support tickets. Existing values are split on commas,
-- semicolons and spaces, so "7822873, 7822521" becomes two tickets.
ALTER TABLE "Issue" ADD COLUMN "hdTickets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Issue"
SET "hdTickets" = array_remove(regexp_split_to_array(btrim("hdTicket"), '[\s,;]+'), '')
WHERE "hdTicket" IS NOT NULL AND btrim("hdTicket") <> '';

ALTER TABLE "Issue" DROP COLUMN "hdTicket";
