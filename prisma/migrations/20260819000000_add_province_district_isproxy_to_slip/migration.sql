-- AlterTable
ALTER TABLE "SlipSubmission" ADD COLUMN "province" TEXT,
                              ADD COLUMN "district" TEXT,
                              ADD COLUMN "isProxy"  BOOLEAN NOT NULL DEFAULT false;
