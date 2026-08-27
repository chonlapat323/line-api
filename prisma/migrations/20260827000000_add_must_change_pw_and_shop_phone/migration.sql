-- AlterTable: add mustChangePassword to User
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add shopPhone to VisitRecord
ALTER TABLE "VisitRecord" ADD COLUMN "shopPhone" TEXT;
