-- Separate partner identity from employee group access.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PARTNER';

CREATE TYPE "EmployeeCustomerVisibility" AS ENUM ('ALL', 'ASSIGNED', 'GROUPS');

ALTER TABLE "User"
  ADD COLUMN "customerVisibility" "EmployeeCustomerVisibility" NOT NULL DEFAULT 'ASSIGNED';

ALTER TABLE "CustomerGroup"
  ADD COLUMN "rewardStageId" TEXT;

CREATE TABLE "UserAllowedGroup" (
  "userId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAllowedGroup_pkey" PRIMARY KEY ("userId", "groupId")
);

CREATE INDEX "User_customerVisibility_idx" ON "User"("customerVisibility");
CREATE INDEX "CustomerGroup_rewardStageId_idx" ON "CustomerGroup"("rewardStageId");
CREATE INDEX "UserAllowedGroup_groupId_idx" ON "UserAllowedGroup"("groupId");

ALTER TABLE "CustomerGroup"
  ADD CONSTRAINT "CustomerGroup_rewardStageId_fkey"
  FOREIGN KEY ("rewardStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserAllowedGroup"
  ADD CONSTRAINT "UserAllowedGroup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserAllowedGroup_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep existing reward behaviour while making the trigger configurable. The
-- default is discovered from the final stage of the default pipeline; no
-- stage label is persisted or compared by application code.
UPDATE "CustomerGroup" AS group_row
SET "rewardStageId" = stage_row."id"
FROM "Stage" AS stage_row
JOIN "Pipeline" AS pipeline_row ON pipeline_row."id" = stage_row."pipelineId"
WHERE group_row."rewardStageId" IS NULL
  AND pipeline_row."name" = 'Asosiy savdo'
  AND stage_row."isFinal" = true;

-- Existing customers in the configured stage are intentionally not rewarded
-- here. Rewards are earned only by a new stage transition after deployment;
-- retroactive configuration must never create a payout.
