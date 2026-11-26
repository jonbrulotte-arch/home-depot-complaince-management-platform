-- The most THD could charge for an issue, in whole dollars: per PO, and for the whole issue (the
-- total of its POs' estimates when any are given, else a figure typed for the issue)
ALTER TABLE "Issue" ADD COLUMN "estimatedFine" INTEGER;
ALTER TABLE "IssuePo" ADD COLUMN "estimatedFine" INTEGER;
