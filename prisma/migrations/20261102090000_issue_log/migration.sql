-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT NOT NULL,
    "programId" TEXT,
    "team" "TeamInfluence",
    "hdTicket" TEXT,
    "description" TEXT NOT NULL,
    "actionsTaken" TEXT,
    "consequences" TEXT,
    "peopleInvolved" TEXT,
    "references" TEXT,
    "resolution" TEXT,
    "followUpDate" DATE,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuePo" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "poCreateDate" DATE,

    CONSTRAINT "IssuePo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueNote" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueAttachment" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Issue_number_key" ON "Issue"("number");

-- CreateIndex
CREATE INDEX "Issue_issueDate_idx" ON "Issue"("issueDate");

-- CreateIndex
CREATE INDEX "Issue_status_idx" ON "Issue"("status");

-- CreateIndex
CREATE INDEX "IssuePo_poNumber_idx" ON "IssuePo"("poNumber");

-- CreateIndex
CREATE INDEX "IssuePo_issueId_idx" ON "IssuePo"("issueId");

-- CreateIndex
CREATE INDEX "IssueNote_issueId_idx" ON "IssueNote"("issueId");

-- CreateIndex
CREATE INDEX "IssueAttachment_issueId_idx" ON "IssueAttachment"("issueId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuePo" ADD CONSTRAINT "IssuePo_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueNote" ADD CONSTRAINT "IssueNote_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueNote" ADD CONSTRAINT "IssueNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAttachment" ADD CONSTRAINT "IssueAttachment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAttachment" ADD CONSTRAINT "IssueAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Issue Log permissions for the existing roles (Admin always has every permission):
-- Analysts and the warehouse log and update issues; Finance and Viewers can read them.
UPDATE "Role" SET "permissions" = "permissions" || ARRAY['issues.view', 'issues.manage'], "updatedAt" = now()
WHERE "name" IN ('Analyst', 'Warehouse') AND NOT ('issues.view' = ANY ("permissions"));
UPDATE "Role" SET "permissions" = "permissions" || ARRAY['issues.view'], "updatedAt" = now()
WHERE "name" IN ('Finance', 'Viewer') AND NOT ('issues.view' = ANY ("permissions"));
