-- Customer work-management fields
ALTER TABLE "Customer"
  ADD COLUMN "nextContactAt" TIMESTAMP(3),
  ADD COLUMN "lastContactAt" TIMESTAMP(3),
  ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "installationAt" TIMESTAMP(3),
  ADD COLUMN "installerEmployeeId" TEXT;

CREATE INDEX "Customer_nextContactAt_idx" ON "Customer"("nextContactAt");
CREATE INDEX "Customer_stageEnteredAt_idx" ON "Customer"("stageEnteredAt");
CREATE INDEX "Customer_installerEmployeeId_idx" ON "Customer"("installerEmployeeId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_installerEmployeeId_fkey"
  FOREIGN KEY ("installerEmployeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent a stage automation from creating the same task repeatedly for one customer.
ALTER TABLE "Task" ADD COLUMN "automationKey" TEXT;
CREATE UNIQUE INDEX "Task_customerId_automationKey_key" ON "Task"("customerId", "automationKey");

CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

CREATE TABLE "Activity" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Activity_customerId_createdAt_idx" ON "Activity"("customerId", "createdAt");
CREATE INDEX "Activity_type_idx" ON "Activity"("type");
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Reminder" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "assignedUserId" TEXT,
  "createdById" TEXT,
  "type" TEXT NOT NULL DEFAULT 'CALL',
  "title" TEXT NOT NULL,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Reminder_assignedUserId_status_remindAt_idx" ON "Reminder"("assignedUserId", "status", "remindAt");
CREATE INDEX "Reminder_customerId_status_idx" ON "Reminder"("customerId", "status");
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reminderId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_reminderId_key" ON "Notification"("reminderId");
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_reminderId_fkey"
  FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
