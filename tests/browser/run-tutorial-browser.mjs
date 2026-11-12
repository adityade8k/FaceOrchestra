import { withBrowser } from "../../scripts/browser-session.mjs";
const suites = {
  ports: ["validate-port-groups-browser.mjs", "validate"],
  recording: ["validate-looper-recording-browser.mjs", "validateStandalone"],
  radial: ["validate-tutorial-radial-browser.mjs", "validateStandalone"],
  tutorial: ["validate-tutorial-browser.mjs", "validate"],
};
const [file, entry] = suites[process.env.TUTORIAL_TEST || "tutorial"] || suites.tutorial;
await withBrowser(async (browser) => {
  const progress = setInterval(
    () =>
      browser
        .evaluate("globalThis.tutorialTestStage || null")
        .then((stage) => {
          if (stage) console.log(JSON.stringify(stage));
        })
        .catch(() => {}),
    5000,
  );
  try {
    const report = await browser.evaluate(
      `(async()=>{
    const {app}=await import('/src/main.js');
    const report=await (await import('/tests/browser/${file}'))[${JSON.stringify(entry)}](app, { onProgress: stage => globalThis.tutorialTestStage = stage });
    report.manualHonkRegression=await (await import('/tests/browser/validate-manual-honks-browser.mjs')).validate();
    report.presentationRegression=await (await import('/tests/browser/validate-honk-presentation-browser.mjs')).validate();
    return report;
  })()`,
      { timeoutMs: 600000 },
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    clearInterval(progress);
  }
});
