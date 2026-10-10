import type { BulkActionResult } from "../actions";

type Done = Extract<BulkActionResult, { ok: true }>;

/** What a bulk add did: how many were created, and which names were skipped or failed (with why). */
export function BulkResult({ result }: { result: Done }) {
  const problems = [
    ...result.skipped.map((s) => `${s.name}: ${s.reason}`),
    ...result.failed.map((f) => `${f.name}: ${f.reason}`),
    ...(result.invalidRows ?? []).map((r) => `Row ${r.row}${r.name ? ` (${r.name})` : ""}: ${r.reason}`),
  ];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm" role="status">
      <p className="font-medium">
        {result.created} added · {result.skipped.length} skipped (already in your Food Items) · {result.failed.length + (result.invalidRows?.length ?? 0)} not added
      </p>
      {problems.length > 0 && (
        <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-muted-foreground">
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
