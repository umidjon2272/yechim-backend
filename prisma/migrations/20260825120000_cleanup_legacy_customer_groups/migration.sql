-- One-time production cleanup of the explicitly retired default groups.
-- This migration is intentionally name-scoped: user-created groups are not
-- touched, and no Customer or PartnerReward rows are deleted.
DO $$
BEGIN
    IF to_regclass('public."PartnerReward"') IS NOT NULL
       AND to_regclass('public."CustomerGroup"') IS NOT NULL THEN
        ALTER TABLE "PartnerReward" DROP CONSTRAINT IF EXISTS "PartnerReward_groupId_fkey";
        ALTER TABLE "PartnerReward" ALTER COLUMN "groupId" DROP NOT NULL;
        ALTER TABLE "PartnerReward"
            ADD CONSTRAINT "PartnerReward_groupId_fkey"
            FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF to_regclass('public."CustomerGroup"') IS NOT NULL
       AND to_regclass('public."_CustomerGroups"') IS NOT NULL THEN
        DELETE FROM "_CustomerGroups"
        WHERE "B" IN (
            SELECT "id"
            FROM "CustomerGroup"
            WHERE "name" IN ('VIP', 'Bito', 'Ilxom aka mijozlari')
        );
    END IF;

    IF to_regclass('public."CustomerGroup"') IS NOT NULL THEN
        DELETE FROM "CustomerGroup"
        WHERE "name" IN ('VIP', 'Bito', 'Ilxom aka mijozlari');
    END IF;
END $$;
