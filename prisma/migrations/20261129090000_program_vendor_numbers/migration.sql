-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "vendorNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[];
