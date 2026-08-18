-- A partner payout is earned once per customer/group, while `period` keeps
-- the month in which the payout was earned for historical reporting.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "groupId", "customerId"
            ORDER BY "completedAt" ASC, "createdAt" ASC, "id" ASC
        ) AS row_number
    FROM "PartnerReward"
)
DELETE FROM "PartnerReward" reward
USING ranked duplicate
WHERE reward."id" = duplicate."id"
  AND duplicate.row_number > 1;

DROP INDEX "PartnerReward_groupId_customerId_period_key";
CREATE UNIQUE INDEX "PartnerReward_groupId_customerId_key"
ON "PartnerReward"("groupId", "customerId");
