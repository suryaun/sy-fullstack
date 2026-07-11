-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'SOLD_OUT');

-- CreateEnum
CREATE TYPE "Material" AS ENUM ('SILK', 'CHIFFON', 'COTTON', 'GEORGETTE', 'ORGANZA', 'LINEN', 'CREPE', 'SATIN');

-- CreateEnum
CREATE TYPE "Craft" AS ENUM ('BANARASI', 'KANJEEVARAM', 'BANDHANI', 'CHIKANKARI', 'PAITHANI', 'PATOLA', 'JAMDANI', 'TUSSAR');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentProvider" AS ENUM ('DELHIVERY');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'BOOKED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BackInStockStatus" AS ENUM ('ACTIVE', 'NOTIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PieceStatus" AS ENUM ('AVAILABLE', 'SOLD', 'RETURNED', 'REMOVED');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sequenceNumber" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fabric" "Material" NOT NULL,
    "craft" "Craft" NOT NULL,
    "lengthInMeters" DOUBLE PRECISION NOT NULL,
    "blouseIncluded" BOOLEAN NOT NULL DEFAULT false,
    "hasHandloomMark" BOOLEAN NOT NULL DEFAULT false,
    "priceInPaise" INTEGER NOT NULL,
    "stockStatus" "StockStatus" NOT NULL DEFAULT 'IN_STOCK',
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "instagramReelUrl" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "packageType" TEXT NOT NULL DEFAULT 'Plastic cover/Flyer',
    "packageLengthCm" INTEGER NOT NULL DEFAULT 40,
    "packageWidthCm" INTEGER NOT NULL DEFAULT 30,
    "packageHeightCm" INTEGER NOT NULL DEFAULT 6,
    "weightGrams" INTEGER NOT NULL DEFAULT 800,
    "sourcePincode" TEXT NOT NULL DEFAULT '560064',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductColor" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorCode" TEXT,
    "borderColorName" TEXT,
    "borderColorCode" TEXT,
    "sku" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "priceInPaise" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductColorImage" (
    "id" TEXT NOT NULL,
    "productColorId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductColorImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPiece" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "productColorId" TEXT NOT NULL,
    "pieceNumber" INTEGER NOT NULL,
    "status" "PieceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "allocatedOrderItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "amountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deliveryState" TEXT,
    "deliveryAddressSnapshot" JSONB,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "taxableAmountInPaise" INTEGER NOT NULL DEFAULT 0,
    "cgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "igstInPaise" INTEGER NOT NULL DEFAULT 0,
    "notes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderShipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "ShipmentProvider" NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "sourcePincode" TEXT,
    "providerShipmentId" TEXT,
    "providerWaybill" TEXT,
    "providerReference" TEXT,
    "serviceablePostalCode" BOOLEAN,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "failureMessage" TEXT,
    "bookedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productColorId" TEXT,
    "colorNameAtTime" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceAtTime" INTEGER NOT NULL,
    "hsnCode" TEXT,
    "gstRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableAmountInPaise" INTEGER NOT NULL DEFAULT 0,
    "cgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "igstInPaise" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUser" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "fullName" TEXT,
    "email" TEXT,
    "profileComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "addressType" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackInStockRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productColorId" TEXT NOT NULL,
    "status" "BackInStockStatus" NOT NULL DEFAULT 'ACTIVE',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "BackInStockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileOtp" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,

    CONSTRAINT "MobileOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "financialYear" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("financialYear")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "productColorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_stockStatus_idx" ON "Product"("stockStatus");

-- CreateIndex
CREATE INDEX "Product_hidden_idx" ON "Product"("hidden");

-- CreateIndex
CREATE INDEX "Category_parentId_sortOrder_idx" ON "Category"("parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Category_parentId_slug_key" ON "Category"("parentId", "slug");

-- CreateIndex
CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductColor_sku_key" ON "ProductColor"("sku");

-- CreateIndex
CREATE INDEX "ProductColor_productId_isDefault_idx" ON "ProductColor"("productId", "isDefault");

-- CreateIndex
CREATE INDEX "ProductColor_productId_stockQuantity_idx" ON "ProductColor"("productId", "stockQuantity");

-- CreateIndex
CREATE UNIQUE INDEX "ProductColor_productId_name_key" ON "ProductColor"("productId", "name");

-- CreateIndex
CREATE INDEX "ProductColorImage_productColorId_sortOrder_idx" ON "ProductColorImage"("productColorId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPiece_serial_key" ON "ProductPiece"("serial");

-- CreateIndex
CREATE INDEX "ProductPiece_status_idx" ON "ProductPiece"("status");

-- CreateIndex
CREATE INDEX "ProductPiece_productColorId_status_idx" ON "ProductPiece"("productColorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPiece_productColorId_pieceNumber_key" ON "ProductPiece"("productColorId", "pieceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_razorpayOrderId_key" ON "Order"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_razorpayPaymentId_key" ON "Order"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_invoiceNumber_idx" ON "Order"("invoiceNumber");

-- CreateIndex
CREATE INDEX "OrderShipment_orderId_status_idx" ON "OrderShipment"("orderId", "status");

-- CreateIndex
CREATE INDEX "OrderShipment_provider_status_idx" ON "OrderShipment"("provider", "status");

-- CreateIndex
CREATE INDEX "OrderShipment_providerShipmentId_idx" ON "OrderShipment"("providerShipmentId");

-- CreateIndex
CREATE INDEX "OrderShipment_providerWaybill_idx" ON "OrderShipment"("providerWaybill");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_productColorId_idx" ON "OrderItem"("productColorId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_mobile_key" ON "CustomerUser"("mobile");

-- CreateIndex
CREATE INDEX "CustomerUser_mobile_idx" ON "CustomerUser"("mobile");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_isDefault_idx" ON "CustomerAddress"("customerId", "isDefault");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_updatedAt_idx" ON "CustomerAddress"("customerId", "updatedAt");

-- CreateIndex
CREATE INDEX "BackInStockRequest_productColorId_status_idx" ON "BackInStockRequest"("productColorId", "status");

-- CreateIndex
CREATE INDEX "BackInStockRequest_productId_status_idx" ON "BackInStockRequest"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BackInStockRequest_customerId_productId_productColorId_key" ON "BackInStockRequest"("customerId", "productId", "productColorId");

-- CreateIndex
CREATE INDEX "MobileOtp_mobile_createdAt_idx" ON "MobileOtp"("mobile", "createdAt");

-- CreateIndex
CREATE INDEX "MobileOtp_expiresAt_idx" ON "MobileOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "StockReservation_productColorId_expiresAt_idx" ON "StockReservation"("productColorId", "expiresAt");

-- CreateIndex
CREATE INDEX "StockReservation_customerId_idx" ON "StockReservation"("customerId");

-- CreateIndex
CREATE INDEX "StockReservation_razorpayOrderId_idx" ON "StockReservation"("razorpayOrderId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColorImage" ADD CONSTRAINT "ProductColorImage_productColorId_fkey" FOREIGN KEY ("productColorId") REFERENCES "ProductColor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPiece" ADD CONSTRAINT "ProductPiece_productColorId_fkey" FOREIGN KEY ("productColorId") REFERENCES "ProductColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPiece" ADD CONSTRAINT "ProductPiece_allocatedOrderItemId_fkey" FOREIGN KEY ("allocatedOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productColorId_fkey" FOREIGN KEY ("productColorId") REFERENCES "ProductColor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackInStockRequest" ADD CONSTRAINT "BackInStockRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackInStockRequest" ADD CONSTRAINT "BackInStockRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackInStockRequest" ADD CONSTRAINT "BackInStockRequest_productColorId_fkey" FOREIGN KEY ("productColorId") REFERENCES "ProductColor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileOtp" ADD CONSTRAINT "MobileOtp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
