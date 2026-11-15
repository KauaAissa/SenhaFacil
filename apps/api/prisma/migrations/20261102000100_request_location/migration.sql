CREATE TABLE "access_request_locations" (
    "accessLogId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "access_request_locations_pkey" PRIMARY KEY ("accessLogId"),
    CONSTRAINT "access_request_locations_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "access_request_locations_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
    CONSTRAINT "access_request_locations_accuracy_check" CHECK ("accuracy" >= 0 AND "accuracy" < 'Infinity'::float8),
    CONSTRAINT "access_request_locations_accessLogId_fkey" FOREIGN KEY ("accessLogId")
        REFERENCES "access_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
