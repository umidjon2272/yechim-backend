-- Reconcile the current employee-scope contract after the obsolete
-- employee_scopes_followups migration failed on a duplicate Activity table.
-- This migration intentionally does not touch Activity, Reminder, Customer
-- depositAmount, or any existing CRM rows.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "customerScope" TEXT NOT NULL DEFAULT 'ALL';

CREATE TABLE IF NOT EXISTS "EmployeeAllowedGroup" (
    "employeeId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    CONSTRAINT "EmployeeAllowedGroup_pkey" PRIMARY KEY ("employeeId", "groupId")
);

CREATE INDEX IF NOT EXISTS "EmployeeAllowedGroup_groupId_idx"
  ON "EmployeeAllowedGroup"("groupId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeAllowedGroup_employeeId_fkey'
      AND conrelid = '"EmployeeAllowedGroup"'::regclass
  ) THEN
    ALTER TABLE "EmployeeAllowedGroup"
      ADD CONSTRAINT "EmployeeAllowedGroup_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeAllowedGroup_groupId_fkey'
      AND conrelid = '"EmployeeAllowedGroup"'::regclass
  ) THEN
    ALTER TABLE "EmployeeAllowedGroup"
      ADD CONSTRAINT "EmployeeAllowedGroup_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
