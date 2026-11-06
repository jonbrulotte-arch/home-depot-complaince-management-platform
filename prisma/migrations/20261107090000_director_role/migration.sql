-- Reports & Insights (permission insights.view) and the Director role: the Warehouse's access
-- plus Reports & Insights. Admin always has every permission.
INSERT INTO "Role" ("id", "name", "description", "permissions", "system", "createdAt", "updatedAt")
SELECT 'role_director', 'Director', 'Directors: everything the Warehouse has, plus Reports & Insights',
       ARRAY['feedback.view', 'feedback.submit', 'issues.view', 'issues.manage', 'insights.view'], true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'Director');
