import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Linter } from "eslint";
import { architectureErrors } from "./architecture-rules.mjs";

const startedAt = performance.now();
const parser = new Linter();
const modules = new Map();
const sources = new Map();

const roots = ["src", "capture", "server", "scripts", "tests"];
const sourceFiles = roots.flatMap(walk).filter((file) => [".js", ".mjs"].includes(extname(file)));
const errors = [];
// Literal imports also occur inside browser evaluation strings. Check those URLs too.
const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g;
const urlPattern = /new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g;
const workerPattern = /(?:new (?:Shared)?Worker\s*\(|\.addModule\s*\()\s*["']([^"']+)["']/g;
const assetPattern = /["']((?:\.?\/)?(?:model|vendor)\/[^"'\n]+\.(?:glb|png|jpe?g|json|js))["']/gi;
function checkPath(file, reference, { module = false, root = false } = {}) {
  if (reference.includes("${") || /^(?:[a-z]+:|#)/i.test(reference)) return;
  if (module && !reference.startsWith(".") && !reference.startsWith("/")) return;
  const clean = reference.split(/[?#]/)[0];
  const target =
    root || clean.startsWith("/")
      ? resolve(clean.replace(/^\.?\//, ""))
      : resolve(file, "..", clean);
  if (!existsSync(target)) errors.push(`${file}: unresolved local reference ${reference}`);
}
for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  sources.set(file, source);
  for (const match of source.matchAll(importPattern)) checkPath(file, match[1], { module: true });
  for (const match of source.matchAll(urlPattern)) checkPath(file, match[1]);
  for (const match of source.matchAll(workerPattern)) checkPath(file, match[1], { root: true });
  for (const match of source.matchAll(assetPattern)) checkPath(file, match[1], { root: true });
  // Parse once in-process; the same AST serves syntax and architecture checks.
  // ESLint is a declared dev dependency, unlike a transitive parser import.
  const syntax = parser.verify(source, {
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  });
  const fatal = syntax.filter((message) => message.fatal);
  for (const message of fatal) errors.push(`${file}:${message.line}: ${message.message}`);
  if (!fatal.length) {
    const parsed = parser.getSourceCode();
    modules.set(file, { ast: parsed.ast, visitorKeys: parsed.visitorKeys });
  }
}
for (const file of ["index.html", ...walk("capture").filter((file) => file.endsWith(".html"))]) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) checkPath(file, match[1]);
}

const runtimeSource = sourceFiles
  .filter((file) => file.startsWith("src/"))
  .map((file) => sources.get(file))
  .join("\n");
const interactionLayerSource = sourceFiles
  .filter(
    (file) =>
      file.startsWith("src/app/") ||
      file.startsWith("src/xr/") ||
      file.startsWith("src/instruments/looper/") ||
      file.startsWith("src/instruments/formations/"),
  )
  .map((file) => sources.get(file))
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
  [
    "direct synth voice mutation outside audio/Honk ownership",
    /\.synth\.(?:start|update|release|resetPitchBend|setVowel)\s*\(/,
  ],
]) {
  if (pattern.test(interactionLayerSource))
    errors.push(`forbidden ownership leak remains: ${label}`);
}

errors.push(...architectureErrors(modules));

const privatePaths = ["certs/localhost-key.pem", "certs/localhost.pem"];
const trackedPrivatePaths = spawnSync("git", ["ls-files", "--", ...privatePaths], {
  encoding: "utf8",
});
if (trackedPrivatePaths.status !== 0) {
  errors.push(
    `could not verify tracked certificate material: ${trackedPrivatePaths.stderr.trim()}`,
  );
} else {
  for (const privatePath of trackedPrivatePaths.stdout.trim().split("\n").filter(Boolean)) {
    errors.push(`tracked/private certificate material still exists: ${privatePath}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Verified ${sourceFiles.length} source files: syntax, imports, workers, worklets, assets, and architecture guards passed in ${Math.round(performance.now() - startedAt)} ms.`,
);

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
}
