import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const migrationDir = join(root, "database", "migrations");
const names = (await readdir(migrationDir))
  .filter((name) => /^\d{3}_.+\.sql$/u.test(name))
  .sort();

const errors = [];
const numbers = names.map((name) => Number(name.slice(0, 3)));
for (let index = 0; index < numbers.length; index += 1) {
  const expected = index + 1;
  if (numbers[index] !== expected) errors.push(`Migration sequence expected ${String(expected).padStart(3, "0")} but found ${names[index]}`);
}
if (new Set(numbers).size !== numbers.length) errors.push("Duplicate migration numbers found");

for (const name of names) {
  const sql = (await readFile(join(migrationDir, name), "utf8")).trim().toLowerCase();
  if (!sql.startsWith("begin;")) errors.push(`${name} must start with BEGIN;`);
  if (!sql.endsWith("commit;")) errors.push(`${name} must end with COMMIT;`);
}

if (errors.length) {
  console.error("Migration verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Migration verification passed (${names.length} files, 001-${String(numbers.at(-1)).padStart(3, "0")}).`);
