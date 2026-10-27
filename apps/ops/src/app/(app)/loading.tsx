/** Shown the moment a link is clicked, while the server renders the next page; without it a click looks dead until the page is ready. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-8 w-56 rounded-lg bg-muted" />
      <div className="h-4 w-80 max-w-full rounded bg-muted" />
      <div className="h-64 rounded-[14px] bg-muted" />
    </div>
  );
}
