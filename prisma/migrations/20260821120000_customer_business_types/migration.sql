-- Additive many-to-many customer/business-type relation.
-- The legacy Customer.businessTypeId column is intentionally retained so
-- older integrations and existing data remain compatible.
CREATE TABLE "CustomerBusinessType" (
    "customerId" TEXT NOT NULL,
    "businessTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBusinessType_pkey" PRIMARY KEY ("customerId", "businessTypeId")
);

CREATE INDEX "CustomerBusinessType_businessTypeId_idx"
    ON "CustomerBusinessType"("businessTypeId");

ALTER TABLE "CustomerBusinessType"
    ADD CONSTRAINT "CustomerBusinessType_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerBusinessType"
    ADD CONSTRAINT "CustomerBusinessType_businessTypeId_fkey"
    FOREIGN KEY ("businessTypeId") REFERENCES "BusinessType"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill every existing legacy single relation. ON CONFLICT keeps this
-- migration safe if a partially migrated database already has a link.
INSERT INTO "CustomerBusinessType" ("customerId", "businessTypeId")
SELECT "id", "businessTypeId"
FROM "Customer"
WHERE "businessTypeId" IS NOT NULL
ON CONFLICT ("customerId", "businessTypeId") DO NOTHING;
