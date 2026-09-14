import { NewCategoryClient } from "./_components/new-category-client";

export default function NewCategoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New Category</h1>
        <p className="text-sm text-muted-foreground">Group menu items for easier browsing (e.g. Starters, Main Course).</p>
      </div>
      <NewCategoryClient />
    </div>
  );
}
