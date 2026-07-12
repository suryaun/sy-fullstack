CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductOption_type_name_key" ON "ProductOption"("type", "name");
CREATE INDEX "ProductOption_type_sortOrder_idx" ON "ProductOption"("type", "sortOrder");

INSERT INTO "ProductOption" ("id", "type", "name", "sortOrder", "updatedAt") VALUES
  ('product-option-work-handcrafted', 'WORK', 'Handcrafted', 0, CURRENT_TIMESTAMP),
  ('product-option-work-handloom', 'WORK', 'Handloom', 1, CURRENT_TIMESTAMP),
  ('product-option-work-handwoven', 'WORK', 'Handwoven', 2, CURRENT_TIMESTAMP),
  ('product-option-work-zari', 'WORK', 'Zari work', 3, CURRENT_TIMESTAMP),
  ('product-option-work-embroidery', 'WORK', 'Embroidery', 4, CURRENT_TIMESTAMP),
  ('product-option-work-printed', 'WORK', 'Printed', 5, CURRENT_TIMESTAMP),
  ('product-option-occasion-festive', 'OCCASION', 'Festive & occasion wear', 0, CURRENT_TIMESTAMP),
  ('product-option-occasion-wedding', 'OCCASION', 'Wedding', 1, CURRENT_TIMESTAMP),
  ('product-option-occasion-casual', 'OCCASION', 'Casual wear', 2, CURRENT_TIMESTAMP),
  ('product-option-occasion-office', 'OCCASION', 'Office wear', 3, CURRENT_TIMESTAMP),
  ('product-option-occasion-party', 'OCCASION', 'Party wear', 4, CURRENT_TIMESTAMP),
  ('product-option-occasion-gifting', 'OCCASION', 'Gifting', 5, CURRENT_TIMESTAMP),
  ('product-option-care-dry-clean', 'CARE', 'Dry clean only', 0, CURRENT_TIMESTAMP),
  ('product-option-care-hand-wash', 'CARE', 'Gentle hand wash', 1, CURRENT_TIMESTAMP),
  ('product-option-care-machine-wash', 'CARE', 'Gentle machine wash', 2, CURRENT_TIMESTAMP),
  ('product-option-care-professional', 'CARE', 'Professional cleaning recommended', 3, CURRENT_TIMESTAMP);