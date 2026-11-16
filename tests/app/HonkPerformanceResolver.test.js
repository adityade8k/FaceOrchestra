import test from "node:test";
import assert from "node:assert/strict";
import { HonkPerformanceResolver } from "../../src/app/runtime/HonkPerformanceResolver.js";
import { HonkPerformanceState } from "../../src/instruments/honk/HonkPerformanceState.js";

function fixture(count = 1) {
  const calls = { morphs: 0, controls: 0, colliders: 0, scales: 0 };
  const honks = Array.from({ length: count }, () => {
    const performance = new HonkPerformanceState();
    return {
      kind: "honk",
      performance,
      hornHolders: new Set(),
      getLivePerformanceState: () => performance.getLiveSnapshot(),
      applyMorphPerformanceState: () => {
        calls.morphs++;
      },
    };
  });
  const resolver = new HonkPerformanceResolver({
    applyMorphState: () => {
      calls.controls++;
    },
    updateColliders: () => {
      calls.colliders++;
    },
    applyScale: () => {
      calls.scales++;
    },
  });
  return { resolver, honks, calls };
}

test("settled scene skips morph/control/collider work while transform-dependent scale stays live", () => {
  const { resolver, honks, calls } = fixture(128);
  resolver.update(honks, 0);
  for (let frame = 1; frame <= 90; frame++) {
    for (const h of honks) h.performance.setLiveState({ squeeze: 0, bend: 0 });
    resolver.update(honks, (frame * 1000) / 90);
  }
  assert.deepEqual(resolver.metrics, { resolved: 0, skipped: 128 });
  assert.equal(calls.morphs, 128);
  assert.equal(calls.controls, 128);
  assert.equal(calls.colliders, 128);
  assert.equal(calls.scales, 128 * 91);
});

test("first note after idle keeps normal attack smoothing, release settles, and tuning wakes one Honk", () => {
  const { resolver, honks } = fixture(32),
    h = honks[0];
  for (let frame = 0; frame <= 60; frame++) resolver.update(honks, (frame * 1000) / 60);
  h.performance.setLiveState({ squeeze: 1, bend: 0.4 });
  resolver.update(honks, 1000 + 1000 / 60);
  assert.ok(h.processedLivePerformance.squeeze > 0 && h.processedLivePerformance.squeeze < 0.5);
  assert.deepEqual(resolver.metrics, { resolved: 1, skipped: 31 });
  h.performance.setLiveState({ squeeze: 0, bend: 0 });
  for (let frame = 62; frame <= 240; frame++) resolver.update(honks, (frame * 1000) / 60);
  assert.equal(h.processedLivePerformance.squeeze, 0);
  assert.equal(h.processedLivePerformance.bend, 0);
  assert.equal(h.honkPresentation.squeeze, 0);
  assert.deepEqual(resolver.metrics, { resolved: 0, skipped: 32 });
  h.performance.setLiveState({ earLeft: 0.75, vowel: "O" });
  resolver.update(honks, 4016);
  assert.equal(h.performance.resolved.earLeft, 0.75);
  assert.equal(h.performance.resolved.vowel, "O");
  assert.deepEqual(resolver.metrics, { resolved: 1, skipped: 31 });
});

test("existing automation updates, layer priority, removal and presentation reset invalidate resolution", () => {
  const { resolver, honks } = fixture(),
    h = honks[0];
  resolver.update(honks, 0);
  h.performance.setAutomationLayer("a", { squeeze: 1, earLeft: 0.1 });
  resolver.update(honks, 16);
  assert.equal(h.hornSqueezeValue, 1);
  h.performance.setAutomationLayer("a", { squeeze: 0.5, earLeft: 0.2 });
  resolver.update(honks, 32);
  assert.equal(h.hornSqueezeValue, 0.5);
  assert.equal(h.performance.resolved.earLeft, 0.2);
  h.performance.setAutomationLayer("b", { earLeft: 0.9 });
  resolver.update(honks, 48);
  assert.equal(h.performance.resolved.earLeft, 0.9);
  h.performance.setAutomationLayer("a", { squeeze: 0.5, earLeft: 0.2 });
  resolver.update(honks, 64);
  assert.equal(h.performance.resolved.earLeft, 0.2);
  h.performance.clearAutomationLayers();
  resolver.update(honks, 80);
  assert.equal(h.hornSqueezeValue, 0);
  assert.ok(h.honkPresentation.squeeze > 0, "removed layer retains visual release easing");
  for (let frame = 6; frame < 160; frame++) resolver.update(honks, frame * 16);
  h.presentationRevision = 1;
  resolver.update(honks, 2560);
  assert.equal(resolver.metrics.resolved, 1);
});
