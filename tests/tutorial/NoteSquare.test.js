import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { MelodyHands } from '../../src/tutorial/MelodyHands.js';
import { noteSquareScale } from '../../src/tutorial/NoteSquare.js';

for (const bpm of [30, 80, 115, 240])
  test(`repeated attacks shrink smoothly using song time at ${bpm} BPM`, () => {
    const beatMs = 60000 / bpm, event = { beat: 2, beats: 1 };
    const at = elapsedMs => noteSquareScale(event, event.beat + elapsedMs / beatMs, beatMs);
    assert.ok(at(0) < at(20));
    assert.ok(at(20) < at(40));
    assert.equal(at(100), 1);
    assert.ok(at(beatMs - 20) < at(beatMs - 40));
    assert.ok(Math.abs(at(beatMs) - at(0)) < 1e-10, 'No size jump between abutting releases and attacks');
    assert.equal(at(100), 1, 'Seeking backward produces the same scale without animation history');
    assert.ok(at(beatMs) > .7, 'The square only shrinks slightly; it never disappears');
  });

test('melody squares stay outlined when inactive, fill white when active, and follow camera and frame size', () => {
  const scene = new Scene(), camera = new PerspectiveCamera();
  camera.rotation.set(.2, .3, .1);
  const target = { root: new Group(), getSqueezeColliderSphere: () => ({ center: new Vector3(1, 2, -1), radius: .1 }) };
  const adapter = { layoutRotation: new Group().quaternion, get: () => target,
    virtuals: [new Group(), new Group()], input() {}, park() {} };
  const events = [{ id: 'a', role: 'lead', beat: 0, beats: 1 }, { id: 'b', role: 'lead', beat: 1, beats: 1 }];
  let scale = 1;
  const hands = new MelodyHands({ a: adapter, r: { scene, getUserCamera: () => camera }, metro: { bpm: 115 },
    definition: { bpm: 80, score: { events }, arrangement: { recipes: [{ kind: 'honk', role: 'lead' }] } },
    layoutFrame: { root: new Group(), visualScaleFor: () => scale } });
  const square = hands.labels.get('lead');
  try {
    hands.update();
    assert.equal(square.visible, true);
    assert.equal(square.material.opacity, 0);
    assert.equal(square.children[0].material.color.getHex(), 0xffffff);
    assert.equal(square.children[0].material.opacity, .25);
    assert.ok(square.scale.x < .045);
    hands.update(events, .5);
    const steady = square.scale.x;
    assert.ok(steady < .07);
    assert.equal(square.material.opacity, 1);
    assert.equal(square.children[0].visible, false, 'Solid fill replaces the faint outline while active');
    assert.equal(square.material.color.getHex(), 0xffffff);
    assert.equal(square.userData.activeNote, true);
    assert.ok(square.quaternion.toArray().every((value, i) => Math.abs(value - camera.quaternion.toArray()[i]) < 1e-12));
    hands.update(events, 1);
    assert.equal(square.userData.eventId, 'b');
    assert.ok(square.scale.x < steady);
    hands.update(events, 1.5);
    assert.equal(square.scale.x, steady);
    scale = 2; hands.update(events, 1.5);
    assert.equal(square.scale.x, steady * 2);
    hands.update(events, 2);
    assert.equal(square.material.opacity, 0);
    assert.equal(square.children[0].visible, true);
    target.root.visible = false; hands.update();
    assert.equal(square.visible, false);
  } finally { hands.dispose(); }
  assert.equal(square.parent, null);
});
