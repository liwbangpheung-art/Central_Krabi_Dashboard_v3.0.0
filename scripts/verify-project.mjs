import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import process from "node:process";

const root = new URL("../", import.meta.url).pathname;
const required = [
  "frontend/package.json", "frontend/package-lock.json", "frontend/.env.example",
  "backend/package.json", "backend/package-lock.json", "backend/.env.example",
  "database/migrations/001_phase1_schema.sql", "database/migrations/013_v2_5_2_daily_quantity_policy.sql",
  "database/migrations/014_phase_a_user_permissions.sql", "database/migrations/015_phase_b_data_governance.sql", "database/release_2_7_0_smoke_test.sql",
  "docs/CURRENT_STATUS.md", "docs/NEXT_PHASE.md", "docs/PHASE_A_API.md", "docs/PHASE_A_ACCEPTANCE_TEST.md",
  "docs/PHASE_B_API.md", "docs/PHASE_B_ACCEPTANCE_TEST.md", "docs/TEST_RESULTS_2.7.0.md",
  "CURRENT_STATUS.md", "NEXT_PHASE.md", "scripts/check-migrations.mjs", "scripts/live-e2e.mjs",
  "frontend/src/lib/daily-import.js", "frontend/src/lib/permissions.js", "frontend/src/pages/UserManagementPage.jsx", "frontend/src/pages/DataQualityPage.jsx",
  "backend/src/routes/users.routes.js", "backend/src/routes/data-governance.routes.js", "backend/src/domain/data-governance.js", "backend/src/security/permissions.js", "render.yaml", ".gitignore", "README.md", "CHANGELOG.md", "VERSION"
];
const errors = [];

for (const file of required) {
  try { await stat(join(root, file)); } catch { errors.push(`Missing required file: ${file}`); }
}

async function walk(dir) {
  const results = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (["node_modules", "dist", ".git", "coverage"].includes(entry.name)) continue;
    if (entry.isDirectory()) results.push(...await walk(full));
    else results.push(full);
  }
  return results;
}

const files = await walk(root);
const forbiddenNames = new Set(["new", "newddd", "newaa"]);
for (const file of files) {
  const name = relative(root, file).replaceAll("\\", "/");
  if (forbiddenNames.has(basename(file).toLowerCase())) errors.push(`Experimental file must be removed: ${name}`);
  if (basename(file) === ".env") errors.push(`Real .env file must not be included: ${name}`);
  if (!/\.(json|js|jsx|mjs|md|sql|yaml|yml|example|txt|gitignore)$/u.test(name) && !name.endsWith("VERSION")) continue;
  const content = await readFile(file, "utf8");
  if (name !== "scripts/verify-project.mjs" && /(applied-caas-gateway|internal\.api\.openai\.org)/u.test(content)) {
    errors.push(`Internal registry reference found in: ${name}`);
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(content)) errors.push(`Private key material found in: ${name}`);
  if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/u.test(content)) errors.push(`JWT-like secret found in: ${name}`);
  if (name.endsWith("package-lock.json")) {
    const nonPublic = [...content.matchAll(/"resolved"\s*:\s*"([^"]+)"/gu)]
      .map((match) => match[1])
      .filter((url) => !url.startsWith("https://registry.npmjs.org/"));
    if (nonPublic.length) errors.push(`Non-public resolved URLs found in ${name}: ${nonPublic.slice(0, 3).join(", ")}`);
  }
}

for (const file of ["package.json", "backend/package.json", "frontend/package.json"]) {
  try { JSON.parse(await readFile(join(root, file), "utf8")); }
  catch (error) { errors.push(`Invalid JSON in ${file}: ${error.message}`); }
}

const version = (await readFile(join(root, "VERSION"), "utf8")).trim();
for (const file of ["package.json", "backend/package.json", "frontend/package.json"]) {
  const pkg = JSON.parse(await readFile(join(root, file), "utf8"));
  if (pkg.version !== version) errors.push(`${file} version ${pkg.version} does not match VERSION ${version}`);
}
const versionSource = await readFile(join(root, "backend/src/version.js"), "utf8");
if (!versionSource.includes(`"${version}"`)) errors.push("backend/src/version.js does not match VERSION");

const frontendExample = await readFile(join(root, "frontend/.env.example"), "utf8");
const render = await readFile(join(root, "render.yaml"), "utf8");
if (!frontendExample.includes("VITE_API_BASE_URL=")) errors.push("frontend/.env.example must use VITE_API_BASE_URL");
if (!render.includes("VITE_API_BASE_URL")) errors.push("render.yaml must use VITE_API_BASE_URL");
for (const file of ["frontend/src", "frontend/tests", "render.yaml", "frontend/.env.example"]) {
  const target = join(root, file);
  const candidates = (await stat(target)).isDirectory() ? (await walk(target)) : [target];
  for (const candidate of candidates) {
    const content = await readFile(candidate, "utf8");
    if (content.includes("VITE_API_URL")) errors.push(`Legacy VITE_API_URL found in ${relative(root, candidate)}`);
  }
}

const gitignore = await readFile(join(root, ".gitignore"), "utf8");
for (const rule of ["node_modules/", "dist/", ".env", "*.pem", "*.key"]) {
  if (!gitignore.includes(rule)) errors.push(`.gitignore missing rule: ${rule}`);
}

if (errors.length) {
  console.error("Project verification failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Project verification passed.");
console.log("- Repository structure and versions are consistent");
console.log("- No real .env, private keys, JWT-like secrets, or internal registry references");
console.log("- Frontend uses VITE_API_BASE_URL only");
console.log("- Required release documents and migration files exist");
