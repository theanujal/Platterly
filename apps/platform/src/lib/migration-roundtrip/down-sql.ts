// Pure static check of a rollback file against the forward migration it reverses. It reads no file: both texts are arguments.
// Only `DROP TABLE "name"` and `DROP FUNCTION "name"(argument types)` statements are allowed (no IF EXISTS, no CASCADE). Every table and every function the
// forward migration creates is dropped exactly once, nothing else is dropped, a table is dropped before the table its foreign key points to,
// and a function is dropped after all the tables. The migration history row is the runner's job, never the file's.

export type DownSqlCheck = { ok: true; tables: string[]; functions: string[] } | { ok: false; problems: string[] };

const FORBIDDEN = ["CASCADE", "IF EXISTS", "_prisma_migrations", "SCHEMA", "DATABASE", "TRUNCATE", "DELETE", "UPDATE", "ALTER", "INSERT", "GRANT", "REVOKE"];

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

export function createdTables(upSql: string): string[] {
  return [...stripComments(upSql).matchAll(/CREATE\s+TABLE\s+"([^"]+)"/gi)].map((m) => m[1]);
}

export function createdFunctions(upSql: string): string[] {
  return [...stripComments(upSql).matchAll(/CREATE\s+FUNCTION\s+"([^"]+)"\s*\(/gi)].map((m) => m[1]);
}

// [child, parent] for every foreign key added by the forward migration.
export function foreignKeyEdges(upSql: string): Array<[string, string]> {
  return [...stripComments(upSql).matchAll(/ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT\s+"[^"]+"\s+FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+"([^"]+)"/gi)].map((m) => [m[1], m[2]]);
}

export function checkDownSql(downSql: string, upSql: string): DownSqlCheck {
  const problems: string[] = [];
  const code = stripComments(downSql);
  // Double-quoted identifiers are blanked first, so a table or function whose name contains a word such as DELETE (for example a trigger function
  // called "..._before_delete") is not mistaken for a statement. Unquoted text is still checked in full.
  const upper = code.replace(/"[^"]*"/g, '""').toUpperCase();
  for (const word of FORBIDDEN) {
    if (upper.includes(word.toUpperCase())) problems.push(`contains the forbidden text ${word}`);
  }
  if (code.includes("'") || code.includes("$$")) problems.push("contains a string literal or dollar quoting");

  const pieces = code.split(";");
  const trailing = pieces.pop() ?? "";
  if (trailing.trim() !== "") problems.push("has text after the last semicolon");

  const dropped: string[] = [];
  const droppedFunctions: string[] = [];
  const order: string[] = [];
  for (const piece of pieces) {
    const statement = piece.replace(/\s+/g, " ").trim();
    const table = statement.match(/^DROP TABLE "([a-z_][a-z0-9_]*)"$/);
    const fn = statement.match(/^DROP FUNCTION "([a-z_][a-z0-9_]*)"\(([A-Za-z0-9_ ,]*)\)$/);
    if (table) {
      dropped.push(table[1]);
      order.push("table");
    } else if (fn) {
      droppedFunctions.push(fn[1]);
      order.push("function");
    } else problems.push(`statement is not a plain DROP TABLE or DROP FUNCTION of one quoted name: ${statement === "" ? "(empty)" : statement}`);
  }
  if (dropped.length === 0 && droppedFunctions.length === 0 && problems.length === 0) problems.push("drops nothing");
  if (order.lastIndexOf("table") > order.indexOf("function") && order.includes("function")) problems.push("drops a function before the last table");

  const created = createdTables(upSql);
  for (const name of dropped) {
    if (!created.includes(name)) problems.push(`drops ${name}, which the forward migration does not create`);
    if (dropped.indexOf(name) !== dropped.lastIndexOf(name)) problems.push(`drops ${name} more than once`);
  }
  for (const name of created) {
    if (!dropped.includes(name)) problems.push(`does not drop ${name}, which the forward migration creates`);
  }
  const createdFns = createdFunctions(upSql);
  for (const name of droppedFunctions) {
    if (!createdFns.includes(name)) problems.push(`drops the function ${name}, which the forward migration does not create`);
    if (droppedFunctions.indexOf(name) !== droppedFunctions.lastIndexOf(name)) problems.push(`drops the function ${name} more than once`);
  }
  for (const name of createdFns) {
    if (!droppedFunctions.includes(name)) problems.push(`does not drop the function ${name}, which the forward migration creates`);
  }
  for (const [child, parent] of foreignKeyEdges(upSql)) {
    const c = dropped.indexOf(child);
    const p = dropped.indexOf(parent);
    if (c !== -1 && p !== -1 && c > p) problems.push(`drops ${parent} before ${child}, which references it`);
  }

  const unique = [...new Set(problems)];
  return unique.length === 0 ? { ok: true, tables: dropped, functions: droppedFunctions } : { ok: false, problems: unique };
}
