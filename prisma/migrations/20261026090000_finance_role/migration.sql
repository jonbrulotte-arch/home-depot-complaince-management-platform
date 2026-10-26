-- Finance: read-only access to PO Lookup, Scorecard Feedback (no comments) and the Summarizer.
INSERT INTO "Role" ("id", "name", "description", "permissions", "system", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Finance', 'Finance team: read-only PO Lookup, Scorecard Feedback and Summarizer',
        ARRAY['view.polookup', 'feedback.view', 'summarizer.use'], true, now(), now())
ON CONFLICT ("name") DO NOTHING;
