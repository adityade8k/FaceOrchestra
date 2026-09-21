import { cp, mkdir, readFile } from 'node:fs/promises';
const version = JSON.parse(await readFile(new URL('../../node_modules/three/package.json', import.meta.url))).version;
if (version !== '0.164.1') throw new Error(`Expected Three 0.164.1, got ${version}`);
await mkdir(new URL('../../vendor/three/', import.meta.url), { recursive: true });
for (const path of ['build', 'examples/jsm', 'examples/fonts', 'LICENSE']) {
  await cp(new URL(`../../node_modules/three/${path}`, import.meta.url), new URL(`../../vendor/three/${path}`, import.meta.url), { recursive: true });
}
console.log('Local Three.js 0.164.1, addons and fonts ready.');
