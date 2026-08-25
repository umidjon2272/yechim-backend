-- Keep the one-time customer-group seed from recreating admin-deleted groups.
CREATE TABLE "SeedState" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeedState_pkey" PRIMARY KEY ("key")
);

-- Existing installations already ran the legacy group upsert seed. Mark them
-- initialized before the new seed can run, preserving their current group
-- set, including intentional deletions.
INSERT INTO "SeedState" ("key")
SELECT 'customer-groups-v1'
WHERE EXISTS (SELECT 1 FROM "User")
   OR EXISTS (SELECT 1 FROM "CustomerGroup");
