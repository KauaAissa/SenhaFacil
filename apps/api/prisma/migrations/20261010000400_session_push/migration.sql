ALTER TABLE "auth_sessions" ADD COLUMN "fcmToken" TEXT;
CREATE UNIQUE INDEX "auth_sessions_fcmToken_key" ON "auth_sessions"("fcmToken");
UPDATE "users" SET "fcmToken" = NULL;