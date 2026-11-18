-- The WMS report's ship-to: Store/DC number, name and street lines
ALTER TABLE "WmsCarton" ADD COLUMN "shipTo" TEXT,
ADD COLUMN "shipName" TEXT,
ADD COLUMN "shipAddress1" TEXT,
ADD COLUMN "shipAddress2" TEXT,
ADD COLUMN "shipAddress3" TEXT;
