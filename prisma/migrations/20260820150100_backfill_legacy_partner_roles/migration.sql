-- Existing group-linked accounts were the legacy representation of partners.
-- Preserve those accounts as explicit PARTNER users after the enum value has
-- been committed. New employee group access uses UserAllowedGroup instead.
UPDATE "User"
SET "role" = 'PARTNER'
WHERE "partnerGroupId" IS NOT NULL
  AND "role" NOT IN ('ADMIN', 'SUPER_ADMIN');
