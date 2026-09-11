// Compare unaffected scheduler adapter traces against a separate checkout.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPlaybackFixture } from './looper-playback-fixture.mjs';
async function trace(root, options) {
  const { LooperController } = await import(pathToFileURL(resolve(root, 'src/instruments/looper/LooperController.js')));
  const { HonkContactGraph } = await import(pathToFileURL(resolve(root, 'src/instruments/formations/HonkContactGraph.js')));
  const h = createPlaybackFixture(LooperController, HonkContactGraph, { ...options, trace: true, percussion: true });
  h.start();
  for (let ms = 25; ms <= 2500; ms += 25) {
    h.setTime(ms);
    h.controller.updatePlaybackForLooper(h.looper, ms);
    h.controller.schedulePlaybackAudioForLooper(h.looper, ms);
  }
  h.controller.stopPlayback(h.looper);
  return JSON.parse(JSON.stringify(h.calls));
}
let events = 0;
for (const seconds of [1, 10]) for (const tracks of [1, 8]) for (const componentSize of [1, 8]) {
  const options = { seconds, tracks, componentSize };
  const oldTrace = await trace(process.argv[2], options);
  const newTrace = await trace(process.argv[3] || '.', options);
  assert.deepEqual(newTrace, oldTrace, JSON.stringify(options));
  events += newTrace.length;
}
console.log(`Identical start/update/release/cancel/percussion traces: 8 scenarios, ${events} adapter calls.`);
