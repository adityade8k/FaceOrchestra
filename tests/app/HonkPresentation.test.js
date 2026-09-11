import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceHonkPresentation } from '../../src/app/runtime/HonkPerformanceSampling.js';
import { HonkInstrument } from '../../src/instruments/honk/HonkInstrument.js';
import { HonkPerformanceState } from '../../src/instruments/honk/HonkPerformanceState.js';

const runtimeURL = new URL('../../src/app/runtime/HonkPerformanceRuntime.js', import.meta.url);
let source = await readFile(runtimeURL, 'utf8');
source = source.replace('import * as THREE from "three";', `const THREE = {
  Quaternion: class {}, Euler: class {}, MathUtils: { clamp: (v, a, b) => Math.min(Math.max(v, a), b), degToRad: (v) => v * Math.PI / 180 }
};`);
source = source.replace(/from "(\.\.?\/[^\"]+)"/g, (_, path) => `from "${new URL(path, runtimeURL).href}"`);
const { HonkPerformanceRuntimeMethods } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function settled() {
  return { squeeze: 1, bend: 0.5, targetSqueeze: 1, targetBend: 0.5, automationRevision: 1 };
}

test('visual release follows equal elapsed time at XR rates and through a dropped frame', () => {
  for (const hz of [60, 72, 90, 120]) {
    let state = settled();
    const end = 100;
    let time = 0;
    while (time < end - 1e-9) {
      const dt = Math.min(1000 / hz, end - time);
      state = advanceHonkPresentation(state, { squeeze: 0, bend: 0 }, {}, 1, dt);
      time += dt;
    }
    assert.ok(Math.abs(state.squeeze - 0.82 ** 6) < 1e-12);
    assert.ok(Math.abs(state.bend - 0.5 * 0.82 ** 6) < 1e-12);
  }
  const dropped = advanceHonkPresentation(settled(), { squeeze: 0, bend: 0 }, {}, 1, 100);
  assert.ok(Math.abs(dropped.squeeze - 0.82 ** 6) < 1e-12);
});

test('continuous recorded gestures and processed live input receive no second filter', () => {
  let state = settled();
  for (let i = 1; i <= 8; i += 1) {
    const target = { squeeze: 1 - i * 0.05, bend: 0.5 - i * 0.02 };
    state = advanceHonkPresentation(state, target, {}, 1, 1000 / 90);
    assert.equal(state.squeeze, target.squeeze);
    assert.equal(state.bend, target.bend);
  }
  state = null;
  for (const squeeze of [0.18, 0.3276, 0.448632, 0.36787824]) {
    const live = { squeeze, bend: squeeze / 2 };
    state = advanceHonkPresentation(state, live, live, 0, 1000 / 60);
    assert.equal(state.squeeze, squeeze);
    assert.equal(state.bend, squeeze / 2);
  }
});

test('rapid attacks at loop seams remain distinct from the preceding eased release', () => {
  let state = advanceHonkPresentation(settled(), { squeeze: 0, bend: 0 }, {}, 1, 1000 / 60);
  assert.ok(Math.abs(state.squeeze - 0.82) < 1e-12);
  state = advanceHonkPresentation(state, { squeeze: 1, bend: -0.5 }, {}, 1, 1000 / 60);
  assert.equal(state.squeeze, 1);
  assert.equal(state.bend, -0.5);
});

test('actual runtime keeps automation release/removal separate from capture, collider bend and root pulse', () => {
  const performance = new HonkPerformanceState();
  let morph;
  let pulse;
  const honk = {
    kind: 'honk', performance, honkPresentation: settled(), hornSqueezeValue: 1, bendValue: 0.5,
    processedLivePerformance: { squeeze: 0, bend: 0 }, lastHonkPerformanceUpdateMs: 0,
    getLivePerformanceState: () => performance.getLiveSnapshot(),
    applyMorphPerformanceState: (state) => { morph = state; },
    bendAlignedColliderGroup: { rotation: { z: 0 } },
  };
  performance.setAutomationLayer('loop', { squeeze: 1, bend: 0.5 });
  honk.honkPresentation.automationRevision = performance.automationRevision;
  performance.clearAutomationLayer('loop');
  const runtime = Object.assign({ instrumentStates: [honk], applyResolvedHonkMorphState() {},
    applyInstrumentVisualScale(_honk, value) { pulse = value; },
  }, HonkPerformanceRuntimeMethods);
  // Stub unrelated presentation work after assigning the runtime methods.
  runtime.applyResolvedHonkMorphState = () => {};
  runtime.applyResolvedHonkPerformanceStates(1000 / 60);
  assert.ok(Math.abs(morph.squeeze - 0.82) < 1e-12);
  assert.ok(Math.abs(morph.bend - 0.41) < 1e-12);
  assert.equal(honk.hornSqueezeValue, 0);
  assert.equal(honk.bendValue, 0);
  assert.ok(honk.bendAlignedColliderGroup.rotation.z === 0);
  assert.equal(pulse, 1);
  assert.equal(honk.processedLivePerformance.squeeze, 0);
  assert.equal(performance.resolved.squeeze, 0);
  performance.setLiveState({ squeeze: 1, bend: 0.2 });
  runtime.applyResolvedHonkPerformanceStates(2000 / 60);
  assert.ok(honk.processedLivePerformance.squeeze > 0);
  assert.equal(performance.resolved.squeeze, honk.processedLivePerformance.squeeze);
});

test('interaction pose restores authored visual scale and morphs even if a raycast throws', () => {
  const morph = { squeeze: 0.82, bend: 0.41 };
  const scale = { x: 1.0287, setScalar(v) { this.x = v; } };
  const honk = {
    honkPresentation: { ...morph }, honkVisualRoot: { scale }, hornSqueezeValue: 0, bendValue: 0,
    root: { updateMatrixWorld() {} },
    morphs: { setSqueeze(v) { morph.squeeze = v; }, setBend(v) { morph.bend = v; } },
  };
  assert.throws(() => HonkInstrument.prototype.withInteractionPose.call(honk, () => {
    assert.equal(scale.x, 1);
    assert.deepEqual(morph, { squeeze: 0, bend: 0 });
    throw Error('raycast');
  }), /raycast/);
  assert.equal(scale.x, 1.0287);
  assert.deepEqual(morph, honk.honkPresentation);
  assert.equal(honk.interactionPoseActive, false);
});
