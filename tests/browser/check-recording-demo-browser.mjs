import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { withBrowser } from "../../scripts/browser-session.mjs";

const ids = process.argv.slice(2);
await withBrowser(async (browser, service, session) => {
  // The assertions inspect recorded geometry and PCM, not screenshot resolution.
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: 800,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const id of ids.length
    ? ids
    : [
        "virag-2-jog-study",
        "kuch-to-hua-hai",
        "rishte-naate",
        "tu-kisi-rail-si",
        "nazariya-honk-bends",
      ]) {
    console.log(`Recording complete demonstration: ${id}`);
    const progress = setInterval(
      () =>
        browser
          .evaluate("globalThis.recordingDemoProgress || null")
          .then((value) => {
            if (value) console.log(JSON.stringify(value));
          })
          .catch(() => {}),
      10000,
    );
    let report;
    try {
      report = await browser.evaluate(
        `(async()=>{
      const { app } = await import('/src/main.js');
      return (await import('/tests/browser/validate-recording-demo-browser.mjs')).validate(app, ${JSON.stringify(id)});
    })()`,
        { timeoutMs: 300000 },
      );
    } finally {
      clearInterval(progress);
    }
    const events = (await readFile(join(session.dataRoot, report.takeId, "events.ndjson"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    const nodes = events.filter((event) => event.data.kind === "node").map((event) => event.data);
    assert.ok(nodes.length > 0);
    assert.ok(
      nodes.every((node) => ["instruments", "labels", "wires"].includes(node.layer)),
      "Stored take includes helper roots",
    );
    assert.ok(
      nodes.every(
        (node) => !/placement frame|Tutorial timing|Tutorial.*square|bend gauge/i.test(node.name),
      ),
      "Stored take includes helper geometry",
    );
    let samples = 0;
    for await (const line of createInterface({
      input: createReadStream(join(session.dataRoot, report.takeId, "samples.ndjson")),
      crlfDelay: Infinity,
    })) {
      const { data } = JSON.parse(line);
      assert.deepEqual(data.xr.viewer.p, [0, 1.6, 0]);
      assert.deepEqual(
        data.xr.controllers.map((c) => c.handedness),
        ["left", "right"],
      );
      assert.ok(
        data.xr.controllers.every(
          (c) => c.grip && c.ray && c.profiles[0] === "physical-pose-fixture",
        ),
      );
      samples++;
    }
    assert.ok(samples > 100);
    const take = (await service.store.list()).find((take) => take.id === report.takeId);
    const pcm = await readFile(join(session.dataRoot, report.takeId, "audio.pcm"));
    let peak = 0;
    for (
      let i = Math.ceil((take.performance.performanceStart + 1) * take.audio.sampleRate) * 4;
      i < pcm.length;
      i += 2
    )
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    assert.ok(peak > 100, "Saved demonstration has no performance audio");
    console.log(
      JSON.stringify({
        ...report,
        nodes: nodes.length,
        samples,
        peak,
        helperDataAbsent: true,
        physicalPosesPreserved: true,
      }),
    );
  }
});
