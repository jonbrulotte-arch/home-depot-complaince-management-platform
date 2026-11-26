-- The time zone a user picked for showing times; null follows their browser
ALTER TABLE "User" ADD COLUMN "timeZone" TEXT;
