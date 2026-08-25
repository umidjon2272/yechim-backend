-- Communication comments use the existing Task.description field and a
-- dedicated Reminder.note for scheduled calls/reminders.
ALTER TABLE "Reminder" ADD COLUMN "note" TEXT;

CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");
CREATE INDEX "Currency_isActive_idx" ON "Currency"("isActive");
CREATE INDEX "Currency_isDefault_idx" ON "Currency"("isDefault");

INSERT INTO "Currency" ("id", "code", "name", "symbol", "isDefault", "isActive", "updatedAt")
VALUES ('currency-uzs', 'UZS', 'O‘zbekiston so‘mi', 'so‘m', true, true, CURRENT_TIMESTAMP);

ALTER TABLE "Customer" ADD COLUMN "currencyId" TEXT;
UPDATE "Customer" SET "currencyId" = 'currency-uzs' WHERE "currencyId" IS NULL;

CREATE INDEX "Customer_currencyId_idx" ON "Customer"("currencyId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_currencyId_fkey"
  FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
