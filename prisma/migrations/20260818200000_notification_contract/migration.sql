-- Align the persisted notification contract with the API: isRead/readAt and
-- generic entityType/entityId references.
ALTER TABLE "Notification" RENAME COLUMN "read" TO "isRead";
ALTER TABLE "Notification" RENAME COLUMN "relatedEntityType" TO "entityType";
ALTER TABLE "Notification" RENAME COLUMN "relatedEntityId" TO "entityId";
ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);

DROP INDEX "Notification_userId_read_createdAt_idx";
CREATE INDEX "Notification_userId_isRead_createdAt_idx"
ON "Notification"("userId", "isRead", "createdAt");
