-- data-safe-approved: purely additive (one defaulted boolean column and one new join table). The cascades are on the new add_on_menu table only, so its rows go when their add-on or menu is deleted; no existing data is touched or removed.

-- AlterTable
ALTER TABLE "add_on" ADD COLUMN     "appliesToAllMenus" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "add_on_menu" (
    "id" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "add_on_menu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "add_on_menu_menuId_idx" ON "add_on_menu"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "add_on_menu_addOnId_menuId_key" ON "add_on_menu"("addOnId", "menuId");

-- AddForeignKey
ALTER TABLE "add_on_menu" ADD CONSTRAINT "add_on_menu_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "add_on"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_menu" ADD CONSTRAINT "add_on_menu_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
