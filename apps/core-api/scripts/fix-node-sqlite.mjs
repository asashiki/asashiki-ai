import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve(process.cwd(), "dist/server.js");
const source = await readFile(outputPath, "utf8");

const next = source
  .replaceAll('from "sqlite"', 'from "node:sqlite"')
  .replaceAll("from 'sqlite'", "from 'node:sqlite'");

if (next !== source) {
  await writeFile(outputPath, next, "utf8");
  console.log("Rewrote bundled sqlite import back to node:sqlite.");
} else {
  console.log("No sqlite import rewrite needed.");
}
