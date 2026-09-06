import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the frame captures looper input after current Honk intent is resolved", () => {
  const source = readFileSync(new URL("../../src/app/FaceOrchestraApp.js", import.meta.url), "utf8");
  const performancePhase = source.slice(
    source.indexOf('this.frameScheduler.add("PERFORMANCE"'),
    source.indexOf('this.frameScheduler.add("PRESENTATION"'),
  );
  assert.ok(performancePhase.indexOf("runtime.updateHorn") >= 0);
  assert.ok(
    performancePhase.indexOf("runtime.updateLooperRecordings") >
      performancePhase.indexOf("runtime.updateHorn"),
  );
});
