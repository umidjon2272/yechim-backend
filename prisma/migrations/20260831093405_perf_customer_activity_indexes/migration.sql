-- Performance indexes for the customer list and activity-summary queries.
-- Purely additive (no data change, no column/type changes) and safe to run
-- against the live production database.

-- Serves the default customer list query: WHERE "deletedAt" IS NULL
-- ORDER BY "createdAt" DESC, avoiding a full-table sort on every page.
CREATE INDEX IF NOT EXISTS "Customer_deletedAt_createdAt_idx"
  ON "Customer"("deletedAt", "createdAt");

-- Serves the "latest matching activity per customer" lookup used to build
-- customer list summaries (latestActivity/lastContact/latestNote), which
-- filters by customerId + type and takes the newest row per customer.
CREATE INDEX IF NOT EXISTS "Activity_customerId_type_createdAt_idx"
  ON "Activity"("customerId", "type", "createdAt");
