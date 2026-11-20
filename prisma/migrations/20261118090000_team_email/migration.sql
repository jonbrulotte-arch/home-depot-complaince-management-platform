-- Team addresses for Logistics › Send Email (To and Cc per team)
ALTER TABLE "Team" ADD COLUMN     "emailCc" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "emailTo" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- The EDI team address set under Admin › Settings moves to the EDI team (created if it no longer exists)
INSERT INTO "Team" ("id", "key", "name", "description", "active", "sortOrder", "updatedAt")
SELECT 'team_edi_email', 'EDI', 'EDI (email)', 'Created when the EDI team email moved from Admin › Settings to Teams', true,
       (SELECT COALESCE(MAX("sortOrder"), 0) + 10 FROM "Team"), CURRENT_TIMESTAMP
FROM "SiteSettings" s
WHERE s."id" = 'site' AND btrim(COALESCE(s."ediTeamEmail", '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM "Team" WHERE "key" = 'EDI');

UPDATE "Team" t
SET "emailTo" = ARRAY(SELECT DISTINCT a FROM unnest(regexp_split_to_array(btrim(s."ediTeamEmail"), '[\s,;]+')) AS a WHERE a <> '')
FROM "SiteSettings" s
WHERE t."key" = 'EDI' AND s."id" = 'site' AND btrim(COALESCE(s."ediTeamEmail", '')) <> '';

ALTER TABLE "SiteSettings" DROP COLUMN "ediTeamEmail";
