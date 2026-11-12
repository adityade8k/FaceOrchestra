import { withBrowser } from "../../scripts/browser-session.mjs";
await withBrowser(async (browser) => {
  const progress = setInterval(
    () =>
      browser
        .evaluate("globalThis.finaleTestStage || null")
        .then((stage) => stage && console.log(stage))
        .catch(() => {}),
    10000,
  );
  try {
    const report = await browser.evaluate(
      `(async()=>{
      const {app}=await import('/src/main.js');
      const {validate}=await import('/tests/browser/validate-basics-finale-browser.mjs');
      return validate(app,{onProgress:stage=>globalThis.finaleTestStage=stage});
    })()`,
      { timeoutMs: 240000 },
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    clearInterval(progress);
  }
});
