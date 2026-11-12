const suites = {
  alfaaz: "./check-alfaaz-browser.mjs",
  nazariya: "./check-nazariya-browser.mjs",
  "note-squares": "./check-note-squares-browser.mjs",
  "rishte-human": "./check-rishte-human-browser.mjs",
  sustain: "./check-sustain-cues-browser.mjs",
  "tu-kisi": "./check-tu-kisi-rail-si-browser.mjs",
  "branch-texture": "./capture/check-branch-texture.mjs",
  "chunked-playback": "./capture/check-chunked-playback.mjs",
  compositions: "./check-compositions-browser.mjs",
  basics: "./run-basics-browser.mjs",
  "basics-finale": "./check-basics-finale-browser.mjs",
  jog: "./capture/check-jog.mjs",
  capture: "./capture/run-browser.mjs",
  "capture-server": "./capture/check-server.mjs",
  "capture-long": "./capture/check-long-editor.mjs",
  "recording-demo": "./check-recording-demo-browser.mjs",
  tutorial: "./run-tutorial-browser.mjs",
  "tutorial-panel": "./check-tutorial-panel-browser.mjs",
  frame: "./check-frame-browser.mjs",
  audit: "./audit-browser.mjs",
  profile: "./run-tutorial-profile.mjs",
  rays: "./check-ray-play-browser.mjs",
  articulation: "./check-honk-articulation-browser.mjs",
  percussion: "./check-percussion-browser.mjs",
  "honk-color": "./check-honk-color-browser.mjs",
};
const browserModules = {
  "manual-honks": ["validate-manual-honks-browser.mjs", "validate"],
  presentation: ["validate-honk-presentation-browser.mjs", "validate"],
  "manual-profile": ["benchmark-manual-honks-browser.mjs", "benchmark"],
};
const [suite, ...args] = process.argv.slice(2);
if (!suites[suite] && !browserModules[suite])
  throw new Error(
    `Choose a browser suite: ${Object.keys({ ...suites, ...browserModules }).join(", ")}`,
  );
process.argv = [...process.argv.slice(0, 2), ...args];
if (browserModules[suite]) {
  const { withBrowser } = await import("../../scripts/browser-session.mjs");
  const [file, entry] = browserModules[suite];
  await withBrowser(async (browser) => {
    const report = await browser.evaluate(
      `(async()=> (await import(${JSON.stringify(`/tests/browser/${file}`)}))[${JSON.stringify(entry)}]())()`,
    );
    console.log(JSON.stringify(report, null, 2));
  });
} else await import(suites[suite]);
