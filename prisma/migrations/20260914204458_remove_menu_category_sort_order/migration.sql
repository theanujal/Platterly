-- Revert the 2026-09-14 drag-to-reorder feature for Menu Categories (AJ:
-- "I do not want that there") -- MenuCategoryAssignment.sortOrder (the
-- per-menu concept) is untouched.
ALTER TABLE "menu_category" DROP COLUMN "sortOrder";
