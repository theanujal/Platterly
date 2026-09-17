-- CreateEnum
CREATE TYPE "MenuItemOrigin" AS ENUM ('NORTH_INDIAN', 'SOUTH_INDIAN', 'PUNJABI', 'GUJARATI', 'BENGALI', 'MUGHLAI', 'CHINESE', 'CONTINENTAL', 'ITALIAN', 'MEXICAN', 'THAI', 'SOUTH_EAST_ASIAN', 'FUSION', 'OTHER');

-- CreateEnum
CREATE TYPE "MenuItemBaseType" AS ENUM ('GRAVY_BASED', 'DRY', 'CREAM_BASED', 'TOMATO_BASED', 'COCONUT_BASED', 'YOGURT_BASED', 'CLEAR', 'OTHER');

-- CreateEnum
CREATE TYPE "MenuItemPreparationMethod" AS ENUM ('GRILLED', 'ROASTED', 'DEEP_FRIED', 'SHALLOW_FRIED', 'STEAMED', 'SAUTEED', 'BAKED', 'BOILED', 'TANDOOR', 'RAW', 'SLOW_COOKED', 'OTHER');

-- CreateEnum
CREATE TYPE "MenuItemSpiceLevel" AS ENUM ('NONE', 'MILD', 'MEDIUM', 'SPICY', 'EXTRA_SPICY');

-- CreateEnum
CREATE TYPE "MenuItemOnionGarlic" AS ENUM ('WITH_ONION_GARLIC', 'WITHOUT_ONION_GARLIC');

-- CreateEnum
CREATE TYPE "MenuItemTexture" AS ENUM ('CRISPY', 'SOFT', 'CREAMY', 'CRUNCHY', 'SMOOTH', 'CHEWY', 'JUICY', 'FLAKY', 'OTHER');

-- CreateEnum
CREATE TYPE "MenuItemTasteProfile" AS ENUM ('SWEET', 'SOUR', 'SPICY', 'TANGY', 'SAVORY', 'BITTER', 'UMAMI', 'MILD');

-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "baseType" "MenuItemBaseType",
ADD COLUMN     "keyIngredients" TEXT,
ADD COLUMN     "nonVegFriendly" BOOLEAN,
ADD COLUMN     "onionGarlic" "MenuItemOnionGarlic",
ADD COLUMN     "origin" "MenuItemOrigin",
ADD COLUMN     "preparationMethod" "MenuItemPreparationMethod",
ADD COLUMN     "spiceLevel" "MenuItemSpiceLevel",
ADD COLUMN     "tasteProfile" "MenuItemTasteProfile",
ADD COLUMN     "texture" "MenuItemTexture",
ADD COLUMN     "vegFriendly" BOOLEAN;

