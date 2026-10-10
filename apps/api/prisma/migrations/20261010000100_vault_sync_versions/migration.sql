ALTER TABLE "vault_items" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "vault_items" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "vault_sync_operations" (
  "userId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vault_sync_operations_pkey" PRIMARY KEY ("userId", "operationId"),
  CONSTRAINT "vault_sync_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);