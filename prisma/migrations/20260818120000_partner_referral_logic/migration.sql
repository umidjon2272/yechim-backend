ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "partnerGroupId" TEXT;
ALTER TABLE "Stage" ADD COLUMN "isFinal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerGroup" ADD COLUMN "partnerRewardPerCustomer" DECIMAL(65,30);

CREATE TABLE "PartnerReward" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerReward_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_partnerGroupId_idx" ON "User"("partnerGroupId");
CREATE INDEX "PartnerReward_groupId_period_idx" ON "PartnerReward"("groupId", "period");
CREATE UNIQUE INDEX "PartnerReward_groupId_customerId_period_key" ON "PartnerReward"("groupId", "customerId", "period");

ALTER TABLE "User" ADD CONSTRAINT "User_partnerGroupId_fkey" FOREIGN KEY ("partnerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerReward" ADD CONSTRAINT "PartnerReward_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerReward" ADD CONSTRAINT "PartnerReward_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "User" SET "isActive" = CASE WHEN "status" = 'active' THEN true ELSE false END;
UPDATE "Stage" SET "isFinal" = true WHERE "id" = 'INSTALLED';

INSERT INTO "PartnerReward" ("id", "groupId", "customerId", "period", "amount", "completedAt", "createdAt", "updatedAt")
SELECT
    md5(c."id" || ':' || g."id" || ':' || to_char(c."updatedAt", 'YYYY-MM')),
    g."id",
    c."id",
    to_char(c."updatedAt", 'YYYY-MM'),
    COALESCE(g."partnerRewardPerCustomer", 0),
    c."updatedAt",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Customer" c
JOIN "Stage" s ON s."id" = c."stageId" AND s."isFinal" = true
JOIN "_CustomerGroups" cg ON cg."A" = c."id"
JOIN "CustomerGroup" g ON g."id" = cg."B";
