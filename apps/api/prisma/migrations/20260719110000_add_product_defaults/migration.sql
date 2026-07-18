CREATE TABLE "ProductDefaults" (
    "id" TEXT NOT NULL,
    "lengthInMeters" DOUBLE PRECISION NOT NULL DEFAULT 6.2,
    "blouseIncluded" BOOLEAN NOT NULL DEFAULT true,
    "work" TEXT NOT NULL DEFAULT 'Handcrafted',
    "occasion" TEXT NOT NULL DEFAULT 'Festive & occasion wear',
    "care" TEXT NOT NULL DEFAULT 'Dry clean only',
    "gstRatePercent" INTEGER NOT NULL DEFAULT 5,
    "expensesInInr" INTEGER NOT NULL DEFAULT 200,
    "expectedNetMarginPercent" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDefaults_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ProductDefaults" ("id", "updatedAt")
VALUES ('product-defaults', CURRENT_TIMESTAMP);