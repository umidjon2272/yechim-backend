-- Performance index for the customer list's "next pending reminder per
-- customer" lookup. Purely additive (no data change) and safe to run
-- against the live production database.

CREATE INDEX IF NOT EXISTS "Reminder_customerId_status_remindAt_idx"
  ON "Reminder"("customerId", "status", "remindAt");
