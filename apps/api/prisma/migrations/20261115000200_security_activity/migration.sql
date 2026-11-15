ALTER TABLE "auth_sessions" ADD COLUMN "deviceHash" TEXT;
ALTER TABLE "auth_sessions" ADD COLUMN "devicePlatform" TEXT;

CREATE TABLE "auth_devices" (
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "deviceHash" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "deviceHash")
);

CREATE TABLE "security_rate_states" (
  "key" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "security_rate_count_check" CHECK ("count" >= 0)
);
CREATE INDEX "security_rate_states_expiresAt_idx" ON "security_rate_states"("expiresAt");

CREATE TABLE "security_events" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "dedupeKey" TEXT NOT NULL UNIQUE,
  CONSTRAINT "security_event_count_check" CHECK ("count" > 0),
  CONSTRAINT "security_event_source_check" CHECK ("source" IN ('SERVER', 'DEVICE_REPORT'))
);
CREATE INDEX "security_events_userId_recordedAt_id_idx" ON "security_events"("userId", "recordedAt", "id");
CREATE INDEX "security_events_expiresAt_idx" ON "security_events"("expiresAt");

CREATE TABLE "security_deliveries" (
  "eventId" TEXT NOT NULL REFERENCES "security_events"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "security_deliveries_status_nextAttemptAt_leaseUntil_idx"
  ON "security_deliveries"("status", "nextAttemptAt", "leaseUntil");
