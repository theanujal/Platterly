// Pure decisions about what a round-trip runner may do to a test database. The inventory and the policy are arguments: this file
// queries nothing and resets nothing. It only says whether a reset would be allowed and why not.

export type InventoryObject = { schema: string; kind: string; name: string };

export type Inventory = {
  schemas: readonly string[];
  extensions: readonly string[];
  // Tables, views, sequences, functions and types in non-system schemas. Indexes and constraints belong to their tables and are not listed.
  objects: readonly InventoryObject[];
  // Rows per table, keyed "schema.table".
  rowCounts: Readonly<Record<string, number>>;
  otherSessions: number;
  // Earlier runs recorded by the runner. "started" means a run that never finished.
  runLog: ReadonlyArray<{ runId: string; status: "started" | "finished" }>;
};

export type InventoryPolicy = {
  allowedSchemas: readonly string[];
  allowedExtensions: readonly string[];
  // Keys "kind:schema.name" of the objects that may exist.
  allowedObjects: readonly string[];
};

export type InventoryVerdict = { ok: true; recovery: boolean } | { ok: false; reasons: string[] };

export const objectKey = (o: InventoryObject): string => `${o.kind}:${o.schema}.${o.name}`;

// Unknown schemas, extensions or objects always refuse. Rows in any table refuse too, unless an earlier run of the runner never finished
// (then the leftovers are its own and a reset is the recovery).
export function classifyInventory(inventory: Inventory, policy: InventoryPolicy): InventoryVerdict {
  const reasons: string[] = [];

  if (inventory.otherSessions > 0) reasons.push(`${inventory.otherSessions} other session(s) are connected`);
  for (const schema of inventory.schemas) {
    if (!policy.allowedSchemas.includes(schema)) reasons.push(`unexpected schema ${schema}`);
  }
  for (const extension of inventory.extensions) {
    if (!policy.allowedExtensions.includes(extension)) reasons.push(`unexpected extension ${extension}`);
  }
  for (const object of inventory.objects) {
    if (!policy.allowedObjects.includes(objectKey(object))) reasons.push(`unexpected ${object.kind} ${object.schema}.${object.name}`);
  }

  const recovery = inventory.runLog.some((entry) => entry.status === "started");
  const populated = Object.entries(inventory.rowCounts).filter(([, count]) => count > 0);
  if (populated.length > 0 && !recovery) {
    for (const [table, count] of populated) reasons.push(`${table} holds ${count} row(s) and no unfinished earlier run explains it`);
  }

  return reasons.length === 0 ? { ok: true, recovery } : { ok: false, reasons };
}

// Compares two schema snapshots (lines of catalogue text). Order does not matter; repeated lines are counted.
export function diffSnapshots(a: readonly string[], b: readonly string[]): { equal: boolean; onlyInA: string[]; onlyInB: string[] } {
  const count = (lines: readonly string[]) => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line, (map.get(line) ?? 0) + 1);
    return map;
  };
  const ca = count(a);
  const cb = count(b);
  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  for (const [line, n] of ca) for (let i = 0; i < n - (cb.get(line) ?? 0); i++) onlyInA.push(line);
  for (const [line, n] of cb) for (let i = 0; i < n - (ca.get(line) ?? 0); i++) onlyInB.push(line);
  return { equal: onlyInA.length === 0 && onlyInB.length === 0, onlyInA: onlyInA.sort(), onlyInB: onlyInB.sort() };
}
