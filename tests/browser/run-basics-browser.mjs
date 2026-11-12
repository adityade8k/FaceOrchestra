import { createBrowserSession } from "../../scripts/browser-session.mjs";
const session = await createBrowserSession();
import { writeFile } from "node:fs/promises";

const root = session.dataRoot;
let service, browser;
let progress;
try {
  service = await session.start();
  browser = session.browser;
  await browser.navigate("http://127.0.0.1:" + service.port + "/");
  progress = setInterval(
    () =>
      browser
        .evaluate("globalThis.basicsTestStage || ''")
        .then((stage) => console.log("Checking: " + stage))
        .catch(() => {}),
    5000,
  );
  const report = await browser.evaluate(
    `(async () => {
    const { app } = await import('/src/main.js');
    for (let i = 0; i < 300 && !app.initialized; i++) await new Promise(r => setTimeout(r, 100));
    return (await import('/tests/browser/validate-basics-browser.mjs')).validate(app, { isolationOnly: ${process.env.BASICS_CASE === "isolation"} });
  })()`,
    { timeoutMs: 360000 },
  );
  report.errors = browser.errors;
  if (report.errors.length) throw new Error(report.errors.join("\n"));
  const reportPath =
    process.env.BASICS_CASE === "isolation"
      ? `${session.output}/basics-isolation.json`
      : `${session.output}/basics-validation.json`;
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  await browser.evaluate(`(async () => {
    const { app } = await import('/src/main.js'), t = app.runtime.tutorial;
    await t.action('basics'); t.panel.setXR(true); t.panels.render(performance.now());
    for (let i = 0; i < 40; i++) t.basics.guidance.update(performance.now() + i * 16);
    app.sceneRuntime.render();
  })()`);
  const screenshot = await browser.send("Page.captureScreenshot", { format: "png" });
  await writeFile(`${session.output}/basics.png`, Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (browser) console.error("Browser errors:", browser.errors);
  throw error;
} finally {
  clearInterval(progress);
  await session.close();
}
