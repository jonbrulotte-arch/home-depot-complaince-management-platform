-- ASN/Shipped Confirmation: each PO's status as confirmed in POM, imported from the confirmation file

-- CreateEnum
CREATE TYPE "AsnStatus" AS ENUM ('UNSHIPPED', 'SHIPPED');

-- AlterEnum
ALTER TYPE "LogisticsSource" ADD VALUE 'ASN';

-- CreateTable
CREATE TABLE "AsnConfirmation" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" "AsnStatus" NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "importId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsnConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AsnConfirmation_poNumber_key" ON "AsnConfirmation"("poNumber");

