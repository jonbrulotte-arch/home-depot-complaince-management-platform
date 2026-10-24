-- Summarizer: Analysts can build scorecard summaries for team emails. (Admin always has every permission.)
UPDATE "Role" SET "permissions" = "permissions" || ARRAY['summarizer.use'], "updatedAt" = now()
WHERE "name" = 'Analyst' AND NOT ('summarizer.use' = ANY ("permissions"));
