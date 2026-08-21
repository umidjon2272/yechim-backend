-- Additive customer metadata. Existing customer and operational records are
-- preserved; businessTypeId is nullable for all existing customers.
CREATE TABLE "BusinessType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessType_name_key" ON "BusinessType"("name");
CREATE INDEX "BusinessType_isActive_sortOrder_idx" ON "BusinessType"("isActive", "sortOrder");

ALTER TABLE "Customer" ADD COLUMN "businessTypeId" TEXT;
CREATE INDEX "Customer_businessTypeId_idx" ON "Customer"("businessTypeId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessTypeId_fkey"
    FOREIGN KEY ("businessTypeId") REFERENCES "BusinessType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "BusinessType" ("id", "name", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
    ('business-type-retail', 'Do‘kon / Chakana savdo', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-restaurant', 'Restoran / Kafe', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-pharmacy', 'Dorixona', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-beauty', 'Go‘zallik saloni', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-services', 'Xizmat ko‘rsatish', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-manufacturing', 'Ishlab chiqarish', true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-distribution', 'Distribyutsiya', true, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-wholesale', 'Ombor / Ulgurji savdo', true, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-education', 'O‘quv markazi', true, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('business-type-other', 'Boshqa', true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
