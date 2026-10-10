ALTER TABLE "users" ADD COLUMN "surname" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN "dateOfBirth" DATE;
ALTER TABLE "access_logs" DROP CONSTRAINT "access_logs_requesterId_fkey";
ALTER TABLE "access_logs" DROP CONSTRAINT "access_logs_approverId_fkey";
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;