import { Skeleton } from "@/components/ui/skeleton";

/** Shown the moment a link to another section is clicked, while the server renders it; without it a click looks dead. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4 p-6 md:p-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
