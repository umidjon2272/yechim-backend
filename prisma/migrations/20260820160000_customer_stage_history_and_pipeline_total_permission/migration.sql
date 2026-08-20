-- Store stage transitions so a customer that was completed/final before a
-- later return to the reward stage can never earn a second referral payout.
CREATE TABLE "CustomerStageHistory" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "fromIsFinal" BOOLEAN NOT NULL DEFAULT false,
    "toIsFinal" BOOLEAN NOT NULL DEFAULT false,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerStageHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerStageHistory_customerId_changedAt_idx"
ON "CustomerStageHistory"("customerId", "changedAt");
CREATE INDEX "CustomerStageHistory_customerId_fromIsFinal_toIsFinal_idx"
ON "CustomerStageHistory"("customerId", "fromIsFinal", "toIsFinal");

ALTER TABLE "CustomerStageHistory"
  ADD CONSTRAINT "CustomerStageHistory_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerStageHistory_fromStageId_fkey"
  FOREIGN KEY ("fromStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerStageHistory_toStageId_fkey"
  FOREIGN KEY ("toStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- `customers.viewPipelineTotal` is intentionally not backfilled into existing
-- employees. The permission is admin-controlled per user and a missing value
-- must keep totals out of both the DTO and the UI.
