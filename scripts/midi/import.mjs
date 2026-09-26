import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  stat,
  rename,
  rm,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { basename, resolve, join } from "node:path";
import { normalizeMidi } from "./normalize.mjs";
import { arrangeMidi } from "./arrange.mjs";
const [input, output, optionsPath] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: npm run midi:import -- actual.mid output-directory [arrangement-options.json]",
  );
if ((await stat(input)).size > 16 * 1024 * 1024)
  throw new Error("MIDI exceeds the 16 MiB import bound");
const bytes = await readFile(input),
  options = optionsPath ? JSON.parse(await readFile(optionsPath, "utf8")) : {};
const normalized = normalizeMidi(bytes, {
  filename: basename(input),
  ...(options.import || {}),
});
// Validate re-import policy before replacing any current source or arrangement.
let previous = null;
try {
  previous = JSON.parse(
    await readFile(join(output, "composition.json"), "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const definition = optionsPath
  ? arrangeMidi(normalized, options, previous)
  : null;
const normalizedHash = createHash("sha256")
  .update(JSON.stringify(normalized))
  .digest("hex");
const normalizedName = `${normalizedHash}.normalized.json`;
async function atomicJSON(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
await mkdir(output, { recursive: true });
// Keep the prior complete bundle, including older normalized.json references.
if (previous) {
  const previousHash = createHash("sha256")
    .update(JSON.stringify(previous))
    .digest("hex");
  const archive = join(output, "versions", previousHash);
  await mkdir(archive, { recursive: true });
  const files = [
    "composition.json",
    "normalized.json",
    "inventory.json",
    "import-options.json",
  ];
  if (/^[a-f0-9]{64}\.normalized\.json$/.test(previous.normalizedSource?.file))
    files.push(previous.normalizedSource.file);
  if (/^[a-f0-9]{64}$/.test(previous.source?.sha256))
    files.push(`${previous.source.sha256}.mid`);
  for (const name of files) {
    try {
      await copyFile(
        join(output, name),
        join(archive, name),
        constants.COPYFILE_EXCL,
      );
    } catch (error) {
      if (!["ENOENT", "EEXIST"].includes(error.code)) throw error;
    }
  }
}
await atomicJSON(join(output, "import-options.json"), options);
const original = join(output, `${normalized.source.sha256}.mid`);
if (resolve(original) !== resolve(input)) await copyFile(input, original);
await atomicJSON(join(output, normalizedName), normalized);
await atomicJSON(join(output, "normalized.json"), normalized);
await atomicJSON(join(output, "inventory.json"), {
  source: normalized.source,
  inventory: normalized.inventory,
  warnings: normalized.warnings,
});
if (definition) {
  await atomicJSON(
    join(output, `${definition.contentHash}.composition.json`),
    definition,
  );
  await atomicJSON(join(output, "composition.json"), definition);
  console.log(
    `Validated ${definition.id}: ${definition.lessons.length} guided lessons, hash ${definition.contentHash}. Register with loadDataComposition().`,
  );
} else
  console.log(
    "Source preserved and inventoried. Review track/channel/port roles, then supply explicit arrangement options. No composition was invented.",
  );
