-- Invalidate access and refresh JWTs after logout, password reset, or account
-- deactivation without storing raw tokens in the database.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
