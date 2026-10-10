ALTER TABLE "auth_sessions" ADD COLUMN "previousRefreshHash" TEXT;
ALTER TABLE "auth_sessions" ADD COLUMN "refreshRequestId" TEXT;
ALTER TABLE "auth_sessions" ADD COLUMN "refreshRetryUntil" TIMESTAMP(3);