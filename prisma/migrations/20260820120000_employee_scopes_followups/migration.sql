-- Employee customer visibility scopes and durable customer follow-up records.
ALTER TABLE "User" ADD COLUMN "customerScope" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "Customer" ADD COLUMN "deposit" DECIMAL(65,30) NOT NULL DEFAULT 0;

CREATE TABLE "EmployeeAllowedGroup" (
    "employeeId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    CONSTRAINT "EmployeeAllowedGroup_pkey" PRIMARY KEY ("employeeId", "groupId")
);

CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CALL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TEXT,
    "duration" INTEGER,
    "result" TEXT,
    "nextAction" TEXT,
    "customerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "remindAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "customerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeAllowedGroup_groupId_idx" ON "EmployeeAllowedGroup"("groupId");
CREATE INDEX "Activity_customerId_idx" ON "Activity"("customerId");
CREATE INDEX "Activity_createdById_idx" ON "Activity"("createdById");
CREATE INDEX "Activity_date_idx" ON "Activity"("date");
CREATE INDEX "Reminder_customerId_idx" ON "Reminder"("customerId");
CREATE INDEX "Reminder_createdById_idx" ON "Reminder"("createdById");
CREATE INDEX "Reminder_remindAt_idx" ON "Reminder"("remindAt");
CREATE INDEX "Comment_entityType_entityId_idx" ON "Comment"("entityType", "entityId");
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

ALTER TABLE "EmployeeAllowedGroup" ADD CONSTRAINT "EmployeeAllowedGroup_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeAllowedGroup" ADD CONSTRAINT "EmployeeAllowedGroup_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
