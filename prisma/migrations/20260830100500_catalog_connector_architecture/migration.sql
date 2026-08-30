-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('rss', 'atom', 'api', 'sitemap', 'html_adapter');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('curated', 'user_added', 'pending', 'rejected', 'inactive');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('verified', 'unverified', 'failed');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('free', 'open_access', 'partial', 'subscription', 'unknown');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('news', 'magazine', 'journal', 'government', 'guideline', 'preprint', 'blog', 'other');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'approved', 'rejected', 'duplicate');

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "accessType" "AccessType" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'user_added',
ADD COLUMN     "connectorConfig" JSONB,
ADD COLUMN     "connectorType" "ConnectorType" NOT NULL DEFAULT 'rss',
ADD COLUMN     "contentType" "ContentType" NOT NULL DEFAULT 'other',
ADD COLUMN     "country" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "lastErrorCode" TEXT,
ADD COLUMN     "lastHealthyAt" TIMESTAMP(3),
ADD COLUMN     "peerReviewed" BOOLEAN,
ADD COLUMN     "preprint" BOOLEAN,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'generic',
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'unverified',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProfessionSource" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "professionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "detectedUrl" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'pending',
    "failureCode" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionSource_professionKey_idx" ON "ProfessionSource"("professionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionSource_sourceId_professionKey_key" ON "ProfessionSource"("sourceId", "professionKey");

-- CreateIndex
CREATE INDEX "SourceSubmission_userId_idx" ON "SourceSubmission"("userId");

-- CreateIndex
CREATE INDEX "Source_catalogStatus_idx" ON "Source"("catalogStatus");

-- AddForeignKey
ALTER TABLE "ProfessionSource" ADD CONSTRAINT "ProfessionSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSubmission" ADD CONSTRAINT "SourceSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataBackfill: existing rows default to connectorType='rss' above, which is
-- wrong for rows whose legacy `type` is 'html' (e.g. twarchitect) — align them
-- without touching any other column or losing any data.
UPDATE "Source" SET "connectorType" = 'html_adapter' WHERE "type" = 'html';
