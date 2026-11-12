-- The Logistics role, created with no permissions: an admin gives it its access in Roles & Access.
INSERT INTO "Role" ("id", "name", "description", "permissions", "system", "createdAt", "updatedAt")
SELECT 'role_logistics', 'Logistics', 'Logistics team', ARRAY[]::TEXT[], true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'Logistics');
