// Opt-in deterministic CPU benchmark. Never imported by the application.
// node scripts/benchmark-looper-playback.mjs [repository-root] [repetitions]
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPlaybackFixture } from './looper-playback-fixture.mjs';
const root = resolve(process.argv[2] || '.');
const repetitions = Number(process.argv[3] || 5);
const { LooperController } = await import(pathToFileURL(resolve(root, 'src/instruments/looper/LooperController.js')));
const { HonkContactGraph } = await import(pathToFileURL(resolve(root, 'src/instruments/formations/HonkContactGraph.js')));
const make = (options) => createPlaybackFixture(LooperController, HonkContactGraph, options);
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [];
for (const seconds of [10, 60, 120]) for (const tracks of [1, 8]) for (const componentSize of [1, 8]) {
  const timings = [];
  let operations;
  for (let rep = 0; rep < repetitions; rep += 1) {
    const h = make({ seconds, tracks, componentSize });
    h.start();
    let cpu = 0;
    // Merge 90 Hz presentation and 40 Hz scheduler clocks. First second warms up.
    const ticks = [];
    for (let n = 1; n <= 270; n += 1) ticks.push({ ms: n * 1000 / 90, frame: true });
    for (let n = 1; n <= 120; n += 1) ticks.push({ ms: n * 25, frame: false });
    ticks.sort((a, b) => a.ms - b.ms || Number(b.frame) - Number(a.frame));
    let measured = false;
    for (const { ms, frame } of ticks) {
      if (ms > 1000 && !measured) { h.resetCounts(); measured = true; }
      h.setTime(ms);
      const begin = performance.now();
      if (frame) h.controller.updatePlaybackForLooper(h.looper, ms);
      else h.controller.schedulePlaybackAudioForLooper(h.looper, ms);
      if (ms > 1000) cpu += performance.now() - begin;
    }
    timings.push(cpu / 2);
    operations = { ...h.counts };
    h.controller.stopPlayback(h.looper);
  }
  rows.push({ seconds, tracks, componentSize, cpuMsPerSecond: median(timings), operationsOverTwoSeconds: operations });
}
const burstTimes = [];
let burstCounts;
for (let rep = 0; rep < repetitions; rep += 1) {
  const h = make({ seconds: 1, snapshotMs: 10, noteEndMs: 500, percussion: true });
  h.start(); h.setTime(100); h.controller.schedulePlaybackAudioForLooper(h.looper, 100);
  h.resetCounts(); h.join(); h.setTime(110);
  const start = performance.now(); h.controller.updatePlaybackForLooper(h.looper, 110);
  const joinMs = performance.now() - start;
  const join = { ...h.counts };
  h.resetCounts(); h.split(); h.setTime(115);
  const splitStart = performance.now(); h.controller.updatePlaybackForLooper(h.looper, 115);
  burstTimes.push({ joinMs, splitMs: performance.now() - splitStart });
  burstCounts = { join, split: { ...h.counts } };
  h.controller.stopPlayback(h.looper);
}
console.log(JSON.stringify({ root, repetitions, rows, burst: {
  joinMs: median(burstTimes.map((v) => v.joinMs)), splitMs: median(burstTimes.map((v) => v.splitMs)), ...burstCounts,
} }, null, 2));
