import { withBrowser } from "../../scripts/browser-session.mjs";

await withBrowser(async (browser) => {
  const report = await browser.evaluate(
    `(async () => {
      const { app } = await import('/src/main.js');
      return (await import('/tests/browser/validate-alfaaz-browser.mjs')).validate(app);
    })()`,
    { timeoutMs: 300000 },
  );
  console.log(JSON.stringify(report, null, 2));
});
