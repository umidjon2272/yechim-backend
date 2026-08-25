-- Additive audit ownership for customers. Existing rows intentionally remain NULL.
ALTER TABLE "Customer" ADD COLUMN "createdById" TEXT;

CREATE INDEX "Customer_createdById_idx" ON "Customer"("createdById");

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
