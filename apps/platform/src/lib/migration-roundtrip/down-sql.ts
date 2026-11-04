// Pure static check of a rollback file against the forward migration it reverses. It reads no file: both texts are arguments.
// Only `DROP TABLE "name"` statements are allowed (no IF EXISTS, no CASCADE), every table the forward migration creates is dropped
// exactly once, and a table is dropped before the table its foreign key points to. The migration history row is the runner's job, never the file's.

export type DownSqlCheck = { ok: true; tables: string[] } | { ok: false; problems: string[] };

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

// [child, parent] for every foreign key added by the forward migration.
export function foreignKeyEdges(upSql: string): Array<[string, string]> {
  return [...stripComments(upSql).matchAll(/ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT\s+"[^"]+"\s+FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+"([^"]+)"/gi)].map((m) => [m[1], m[2]]);
}

export function checkDownSql(downSql: string, upSql: string): DownSqlCheck {
  const problems: string[] = [];
  const code = stripComments(downSql);
  const upper = code.toUpperCase();
  for (const word of FORBIDDEN) {
    if (upper.includes(word.toUpperCase())) problems.push(`contains the forbidden text ${word}`);
  }
  if (code.includes("'") || code.includes("$$")) problems.push("contains a string literal or dollar quoting");

  const pieces = code.split(";");
  const trailing = pieces.pop() ?? "";
  if (trailing.trim() !== "") problems.push("has text after the last semicolon");

  const dropped: string[] = [];
  for (const piece of pieces) {
    const statement = piece.replace(/\s+/g, " ").trim();
    const match = statement.match(/^DROP TABLE "([a-z_][a-z0-9_]*)"$/);
    if (!match) problems.push(`statement is not a plain DROP TABLE of one quoted table: ${statement === "" ? "(empty)" : statement}`);
    else dropped.push(match[1]);
  }
  if (dropped.length === 0 && problems.length === 0) problems.push("drops nothing");

  const created = createdTables(upSql);
  for (const name of dropped) {
    if (!created.includes(name)) problems.push(`drops ${name}, which the forward migration does not create`);
    if (dropped.indexOf(name) !== dropped.lastIndexOf(name)) problems.push(`drops ${name} more than once`);
  }
  for (const name of created) {
    if (!dropped.includes(name)) problems.push(`does not drop ${name}, which the forward migration creates`);
  }
  for (const [child, parent] of foreignKeyEdges(upSql)) {
    const c = dropped.indexOf(child);
    const p = dropped.indexOf(parent);
    if (c !== -1 && p !== -1 && c > p) problems.push(`drops ${parent} before ${child}, which references it`);
  }

  const unique = [...new Set(problems)];
  return unique.length === 0 ? { ok: true, tables: dropped } : { ok: false, problems: unique };
}
