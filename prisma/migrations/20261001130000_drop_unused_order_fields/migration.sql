/*
  Warnings:

  - You are about to drop the column `adultNonVegCount` on the `order` table. All the data in the column will be lost.
  - You are about to drop the column `adultVegCount` on the `order` table. All the data in the column will be lost.
  - You are about to drop the column `venueLatitude` on the `order` table. All the data in the column will be lost.
  - You are about to drop the column `venueLongitude` on the `order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "order" DROP COLUMN "adultNonVegCount",
DROP COLUMN "adultVegCount",
DROP COLUMN "venueLatitude",
DROP COLUMN "venueLongitude";
