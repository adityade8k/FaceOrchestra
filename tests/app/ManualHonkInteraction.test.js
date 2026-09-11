import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, flushAudio } from '../support/manualHonkFixture.mjs';
import { HONK_INTERACTION_ROLES } from '../../src/instruments/honk/HonkInstrument.js';

for (const locked of [false, true]) {
  for (const [role, allowed] of Object.values(HONK_INTERACTION_ROLES).map(role => [role, role === 'honk.squeeze'])) {
    test(`${locked ? 'locked' : 'unlocked'} ${role}: trigger-begin and held frames respect sphere eligibility`, async () => {
      const f = fixture({ locked });
      const target = f.honks[0].getTarget(role);
      f.press(target);
      const state = f.host.controllerStates.get(f.controllers[0]);
      assert.equal(Boolean(state.raySqueezeInstrumentState), allowed);
      f.frame(); await flushAudio();
      assert.equal(f.audio.voices.size, allowed ? 1 : 0);
      if (locked) assert.equal(f.counters.morphEdits, 0);
      f.release();
      // Exercise acquisition in updateHorn alone, after pressing empty space.
      f.press(null); f.controllers[0].hit = target;
      f.controllers[0].lockedHit = locked ? f.honks[0] : null;
      f.frame(); await flushAudio();
      assert.equal(f.audio.voices.size, allowed ? 1 : 0);
      f.release();
    });
  }
}

test('capture survives off-sphere hold/roll, releases owned voices, and cannot authorize another press', async () => {
  const f = fixture({ count: 3, locked: true });
  f.press(); f.frame(); await flushAudio();
  const controller = f.controllers[0];
  const state = f.host.controllerStates.get(controller);
  controller.hit = null; controller.lockedHit = null; controller.roll = 0.5;
  for (let i = 0; i < 4; i++) f.frame();
  assert.equal(f.audio.voices.size, 3);
  assert.ok(f.honks.every(h => h.getLivePerformanceState().bend === 0.5));
  f.release();
  assert.equal(state.raySqueezeTarget, null);
  assert.equal(state.raySqueezeInstrumentState, null);
  assert.equal(f.audio.voices.size, 0);
  assert.ok([...f.audio.releasingVoices.values()].every(set => [...set].every(v =>
    v.releaseState.silentAt > v.releaseState.releaseStart)));
  f.press(f.honks[0].getTarget('honk.body')); f.frame(); await flushAudio();
  assert.equal(f.audio.voices.size, 0);
});

test('gripping a frozen honk/group does not authorize Trigger; grip routing remains available', async () => {
  const f = fixture({ count: 3, locked: true });
  const controller = f.controllers[0];
  const state = f.host.controllerStates.get(controller);
  state.gripHeld = true; state.gripInstrumentState = f.honks[0];
  state.gripSourceInstrumentState = f.honks[0];
  f.press(f.honks[0].getTarget('honk.body'));
  f.host.handleGripBeginIntent(controller);
  f.frame(); await flushAudio();
  assert.equal(f.counters.gripBegins, 1);
  assert.equal(f.audio.voices.size, 0);
  controller.hit = f.honks[0].squeezeCollider;
  f.frame(); await flushAudio();
  assert.equal(f.audio.voices.size, 3);
  f.release();
});

for (const invalidate of ['hidden', 'hidden-parent', 'detached-root', 'detached-target', 'unregistered', 'removed', 'deleted']) {
  test(`captured ${invalidate} honk releases the entire owned chord and rejects stale geometry`, async () => {
    const f = fixture({ count: 3, locked: true });
    f.press(); f.frame(); await flushAudio();
    const h = f.honks[0];
    const sphere = h.squeezeCollider;
    if (invalidate === 'hidden') h.root.visible = false;
    if (invalidate === 'hidden-parent') h.root.parent.visible = false;
    if (invalidate === 'detached-root') h.root.parent = null;
    if (invalidate === 'detached-target') sphere.parent = null;
    if (invalidate === 'unregistered') h.unregisterInteractionTarget(sphere);
    if (invalidate === 'removed') f.host.instrumentRegistry.remove(h, { dispose: false });
    if (invalidate === 'deleted') f.host.deleteInstrument(h);
    f.frame(); await flushAudio();
    assert.equal(f.audio.voices.size, 0);
    assert.equal(f.host.controllerStates.get(f.controllers[0]).raySqueezeTarget, null);
    f.release(); f.press(sphere); f.frame(); await flushAudio();
    assert.equal(f.audio.voices.size, 0);
  });
}

test('lock/unlock during a gesture preserves capture and bend; locking cancels a morph drag', async () => {
  const f = fixture(); f.press(); f.frame(); await flushAudio();
  const initial = f.audio.voices.get('left:h0');
  for (const locked of [true, false, true]) {
    f.honks[0].locked = locked; f.controllers[0].hit = f.honks[0].getTarget('honk.mouth');
    f.frame(); await flushAudio(); assert.equal(f.audio.voices.get('left:h0'), initial);
  }
  f.release(); f.honks[0].locked = false;
  f.controllers[0].position = { y: 0 };
  f.press(f.honks[0].getTarget('honk.nose'));
  assert.equal(f.host.controllerStates.get(f.controllers[0]).activeTriggerInteraction.type, 'verticalDragMorph');
  f.honks[0].locked = true; f.host.updateTriggerInteraction();
  assert.equal(f.host.controllerStates.get(f.controllers[0]).activeTriggerInteraction, null);
});

test('two controllers own independent generations and cannot inherit each other’s captured sphere', async () => {
  const f = fixture({ count: 3, locked: true });
  f.press(); f.press(f.honks[2].squeezeCollider, f.controllers[1]);
  f.frame(); await flushAudio(); assert.equal(f.audio.voices.size, 6);
  f.release(); assert.equal(f.audio.voices.size, 3);
  f.press(f.honks[0].getTarget('honk.body')); f.frame(); await flushAudio();
  assert.equal(f.audio.voices.size, 3);
  assert.ok([...f.audio.voices.keys()].every(id => id.startsWith('right:')));
  f.release(f.controllers[1]); assert.equal(f.audio.voices.size, 0);
});

test('frozen hover offers the sphere and preserves body grip feedback without advertising morph edits', () => {
  const f = fixture({ locked: true });
  const controller = f.controllers[0]; const state = f.host.controllerStates.get(controller);
  for (const role of ['honk.squeeze', 'honk.mouth', 'honk.body']) {
    controller.hit = f.honks[0].getTarget(role); controller.lockedHit = f.honks[0];
    f.host.updateRaycastHover();
    assert.equal(state.hoveredTarget, role === 'honk.mouth' ? null : controller.hit);
    assert.equal(state.raycastContactTarget, role === 'honk.squeeze' ? controller.hit : f.honks[0].getTarget('honk.body'));
  }
});

test('a body renamed HIT_horn or an uncaptured legacy hold cannot grant squeeze ownership', async () => {
  const f = fixture({ locked: true }); const h = f.honks[0];
  const body = h.getTarget('honk.body'); body.name = 'HIT_horn';
  f.press(body); f.frame(); await flushAudio(); assert.equal(f.audio.voices.size, 0);
  f.host.controllerStates.get(f.controllers[0]).activeTriggerInteraction = {
    type: 'holdSqueeze', instrumentState: h, target: body, voiceId: 'forged', activeVoiceIds: new Set(),
  };
  f.frame(); await flushAudio(); assert.equal(f.audio.voices.size, 0);
});

for (const kind of ['looper', 'metronome']) test(`locked ${kind} body routing keeps its non-squeeze behavior`, () => {
  const f = fixture(); let toggles = 0;
  f.host.toggleLockedLooperPlayback = () => { toggles++; };
  f.controllers[0].lockedHit = { kind, root: { visible: true } };
  f.host.handleTriggerBeginIntent(f.controllers[0]);
  assert.equal(toggles, kind === 'looper' ? 1 : 0);
  assert.equal(f.host.activeInstrumentState.kind, kind);
  assert.equal(f.counters.starts, 0);
});
