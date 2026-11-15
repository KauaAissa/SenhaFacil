ALTER TABLE "access_request_locations" ADD COLUMN "historyExpiresAt" TIMESTAMP(3);
CREATE INDEX "access_request_locations_historyExpiresAt_idx"
  ON "access_request_locations"("historyExpiresAt");
