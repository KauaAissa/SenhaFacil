-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ELDERLY', 'CAREGIVER');

-- CreateEnum
CREATE TYPE "TrustedContactStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "VaultPermission" AS ENUM ('VIEW_ITEMS', 'APPROVE_ACCESS', 'MANAGE_ITEMS');

-- CreateEnum
CREATE TYPE "VaultCategory" AS ENUM ('BANKING', 'SOCIAL_MEDIA', 'EMAIL', 'HEALTH', 'GOVERNMENT', 'SHOPPING', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'FALLBACK_GRANTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ELDERLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fcmToken" TEXT,
    "kdfSalt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_contacts" (
    "id" TEXT NOT NULL,
    "elderlyId" TEXT NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "status" "TrustedContactStatus" NOT NULL DEFAULT 'PENDING',
    "permissions" "VaultPermission"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trusted_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "VaultCategory" NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "vaultItemId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "status" "AccessStatus" NOT NULL DEFAULT 'PENDING',
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "deviceInfo" TEXT,
    "notes" TEXT,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "trusted_contacts_elderlyId_idx" ON "trusted_contacts"("elderlyId");

-- CreateIndex
CREATE INDEX "trusted_contacts_caregiverId_idx" ON "trusted_contacts"("caregiverId");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_contacts_elderlyId_caregiverId_key" ON "trusted_contacts"("elderlyId", "caregiverId");

-- CreateIndex
CREATE INDEX "vault_items_userId_idx" ON "vault_items"("userId");

-- CreateIndex
CREATE INDEX "vault_items_userId_category_idx" ON "vault_items"("userId", "category");

-- CreateIndex
CREATE INDEX "access_logs_vaultItemId_idx" ON "access_logs"("vaultItemId");

-- CreateIndex
CREATE INDEX "access_logs_requesterId_idx" ON "access_logs"("requesterId");

-- CreateIndex
CREATE INDEX "access_logs_status_expiresAt_idx" ON "access_logs"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "trusted_contacts" ADD CONSTRAINT "trusted_contacts_elderlyId_fkey" FOREIGN KEY ("elderlyId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_contacts" ADD CONSTRAINT "trusted_contacts_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_vaultItemId_fkey" FOREIGN KEY ("vaultItemId") REFERENCES "vault_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
