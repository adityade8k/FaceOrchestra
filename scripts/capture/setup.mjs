import { cp, mkdir, readFile, rm } from "node:fs/promises";
const version = JSON.parse(
  await readFile(new URL("../../node_modules/three/package.json", import.meta.url)),
).version;
const expected = JSON.parse(await readFile(new URL("../../package.json", import.meta.url)))
  .dependencies.three;
if (version !== expected) throw new Error(`Expected Three ${expected}, got ${version}`);
await mkdir(new URL("../../vendor/three/", import.meta.url), { recursive: true });
for (const path of ["build", "examples/jsm", "LICENSE"]) {
  // These paths contain only generated copies; remove stale modules on upgrades.
  await rm(new URL(`../../vendor/three/${path}`, import.meta.url), {
    recursive: true,
    force: true,
  });
  await cp(
    new URL(`../../node_modules/three/${path}`, import.meta.url),
    new URL(`../../vendor/three/${path}`, import.meta.url),
    { recursive: true },
  );
}
console.log(`Local Three.js ${version}, addons and fonts ready.`);
