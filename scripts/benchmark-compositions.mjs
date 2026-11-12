import { compositionRegistry } from "../src/compositions/CompositionRegistry.js";
import { fixedBackingPlan } from "../src/compositions/FixedBackingPlan.js";
import { FixedBackingEnsemble } from "../src/tutorial/FixedBackingEnsemble.js";
import { backingFixture } from "../tests/helpers/backingFixture.js";
import { cueCanvas } from "../tests/helpers/cueCanvas.js";
const sample = (fn, count = 300, warmup = 20) => {
  for (let i = 0; i < warmup; i++) fn(i);
  const values = Array.from({ length: count }, (_, i) => {
    const start = performance.now();
    fn(i);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return { medianMs: values[Math.floor(count * 0.5)], p95Ms: values[Math.floor(count * 0.95)] };
};
globalThis.document = { createElement: cueCanvas };
const report = {
  environment: process.version,
  method:
    "Node CPU timings; real conductor and Looper methods with fixture audio and canvas adapters. No GPU or headset measurements.",
  songs: {},
};
for (const id of ["kuch-to-hua-hai", "rishte-naate"]) {
  const { definition } = await compositionRegistry.load(id);
  const coldStart = performance.now();
  const plan = fixedBackingPlan(definition);
  const coldMs = performance.now() - coldStart;
  const f = backingFixture(definition),
    e = new FixedBackingEnsemble(f, definition);
  e.prepare();
  const entry = {
    bytes: Buffer.byteLength(JSON.stringify(definition)),
    coldPlanMs: coldMs,
    plan: sample(() => fixedBackingPlan(definition), 30, 5),
    sequenceKeyBytes: [...plan.sequences.keys()].reduce((n, k) => n + Buffer.byteLength(k), 0),
    loopers: e.loopers.length,
  };
  entry.identity = sample(() => {
    for (const h of e.loopers) e.identity(h);
  });
  entry.hands = sample((i) => e.hands.update(definition.score.events, (i % 100) / 10));
  e.schedule({
    countAt: 0,
    beatZero: 0,
    wallNow: 0,
    audioNow: 0,
    bpm: definition.bpm,
    startBeat: 0,
    endBeat: definition.score.durationBeats,
  });
  entry.update = sample((i) => e.update(i / 100));
  e.dispose();
  report.songs[id] = entry;
}
console.log(JSON.stringify(report, null, 2));
