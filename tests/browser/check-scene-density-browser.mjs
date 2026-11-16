import { withBrowser } from "../../scripts/browser-session.mjs";
await withBrowser(async (browser) => {
  const report = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    const {benchmark}=await import('/tests/browser/benchmark-scene-density-browser.mjs');
    return benchmark(app);
  })()`);
  console.log(JSON.stringify(report, null, 2));
});
