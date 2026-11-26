-- Public read-only links to Issue Log issues
CREATE TABLE "IssueShare" (
    "issueId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "IssueShare_pkey" PRIMARY KEY ("issueId")
);

CREATE UNIQUE INDEX "IssueShare_token_key" ON "IssueShare"("token");

ALTER TABLE "IssueShare" ADD CONSTRAINT "IssueShare_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueShare" ADD CONSTRAINT "IssueShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
