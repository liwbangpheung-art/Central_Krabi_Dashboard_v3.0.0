import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

async function collect(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (/\.(js|mjs)$/u.test(entry.name)) files.push(full);
  }
  return files;
}

const files = [...await collect("src"), ...await collect("scripts"), "server.js"];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Backend syntax check passed (${files.length} files).`);
