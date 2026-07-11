-- Preserve existing enum values while allowing administrators to enter new material and saree category names.
ALTER TABLE "Product"
  ALTER COLUMN "fabric" TYPE TEXT USING "fabric"::TEXT,
  ALTER COLUMN "craft" TYPE TEXT USING "craft"::TEXT;

DROP TYPE "Material";
DROP TYPE "Craft";