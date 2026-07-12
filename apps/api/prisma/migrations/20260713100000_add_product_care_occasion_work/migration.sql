ALTER TABLE "Product"
ADD COLUMN "work" TEXT NOT NULL DEFAULT 'Handcrafted',
ADD COLUMN "occasion" TEXT NOT NULL DEFAULT 'Festive & occasion wear',
ADD COLUMN "care" TEXT NOT NULL DEFAULT 'Dry clean only';