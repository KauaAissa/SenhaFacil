CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "refreshHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "auth_sessions_refreshHash_key" ON "auth_sessions"("refreshHash");
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");