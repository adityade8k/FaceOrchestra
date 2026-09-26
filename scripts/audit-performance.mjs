import { HonkContactSystem } from "../src/instruments/formations/HonkContactSystem.js";
import { writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { cpus, platform, release } from "node:os";
import { execFileSync } from "node:child_process";
const baselineRoot = await mkdtemp(join(tmpdir(), "honk-baseline-contact-"));
await writeFile(join(baselineRoot, "package.json"), '{"type":"module"}');
for (const path of [
  "src/instruments/formations/HonkContactSystem.js",
  "src/instruments/formations/HonkContactGraph.js",
  "src/config/formations.js",
  "src/instruments/core/capabilities.js",
]) {
  await mkdir(dirname(join(baselineRoot, path)), { recursive: true });
  await writeFile(
    join(baselineRoot, path),
    execFileSync("git", ["show", `HEAD:${path}`]),
  );
}
const { HonkContactSystem: OriginalContactSystem } = await import(
  pathToFileURL(
    join(baselineRoot, "src/instruments/formations/HonkContactSystem.js"),
  )
);
const scenarios = [];
for (const count of [0, 3, 10, 30, 60, 100, 200]) {
  const honks = Array.from({ length: count }, (_, i) => ({
    id: `h${i}`,
    kind: "honk",
    squeezeColliderSphere: { center: [i * 0.8, 0, 0], radius: 0.25 },
  }));
  const row = {
    count,
    distribution: "separated row, radius .25 m, spacing .8 m",
  };
  for (const broadPhase of [false, true]) {
    const system = broadPhase
        ? new HonkContactSystem()
        : new OriginalContactSystem(),
      times = [];
    for (let frame = 0; frame < 1100; frame++) {
      const start = performance.now();
      system.update(honks);
      const ms = performance.now() - start;
      if (frame >= 100) times.push(ms);
    }
    times.sort((a, b) => a - b);
    row[broadPhase ? "sweep" : "originalCommit"] = {
      p50: times[500],
      p95: times[950],
      p99: times[990],
      pairMeasurements: broadPhase
        ? system.measurements
        : (count * (count - 1)) / 2,
      retainedPairs: system.pairStates.size,
    };
  }
  scenarios.push(row);
}
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirtyImplementation: true,
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpu: cpus()[0].model,
  },
  units: "milliseconds",
  samples: 1000,
  refreshRate: null,
  activeVoices: 0,
  capture: false,
  rendering: false,
  scenarios,
};
await writeFile(
  "docs/audits/contact-performance.json",
  JSON.stringify(report, null, 2),
);
await rm(baselineRoot, { recursive: true, force: true });
console.log(JSON.stringify(scenarios));
