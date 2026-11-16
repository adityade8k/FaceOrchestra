import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withBrowser } from "../../scripts/browser-session.mjs";
import { browserSuites, planBrowserSuites } from "./suites.mjs";

export async function runBrowserSuites(requested, { args = [] } = {}) {
  const timings = [];
  for (const id of planBrowserSuites(requested)) {
    const suite = browserSuites[id],
      start = performance.now();
    console.log(`Checking ${id}: ${suite.coverage}`);
    try {
      if (suite.kind === "script") {
        await new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [fileURLToPath(new URL(suite.file, import.meta.url)), ...args],
            { stdio: "inherit" },
          );
          child.once("error", reject);
          child.once("exit", (code, signal) =>
            code === 0 ? resolve() : reject(new Error(`${id} failed (${signal || code})`)),
          );
        });
      } else {
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
              const validator=await import(${JSON.stringify(`/tests/browser/${suite.file}`)});
              return validator[${JSON.stringify(suite.entry)}](${suite.app ? "app, {onProgress: stage => globalThis.tutorialTestStage = stage}" : ""});
            })()`,
              { timeoutMs: suite.timeoutMs },
            );
            console.log(JSON.stringify(report, null, 2));
          } finally {
            clearInterval(progress);
          }
        });
      }
    } finally {
      const elapsedMs = Math.round(performance.now() - start);
      timings.push({ suite: id, elapsedMs });
      console.log(`${id}: ${elapsedMs} ms`);
    }
  }
  return timings;
}
