import { startServer } from "./server.mjs";
import { launchChrome } from "./chrome.mjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { writeGuidedAudit } from "./audit-report.mjs";
const root = await mkdtemp(join(tmpdir(), "honk-kuch-"));
const song = ["jog", "radial"].includes(process.env.TUTORIAL_TEST)
  ? process.env.TUTORIAL_TEST
  : "kuch";
const validator =
  song === "jog"
    ? "validate-tutorial-browser"
    : song === "radial"
      ? "validate-tutorial-radial-browser"
      : "validate-kuch-browser";
let service, browser;
let environment;
try {
  service = await startServer({
    host: "127.0.0.1",
    port: 0,
    plain: true,
    dataRoot: root,
  });
  browser = await launchChrome();
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  environment = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    while(!app.initialized)await new Promise(resolve=>setTimeout(resolve,100));
    const gl=app.runtime.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  })()`);
  const result = await browser.send("Runtime.evaluate", {
    expression: `(async()=>{
      const {app}=await import('/src/main.js');
      while(!app.initialized)await new Promise(resolve=>setTimeout(resolve,100));
      return (await import('/scripts/${validator}.mjs')).${song === "radial" ? "validateStandalone" : "validate"}(app);
    })()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    timeout: 900000,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    );
  assert.deepEqual(browser.errors, []);
  await writeGuidedAudit(song, {
    passed: true,
    ...result.result.value,
    environment,
  });
  console.log(
    `Passed complete ${song} tutorial regression. See docs/audits/${song}-tutorial.json.`,
  );
} catch (error) {
  await writeFile(
    `docs/audits/${song}-tutorial.json`,
    JSON.stringify(
      {
        passed: false,
        error: error.message,
        environment,
        browserErrors: browser?.errors,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close();
  await service?.close();
  await rm(root, { recursive: true, force: true });
}
