import { createBrowserSession } from "../../scripts/browser-session.mjs";
const session = await createBrowserSession();
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const root = session.dataRoot;
const output = `${session.output}/sustain`;
let service, browser;
try {
  await mkdir(output, { recursive: true });
  service = await session.start();
  if (process.platform === "darwin") process.env.CAPTURE_SOFTWARE_GL ??= "0";
  browser = session.browser;
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const { report, snapshots } = await browser.evaluate(`(async () => {
    const { app } = await import('/src/main.js');
    const { validate } = await import('/tests/browser/validate-note-practice-browser.mjs');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let i = 0; i < 300 && !app.runtime.tutorial.ready; i++) await wait(100);
    const r = app.runtime;
    r.renderer.setPixelRatio(.4);
    await wait(700);
    const snapshots = {};
    const report = await validate(r.tutorial, { onSustain: ({ pair, fraction, complete }) => {
      const key = complete ? 'complete' : fraction >= .35 && fraction <= .65 ? 'half' : null;
      if (!key || snapshots[key]) return;
      const camera = r.getUserCamera();
      camera.position.copy(pair.white.position); camera.position.z += .7;
      camera.lookAt(pair.white.position); camera.updateMatrixWorld(true);
      r.tutorial.cues.update(r.tutorial.dataTutorial.guide, performance.now());
      r.renderer.render(r.scene, camera);
      snapshots[key] = r.renderer.domElement.toDataURL('image/png');
    }});
    await r.tutorial.action('rishte-stop');
    return { report, snapshots };
  })()`);
  assert.deepEqual(browser.errors, []);
  assert.ok(snapshots.half && snapshots.complete, "Missing visual sustain samples");
  for (const [name, data] of Object.entries(snapshots))
    await writeFile(`${output}/${name}.png`, Buffer.from(data.split(",")[1], "base64"));
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  if (browser?.errors.length) console.error(browser.errors);

  await session.close();
}
