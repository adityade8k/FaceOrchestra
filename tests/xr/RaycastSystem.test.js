import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeModule } from '../support/runtimeModule.mjs';
import { HonkInstrument } from '../../src/instruments/honk/HonkInstrument.js';
const { RaycastSystem } = await runtimeModule(new URL('../../src/xr/RaycastSystem.js', import.meta.url));

function setup() {
  const root = { visible: true, userData: {}, parent: {}, x: 0, worldX: 0, matrices: 0,
    updateWorldMatrix() { this.worldX = this.x; }, updateMatrixWorld() { this.matrices++; this.worldX = this.x; } };
  const scale = { x: 1.03, setScalar(value) { this.x = value; } };
  const morph = { squeeze: 0.82, bend: 0.4 };
  const h = { root, locked: true, honkPresentation: { ...morph }, honkVisualRoot: { scale },
    hornSqueezeValue: 0, bendValue: 0, morphs: {
      setSqueeze(v) { morph.squeeze = v; }, setBend(v) { morph.bend = v; },
    }, withInteractionPose: HonkInstrument.prototype.withInteractionPose };
  const targets = [1, 2, 3].map(distance => ({ name: `body${distance}`, parent: root, visible: true,
    distance, userData: { isBodyGripTarget: true } }));
  h.hitTargetList = targets; h.gripTargetList = targets;
  const raycaster = { intersectObjects(objects, _recursive, hits) {
    for (const object of objects) {
      assert.equal(scale.x, 1); assert.equal(morph.squeeze, 0);
      if (root.worldX === 0) hits.push({ object, distance: object.distance });
    }
    hits.sort((a,b) => a.distance - b.distance);
  } };
  const system = new RaycastSystem({ raycaster, getInstruments: () => [h],
    getTargets: () => targets, resolveOwner: object => object ? h : null, canLock: () => true });
  system.setFromController = () => {};
  return { system, root, h, targets, scale, morph, raycaster };
}

test('all meshes in a query share one authoritative pose and restore the visible pose', () => {
  const f = setup();
  assert.equal(f.system.getCurrentHit({}).object, f.targets[0]);
  assert.equal(f.root.matrices, 2, 'one apply/restore, independent of mesh count');
  assert.equal(f.scale.x, 1.03); assert.deepEqual(f.morph, f.h.honkPresentation);
  f.system.getLockedInstrumentFromRay({}); assert.equal(f.root.matrices, 4);
  f.system.getGripHit({}); assert.equal(f.root.matrices, 6);
});

test('query failure restores pose and allows the next query', () => {
  const f = setup(); const intersect = f.raycaster.intersectObjects;
  f.raycaster.intersectObjects = () => { throw new Error('raycast failed'); };
  assert.throws(() => f.system.getCurrentHit({}), /raycast failed/);
  assert.equal(f.h.interactionPoseActive, false); assert.equal(f.scale.x, 1.03);
  assert.deepEqual(f.morph, f.h.honkPresentation);
  f.raycaster.intersectObjects = intersect;
  assert.ok(f.system.getGripHit({}));
});

test('same-frame transform, target, visibility, lock and removal changes cannot reuse old hits', () => {
  const f = setup(); const controller = {};
  assert.ok(f.system.getCurrentHit(controller));
  f.root.x = 10; assert.equal(f.system.getCurrentHit(controller), null);
  f.root.x = 0; assert.ok(f.system.getCurrentHit(controller));
  f.targets[0].visible = false;
  assert.equal(f.system.getCurrentHit(controller).object, f.targets[1]);
  f.targets[1].parent = null;
  assert.equal(f.system.getCurrentHit(controller).object, f.targets[2]);
  f.root.parent.visible = false; assert.equal(f.system.getCurrentHit(controller), null);
  f.root.parent.visible = true;
  f.h.locked = false; assert.equal(f.system.getLockedInstrumentFromRay(controller), null);
  f.h.disposed = true; assert.equal(f.system.getCurrentHit(controller), null);
});

test('existing connector, looper, procedural and body hit priorities survive batching', () => {
  const f = setup();
  f.targets[2].userData.isProceduralMorphTarget = true;
  assert.equal(f.system.getCurrentHit({}).object, f.targets[2]);
  f.targets[1].userData.isLooperCollider = true;
  assert.equal(f.system.getCurrentHit({}).object, f.targets[1]);
  f.targets[2].userData.isHonkConnectionTarget = true;
  assert.equal(f.system.getCurrentHit({}).object, f.targets[2]);
  f.targets[0].userData.isCloseButton = true;
  assert.equal(f.system.getCurrentHit({}).object, f.targets[0]);
});
