-- CreateEnum
CREATE TYPE "HitChannel" AS ENUM ('APP', 'PUBLIC');

-- CreateEnum
CREATE TYPE "HitKind" AS ENUM ('VIEW', 'PDF', 'EXCEL');

-- CreateTable
CREATE TABLE "ScorecardHit" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "channel" "HitChannel" NOT NULL,
    "kind" "HitKind" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScorecardHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScorecardHit_scorecardId_at_idx" ON "ScorecardHit"("scorecardId", "at");

-- CreateIndex
CREATE INDEX "ScorecardHit_userId_idx" ON "ScorecardHit"("userId");

-- AddForeignKey
ALTER TABLE "ScorecardHit" ADD CONSTRAINT "ScorecardHit_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardHit" ADD CONSTRAINT "ScorecardHit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
