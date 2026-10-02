import { startServer } from "./capture/server.mjs";
import { launchChrome } from "./capture/chrome.mjs";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
const output = process.argv[2] || "test-results/practice-performance.json";
const root = await mkdtemp(join(tmpdir(), "honk-practice-profile-"));
let service, browser;
try {
  service = await startServer({
    host: "127.0.0.1",
    port: 0,
    plain: true,
    dataRoot: root,
  });
  browser = await launchChrome();
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const throttle = Number(process.env.PRACTICE_CPU_RATE || 1);
  await browser.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  await browser.evaluate(
    `(async()=>{const {app}=await import('/src/main.js');while(!app.initialized)await new Promise(r=>setTimeout(r,100));})()`,
  );
  await browser.send("Profiler.enable");
  await browser.send("Profiler.start");
  // Keep profiling code opt-in; the production receiver's static allowlist
  // need not expose diagnostic scripts.
  const source = await readFile(
    new URL("./profile-practice-browser.mjs", import.meta.url),
    "utf8",
  );
  const report = await browser.evaluate(`(async()=>{
    ${source.replace("export async function profile", "async function profile")}
    const {app}=await import('/src/main.js');
    const report=await profile(app,{frames:${Number(process.env.PRACTICE_FRAMES || 360)},scenarios:${JSON.stringify(process.env.PRACTICE_SCENARIOS?.split(",") || null)}});
    const gl=app.runtime.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {...report,environment:{userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}};
  })()`);
  const { profile } = await browser.send("Profiler.stop");
  report.source = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  report.cpuThrottle = throttle;
  report.browserErrors = browser.errors;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  await writeFile(output + ".cpuprofile", JSON.stringify(profile));
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(report.results).map(([name, r]) => [
          name,
          {
            cpuP95: r.costsMs.frameCPU.p95,
            renderP95: r.costsMs.renderCPU.p95,
            frameP99: r.frameIntervalMs.p99,
            over25ms: r.over25ms,
            mutations: r.keyboardMutations,
            labelsTotal: r.costsMs.labelBounds?.total,
            cuesTotal: r.costsMs.timingCues?.total,
          },
        ]),
      ),
    ),
  );
  if (browser.errors.length) throw new Error(browser.errors.join("\n"));
} finally {
  await browser?.close();
  await service?.close();
  await rm(root, { recursive: true, force: true });
}
