import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/capture/server.mjs";
import { launchChrome } from "../tests/helpers/chrome.mjs";

// The session owns all test data, reports, browser processes and server sockets.
export async function createBrowserSession() {
  const root = await mkdtemp(join(tmpdir(), "honk-validation-"));
  const dataRoot = join(root, "takes"),
    output = join(root, "reports");
  await Promise.all([mkdir(dataRoot), mkdir(output)]);
  let service,
    browser,
    closed = false;
  const session = {
    dataRoot,
    output,
    get browser() {
      return browser;
    },
    async start({ root } = {}) {
      try {
        service = await startServer({
          host: "127.0.0.1",
          port: 0,
          plain: true,
          pairCode: "123456",
          dataRoot,
          testRoutes: true,
          ...(root ? { root } : {}),
        });
        if (process.platform === "darwin") process.env.CAPTURE_SOFTWARE_GL ??= "0";
        browser = await launchChrome();
        await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
        return service;
      } catch (error) {
        await session.close();
        throw error;
      }
    },
    async ready() {
      await browser.navigate(`http://127.0.0.1:${service.port}/`);
      await browser.evaluate(`(async()=>{
        const {app}=await import('/src/main.js');
        for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await new Promise(r=>setTimeout(r,100));
        if(!app.runtime.tutorial.ready)throw new Error('Application did not initialize');
      })()`);
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await browser?.close();
      } finally {
        try {
          await service?.close();
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    },
  };
  return session;
}
export async function withBrowser(check) {
  const session = await createBrowserSession();
  try {
    const service = await session.start();
    await session.ready();
    const result = await check(session.browser, service, session);
    if (session.browser.errors.length) throw new Error(session.browser.errors.join("\n"));
    return result;
  } catch (error) {
    if (session.browser?.errors.length) console.error("Browser errors:", session.browser.errors);
    throw error;
  } finally {
    await session.close();
  }
}
