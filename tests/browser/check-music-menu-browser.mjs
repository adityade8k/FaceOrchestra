import { withBrowser } from "../../scripts/browser-session.mjs";
await withBrowser(async (browser) => {
  const report = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    return (await import('/tests/browser/validate-music-menu-browser.mjs')).validate(app);
  })()`);
  console.log(JSON.stringify(report, null, 2));
});
