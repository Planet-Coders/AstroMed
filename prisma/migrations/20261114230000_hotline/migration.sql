-- CreateEnum
CREATE TYPE "HotlineUrgency" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY');

-- CreateTable
CREATE TABLE "HotlineMessage" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "fromEarth" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "urgency" "HotlineUrgency" NOT NULL DEFAULT 'ROUTINE',
    "vitals" JSONB,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliverAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "HotlineMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotlineMessage_clientId_key" ON "HotlineMessage"("clientId");

-- CreateIndex
CREATE INDEX "HotlineMessage_memberId_createdAt_idx" ON "HotlineMessage"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "HotlineMessage_senderId_createdAt_idx" ON "HotlineMessage"("senderId", "createdAt");

-- AddForeignKey
ALTER TABLE "HotlineMessage" ADD CONSTRAINT "HotlineMessage_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotlineMessage" ADD CONSTRAINT "HotlineMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

