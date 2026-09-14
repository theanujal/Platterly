-- CreateEnum
CREATE TYPE "FoodType" AS ENUM ('VEGETARIAN', 'NON_VEGETARIAN');

-- CreateEnum
CREATE TYPE "DietaryType" AS ENUM ('STANDARD', 'JAIN', 'VEGAN', 'GLUTEN_FREE');

-- CreateEnum
CREATE TYPE "EggInfo" AS ENUM ('NO_EGG', 'CONTAINS_EGG', 'EGG_OPTIONAL');

-- CreateEnum
CREATE TYPE "PackagePricingModel" AS ENUM ('FIXED', 'PER_PERSON');

-- CreateTable
CREATE TABLE "menu_category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "isFoodProduct" BOOLEAN NOT NULL DEFAULT true,
    "foodType" "FoodType",
    "dietaryType" "DietaryType",
    "eggInfo" "EggInfo",
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recipeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_menu_item" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_package" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "pricingModel" "PackagePricingModel" NOT NULL,
    "fixedPrice" DECIMAL(10,2),
    "perPersonPrice" DECIMAL(10,2),
    "minGuests" INTEGER,
    "maxGuests" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_package_item" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "isAddOn" BOOLEAN NOT NULL DEFAULT false,
    "extraPrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_package_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_category_organizationId_idx" ON "menu_category"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_category_organizationId_name_key" ON "menu_category"("organizationId", "name");

-- CreateIndex
CREATE INDEX "menu_item_organizationId_idx" ON "menu_item"("organizationId");

-- CreateIndex
CREATE INDEX "menu_item_categoryId_idx" ON "menu_item"("categoryId");

-- CreateIndex
CREATE INDEX "menu_organizationId_idx" ON "menu"("organizationId");

-- CreateIndex
CREATE INDEX "menu_menu_item_menuId_idx" ON "menu_menu_item"("menuId");

-- CreateIndex
CREATE INDEX "menu_menu_item_menuItemId_idx" ON "menu_menu_item"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_menu_item_menuId_menuItemId_key" ON "menu_menu_item"("menuId", "menuItemId");

-- CreateIndex
CREATE INDEX "menu_package_organizationId_idx" ON "menu_package"("organizationId");

-- CreateIndex
CREATE INDEX "menu_package_item_packageId_idx" ON "menu_package_item"("packageId");

-- CreateIndex
CREATE INDEX "menu_package_item_menuItemId_idx" ON "menu_package_item"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_package_item_packageId_menuItemId_key" ON "menu_package_item"("packageId", "menuItemId");

-- AddForeignKey
ALTER TABLE "menu_category" ADD CONSTRAINT "menu_category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu" ADD CONSTRAINT "menu_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_menu_item" ADD CONSTRAINT "menu_menu_item_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_menu_item" ADD CONSTRAINT "menu_menu_item_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_package" ADD CONSTRAINT "menu_package_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_package_item" ADD CONSTRAINT "menu_package_item_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "menu_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_package_item" ADD CONSTRAINT "menu_package_item_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
