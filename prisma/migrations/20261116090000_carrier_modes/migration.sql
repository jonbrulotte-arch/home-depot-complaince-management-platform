-- Carriers can run LTL and truckload: the seeded carriers become "LTL & TL" (UPS stays Parcel).
-- Only the seeded rows as seeded; carriers added or edited since are left as they are.
UPDATE "CarrierLink" SET "mode" = 'LTL & TL', "updatedAt" = now()
WHERE "id" LIKE 'carrier\_%' AND "mode" IN ('LTL', 'TL') AND "updatedAt" = "createdAt";
