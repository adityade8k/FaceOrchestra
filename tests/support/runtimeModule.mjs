import { readFile } from 'node:fs/promises';

// Match the existing runtime tests: replace only browser Three imports. The
// behavioral methods, registries, contact processing and audio are production code.
// Geometry/rotation correctness is checked separately in the browser fixture.
const three = `export class Quaternion {} export class Euler {} export class Vector3 {}
export class Matrix4 {} export const MathUtils = {
  clamp: (v,a,b) => Math.min(Math.max(v,a),b), degToRad: v => v*Math.PI/180
};`;
const dataURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const coordinatorURL = new URL('../../src/xr/XRInteractionCoordinator.js', import.meta.url);
export async function runtimeModule(url) {
  let source = await readFile(url, 'utf8');
  source = source.replace('from "three"', `from "${dataURL(three)}"`);
  if (source.includes('from "../../xr/XRInteractionCoordinator.js"')) {
    const coordinator = await moduleSource(coordinatorURL);
    source = source.replace('from "../../xr/XRInteractionCoordinator.js"', `from "${dataURL(coordinator)}"`);
  }
  source = source.replace(/from "(\.\.?\/[^\"]+)"/g, (_, path) => `from "${new URL(path, url).href}"`);
  return import(dataURL(source + `\n//# sourceURL=${url.href}`));
}
async function moduleSource(url) {
  return (await readFile(url, 'utf8')).replace('from "three"', `from "${dataURL(three)}"`)
    .replace(/from "(\.\.?\/[^\"]+)"/g, (_, path) => `from "${new URL(path, url).href}"`);
}
