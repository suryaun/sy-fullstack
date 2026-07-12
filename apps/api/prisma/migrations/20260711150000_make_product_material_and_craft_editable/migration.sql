-- Preserve existing enum values while allowing administrators to enter new material and saree category names.
ALTER TABLE "Product"
  ALTER COLUMN "fabric" TYPE TEXT USING "fabric"::TEXT,
  ALTER COLUMN "craft" TYPE TEXT USING "craft"::TEXT;

UPDATE "Product"
SET
  "fabric" = CASE "fabric"
    WHEN 'SILK' THEN 'Silk'
    WHEN 'CHIFFON' THEN 'Chiffon'
    WHEN 'COTTON' THEN 'Cotton'
    WHEN 'GEORGETTE' THEN 'Georgette'
    WHEN 'ORGANZA' THEN 'Organza'
    WHEN 'LINEN' THEN 'Linen'
    WHEN 'CREPE' THEN 'Crepe'
    WHEN 'SATIN' THEN 'Satin'
    ELSE "fabric"
  END,
  "craft" = CASE "craft"
    WHEN 'BANARASI' THEN 'Banarasi'
    WHEN 'KANJEEVARAM' THEN 'Kanjeevaram'
    WHEN 'BANDHANI' THEN 'Bandhani'
    WHEN 'CHIKANKARI' THEN 'Chikankari'
    WHEN 'PAITHANI' THEN 'Paithani'
    WHEN 'PATOLA' THEN 'Patola'
    WHEN 'JAMDANI' THEN 'Jamdani'
    WHEN 'TUSSAR' THEN 'Tussar'
    ELSE "craft"
  END;

DROP TYPE "Material";
DROP TYPE "Craft";

CREATE TABLE "ProductAttribute" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductAttribute_kind_name_key" ON "ProductAttribute"("kind", "name");
CREATE INDEX "ProductAttribute_kind_idx" ON "ProductAttribute"("kind");

INSERT INTO "ProductAttribute" ("id", "kind", "name", "updatedAt")
SELECT CONCAT('material-', MD5("fabric")), 'MATERIAL', "fabric", CURRENT_TIMESTAMP
FROM "Product"
ON CONFLICT ("kind", "name") DO NOTHING;

INSERT INTO "ProductAttribute" ("id", "kind", "name", "updatedAt")
SELECT CONCAT('saree-category-', MD5("craft")), 'SAREE_CATEGORY', "craft", CURRENT_TIMESTAMP
FROM "Product"
ON CONFLICT ("kind", "name") DO NOTHING;

INSERT INTO "ProductAttribute" ("id", "kind", "name", "updatedAt") VALUES
  ('material-silk', 'MATERIAL', 'Silk', CURRENT_TIMESTAMP),
  ('material-chiffon', 'MATERIAL', 'Chiffon', CURRENT_TIMESTAMP),
  ('material-cotton', 'MATERIAL', 'Cotton', CURRENT_TIMESTAMP),
  ('material-georgette', 'MATERIAL', 'Georgette', CURRENT_TIMESTAMP),
  ('material-organza', 'MATERIAL', 'Organza', CURRENT_TIMESTAMP),
  ('material-linen', 'MATERIAL', 'Linen', CURRENT_TIMESTAMP),
  ('material-crepe', 'MATERIAL', 'Crepe', CURRENT_TIMESTAMP),
  ('material-satin', 'MATERIAL', 'Satin', CURRENT_TIMESTAMP),
  ('saree-category-banarasi', 'SAREE_CATEGORY', 'Banarasi', CURRENT_TIMESTAMP),
  ('saree-category-kanjeevaram', 'SAREE_CATEGORY', 'Kanjeevaram', CURRENT_TIMESTAMP),
  ('saree-category-bandhani', 'SAREE_CATEGORY', 'Bandhani', CURRENT_TIMESTAMP),
  ('saree-category-chikankari', 'SAREE_CATEGORY', 'Chikankari', CURRENT_TIMESTAMP),
  ('saree-category-paithani', 'SAREE_CATEGORY', 'Paithani', CURRENT_TIMESTAMP),
  ('saree-category-patola', 'SAREE_CATEGORY', 'Patola', CURRENT_TIMESTAMP),
  ('saree-category-jamdani', 'SAREE_CATEGORY', 'Jamdani', CURRENT_TIMESTAMP),
  ('saree-category-tussar', 'SAREE_CATEGORY', 'Tussar', CURRENT_TIMESTAMP)
ON CONFLICT ("kind", "name") DO NOTHING;