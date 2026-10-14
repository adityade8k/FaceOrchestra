import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BendGauge } from '../../src/tutorial/BendGauge.js';
import { bendGaugeState } from '../../src/tutorial/bendGaugeState.js';
import { observeBendGesture } from '../../src/tutorial/observeBendGesture.js';
import { cueCanvas } from '../helpers/cueCanvas.js';
const event = {midi:60,beat:4,beats:4,bend:[{fraction:0,semitones:0},{fraction:.2,semitones:0},{fraction:.8,semitones:2},{fraction:1,semitones:2}]};
for (const hand of ["left", "right"])
  test(`${hand} gauge reads only the correct current processed-live owner`, () => {
    const c = new THREE.Group();
    c.userData.handedness = hand;
    const h = {
      id: "target",
      root: { visible: true },
      getProcessedLivePerformanceState: () => ({ bend: 0.25 }),
      hasAudioVoice: () => true,
    };
    const gesture = {
      role: "lead-64",
      targetId: h.id,
      origin: "learner",
      id: "g",
    };
    const input = { trigger: true, raySqueezeInstrumentState: h };
    const a = {
      ids: (role) => (role === gesture.role ? [h.id] : []),
      gestures: new Map([[c, gesture]]),
      r: {
        controllerStates: new Map([[c, input]]),
        getControllerVoiceId: () => hand,
        getInstrumentVoiceId: () => hand,
      },
    };
    assert.equal(observeBendGesture(a, "lead-64", "practice").semitones, 1);
    assert.equal(observeBendGesture(a, "lead-67", "practice"), null);
    input.trigger = false;
    assert.equal(observeBendGesture(a, "lead-64", "practice"), null);
    input.trigger = true;
    gesture.origin = "demonstration";
    assert.equal(observeBendGesture(a, "lead-64", "practice"), null);
    assert.equal(
      observeBendGesture(a, "lead-64", "demonstration").origin,
      "demonstration",
    );
    gesture.origin = "learner";
    a.gestures.set(new THREE.Group(), { ...gesture });
    assert.equal(observeBendGesture(a, "lead-64", "practice"), null);
    a.gestures = new Map([
      [c, gesture],
      [new THREE.Group(), { targetId: "other", memberIds: [h.id, "other"] }],
    ]);
    assert.equal(
      observeBendGesture(a, "lead-64", "practice"),
      null,
      "Another controller in a touching chain must not drive the gauge",
    );
  });

test("radial presentation reuses its objects, keeps matching markers distinct, and disposes every root", () => {
  const scene = new THREE.Scene(),
    g = new BendGauge(scene, cueCanvas),
    e = event;
  const ids = () => {
    const values = [];
    g.root.traverse((n) =>
      values.push(n.uuid, n.geometry?.uuid, n.material?.uuid),
    );
    return values;
  };
  const before = ids(),
    state = bendGaugeState(e, 1, { semitones: 2 }),
    position = new THREE.Vector3(3, 2, 1),
    rotation = new THREE.Quaternion();
  g.update(state, position, 0.2, rotation, 1, null, 0);
  const version = g.texture.version;
  for (let now = 1; now < 300; now++)
    g.update(state, position, 0.2, rotation, 1, null, now);
  assert.deepEqual(ids(), before);
  assert.equal(
    g.texture.version,
    version,
    "Unchanged numerical labels do not redraw",
  );
  assert.deepEqual(g.root.position.toArray(), position.toArray());
  assert.equal(g.root.scale.x, 0.2 * 1.12);
  assert.ok(
    g.expected.position.distanceTo(g.actual.position) > 0.15,
    "Both shapes remain visible on a matching radial spoke",
  );
  const x = g.actual.position.x;
  g.update(state, position, 0.2, rotation, -1, null, 400);
  assert.ok(Math.abs(g.actual.position.x + x) < 1e-9);
  g.update(bendGaugeState(e, 1), position, 0.2, rotation, 1, null, 600);
  assert.equal(g.actual.visible, false);
  assert.equal(g.arc.visible, false);
  g.reset();
  assert.equal(g.root.visible, false);
  assert.equal(g.root.userData.binding, null);
  g.dispose();
  assert.equal(scene.children.length, 0);
});

test("extended G4 hold reports D4 at the gauge edge without requesting another press", () => {
  const event = {midi:67,pitchBendRange:5,bendStyle:"melody",bend:[
    {fraction:0,semitones:0},{fraction:.2,semitones:0},{fraction:.8,semitones:-5},{fraction:1,semitones:-5}]};
  const c=new THREE.Group(), h={id:"g4",pitchBendRange:5,root:{visible:true},
    getProcessedLivePerformanceState:()=>({bend:-1}),hasAudioVoice:()=>true};
  const a={ids:()=>[h.id],gestures:new Map([[c,{role:"lead-67",targetId:h.id,origin:"learner",id:"held"}]]),
    r:{controllerStates:new Map([[c,{trigger:true,raySqueezeInstrumentState:h}]]),
      getControllerVoiceId:()=>"right",getInstrumentVoiceId:()=>"right:g4"}};
  const observation=observeBendGesture(a,"lead-67","practice");
  assert.equal(observation.semitones,-5);
  const gauge=bendGaugeState(event,1,observation);
  assert.equal(gauge.range,5); assert.equal(gauge.required,-5);
  assert.equal(gauge.destination,"D4"); assert.equal(gauge.status,"On target");
  assert.match(gauge.instruction,/keep Trigger held/);
});
