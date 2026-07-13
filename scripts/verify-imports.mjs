import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "tools"];
const sourceFiles = roots.flatMap(walk).filter((file) => [".js", ".mjs"].includes(extname(file)));
const errors = [];
const relativeImportPattern = /(?:from\s*|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;

for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(relativeImportPattern)) {
    const target = resolve(file, "..", match[1]);
    if (!existsSync(target)) errors.push(`${file}: unresolved import ${match[1]}`);
  }

  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (syntax.status !== 0) errors.push(`${file}: ${syntax.stderr.trim() || "syntax check failed"}`);
}

const runtimeSource = sourceFiles
  .filter((file) => file.startsWith("src/"))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const interactionLayerSource = sourceFiles
  .filter((file) => (
    file.startsWith("src/app/") ||
    file.startsWith("src/xr/") ||
    file.startsWith("src/instruments/looper/") ||
    file.startsWith("src/instruments/formations/")
  ))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
for (const [label, pattern] of [
  ["ChordInstrument", /\bChordInstrument\b/],
  ["mutable state in Object3D.userData", /userData\.instrumentState/],
  ["direct looper honk references", /connectedHonk(?!Id)/],
  ["obsolete config barrel import", /from\s+["'][^"']*config\.js["']/],
  ["obsolete central InstrumentController", /\bInstrumentController\b/],
  ["obsolete runtime compatibility bridge", /\bRuntimeBindings\b/],
  ["generic cross-domain collider builder", /\bcolliderBuilders\b/],
  ["misnamed looper audio mapping", /\bLooperAudioEngine\b/],
  ["legacy instrument presentation alias", /\.(?:sceneObject|isLooper|interactive)\b/],
  [
    "object-based Looper compatibility adapter",
    /adapter\.(?:getHonkId|isPlayableHonk|getPlaybackTargets|getActionVoiceId|setAutomationLayer|clearAutomationLayer|updateActionVoice|captureAction)\b/,
  ],
]) {
  if (pattern.test(runtimeSource)) errors.push(`forbidden legacy architecture remains: ${label}`);
}

for (const [label, pattern] of [
  ["direct mutable Honk performance state access", /\.performanceState\b/],
  ["direct Honk morph mutation", /\.morphController\.(?:set|reset)/],
  ["direct synth voice mutation outside audio/Honk ownership", /\.synth\.(?:start|update|release|resetPitchBend|setVowel)\s*\(/],
]) {
  if (pattern.test(interactionLayerSource)) errors.push(`forbidden ownership leak remains: ${label}`);
}

for (const privatePath of ["certs/localhost-key.pem", "certs/localhost.pem"]) {
  if (existsSync(privatePath)) errors.push(`tracked/private certificate material still exists: ${privatePath}`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Verified ${sourceFiles.length} source files: syntax, relative imports, and architecture guards passed.`);

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
}
