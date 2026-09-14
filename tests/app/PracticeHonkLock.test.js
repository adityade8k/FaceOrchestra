import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, flushAudio } from '../support/manualHonkFixture.mjs';
import { RelationshipRuntimeMethods } from '../../src/app/runtime/RelationshipRuntime.js';
import { ChordFormationService } from '../../src/instruments/formations/ChordFormationService.js';
import { HonkLockService } from '../../src/instruments/formations/HonkLockService.js';
import { XRIntentMapper } from '../../src/xr/XRIntentMapper.js';

function practiceFixture(options) {
  const f = fixture(options), { host, controllers } = f;
  Object.assign(host, RelationshipRuntimeMethods, {
    sessionMode: 'practice',
    updateLockVisual(honk) { honk.lockedTextureApplied = honk.locked; },
  });
  host.honkLockService = new HonkLockService({
    instrumentRegistry: host.instrumentRegistry,
    formationService: new ChordFormationService({ contactGraph: host.honkContactGraph }),
  });
  host.interactionCoordinator.intentMapper = new XRIntentMapper();
  host.interactionCoordinator.handlers.onContextSecondary = c => host.handleContextSecondaryIntent(c);
  f.toggle = (honk = f.honks[0]) => {
    const controller = controllers[1];
    controller.hit = honk.squeezeCollider;
    for (const pressed of [true, false]) host.interactionCoordinator.receiveInput({
      type: 'button.transition', controller, handedness: 'right', button: 'secondary', pressed,
    });
  };
  return f;
}

test('Right B repeatedly locks and unlocks a separate practice Honk without creating a chord', () => {
  const f = practiceFixture(), h = f.honks[0];
  const defaults = structuredClone(h.serialize().performanceDefaults);
  for (const locked of [true, false, true, false]) {
    f.toggle();
    assert.equal(h.locked, locked);
    assert.equal(h.lockedTextureApplied, locked);
    assert.equal(f.host.honkLockService.getGroupForMember(h.id), null);
    f.frame();
    assert.equal(h.locked, locked, 'performance updates respect the selected lock state');
    assert.deepEqual(h.serialize().performanceDefaults, defaults);
  }
});

test('a practice lock preserves squeeze sound and suppresses body and morph-target sound', async () => {
  const f = practiceFixture();
  f.toggle();
  for (const role of ['honk.body', 'honk.mouth', 'honk.nose']) {
    f.press(f.honks[0].getTarget(role)); f.frame(); await flushAudio();
    assert.equal(f.audio.voices.size, 0, role);
    assert.equal(f.counters.morphEdits, 0, 'locked morphs cannot be edited');
    f.release();
  }
  f.press(); f.frame(); await flushAudio();
  assert.equal(f.audio.voices.size, 1);
  f.release();
  f.toggle();
  f.press(f.honks[0].getTarget('honk.mouth'));
  assert.equal(f.counters.morphEdits, 1, 'unlock restores editing');
  f.release();
});

test('Practice still locks and unlocks the whole touching chord through the existing service', () => {
  const f = practiceFixture({ count: 3 });
  for (const locked of [true, false, true, false]) {
    f.toggle(f.honks[1]);
    assert.ok(f.honks.every(h => h.locked === locked && h.lockedTextureApplied === locked));
    const group = f.host.honkLockService.getGroupForMember(f.honks[1].id);
    assert.equal(group?.size || 0, locked ? 3 : 0);
    if (group) assert.ok(f.honks.every(h => f.host.honkLockService.getGroupForMember(h.id) === group));
  }
});

test('Practice locking ignores previews and hidden Honks; free-play locking keeps its existing scope', () => {
  const f = practiceFixture(), h = f.honks[0];
  f.host.pendingSpawnPlacement = {};
  f.toggle(); assert.equal(h.locked, false);
  f.host.pendingSpawnPlacement = null;
  h.pendingPlacement = true;
  f.toggle(); assert.equal(h.locked, false);
  h.pendingPlacement = false;
  h.root.visible = false;
  f.toggle(); assert.equal(h.locked, false);
  h.root.visible = true;
  f.host.sessionMode = 'play';
  f.toggle(); assert.equal(h.locked, false);
  const chord = practiceFixture({ count: 3 });
  chord.host.sessionMode = 'play';
  chord.toggle(); assert.ok(chord.honks.every(h => h.locked));
  chord.toggle(); assert.ok(chord.honks.every(h => !h.locked));
});
