// DevTools: await (await import('/scripts/validate-manual-honks-browser.mjs')).validate()
export async function validate() {
  const THREE = await import('three');
  const { createFaceOrchestraApp } = await import('/src/app/createFaceOrchestraApp.js');
  const app = createFaceOrchestraApp({ container: document.createElement('div'),
    storage: { getItem() { return null; }, setItem() {}, removeItem() {} } });
  await app.initialize();
  const r = app.runtime;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const honks = [];
  const controller = r.controllers[0];
  controller.matrixAutoUpdate = true;
  const state = r.controllerStates.get(controller);
  const point = position => {
    controller.position.copy(position); controller.position.z += 0.5;
    controller.quaternion.identity(); controller.updateMatrixWorld(true);
  };
  try {
    for (let i = 0; i < 3; i++) {
      r.createSpawnedComponent('honk'); const h = r.activeInstrumentState;
      h.root.position.set(i * h.getSqueezeColliderSphere().radius * 1.4, 1, -0.5); honks.push(h);
    }
    r.scene.updateMatrixWorld(true); r.honkContactSystem.update(); r.honkContactSystem.update();
    const h = honks[0];
    check(r.getTouchingInstrumentChain(h).length === 3, 'transitive contact component');
    check(!r.honkContactGraph.hasContact(h.id, honks[2].id), 'A and C must not directly touch');
    r.lockConnectedChordStates(h);
    await r.audioSystem.ensureAudio();
    point(h.getSqueezeColliderSphere().center);
    check(r.getCurrentHit(controller)?.object === h.squeezeCollider, 'real sphere ray selection');
    state.trigger = true; r.handleTriggerBeginIntent(controller); r.updateHorn(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    check(r.audioSystem.honkVoices.voices.size === 3, 'locked sphere starts all three voices');
    controller.position.x += 2; controller.rotation.z = 0.25; r.updateHorn(1000 / 90);
    check(h.getLivePerformanceState().bend > 0, 'real quaternion roll bends held off-sphere capture');
    r.unlockHonkFormation(h); r.updateHorn(2000 / 90);
    check(r.audioSystem.honkVoices.voices.size === 3, 'unlock retains owned hold');
    r.lockConnectedChordStates(h); r.updateHorn(3000 / 90);
    state.trigger = false; r.handleTriggerEndIntent(controller);
    check(r.audioSystem.honkVoices.voices.size === 0 && !state.raySqueezeTarget, 'release clears capture');

    // Compare the batched grip query with raw authoritative Three mesh rays.
    for (const other of honks.slice(1)) other.root.visible = false;
    h.resetLivePerformance(); h.setAutomationLayer('geometry', { squeeze: 1, bend: 0.5 });
    r.applyResolvedHonkPerformanceStates(100);
    h.clearAutomationLayer('geometry'); r.applyResolvedHonkPerformanceStates(100 + 1000 / 60);
    const visualScale = h.honkVisualRoot.scale.x;
    const box = h.withInteractionPose(() => new THREE.Box3().setFromObject(h.honkVisualRoot));
    let comparisons = 0; let hits = 0; let bodyPosition;
    for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) {
      const position = new THREE.Vector3(
        THREE.MathUtils.lerp(box.min.x, box.max.x, (x + 0.5) / 7),
        THREE.MathUtils.lerp(box.min.y, box.max.y, (y + 0.5) / 7), box.max.z);
      point(position);
      const hit = r.getGripHit(controller);
      const expected = h.withInteractionPose(() => {
        const found = [];
        for (const mesh of h.gripTargetList) THREE.Mesh.prototype.raycast.call(mesh, r.raycaster, found);
        return found.sort((a, b) => a.distance - b.distance)[0] || null;
      });
      check(Boolean(hit) === Boolean(expected), 'batched/raw authoritative hit agreement');
      if (hit) {
        check(Math.abs(hit.distance - expected.distance) < 1e-9, 'authoritative hit distance');
        bodyPosition = position; hits++;
      }
      check(h.honkVisualRoot.scale.x === visualScale, 'visible pose restored after query'); comparisons++;
    }
    check(hits > 0, 'geometry fixture has hits');
    point(bodyPosition);
    const startX = h.root.position.x;
    h.root.position.x += 5;
    check(!r.getGripHit(controller), 'same-frame movement invalidates ray geometry');
    h.root.position.x = startX;
    check(r.getGripHit(controller), 'same-frame move back restores hit');

    // The actual group transform path retains each member's relative offset.
    for (const other of honks.slice(1)) other.root.visible = true;
    r.handleGripBeginIntent(controller);
    check(state.gripHeld, 'locked body still permits grip');
    // Deliver a body hit to the actual Trigger handler while the group is held.
    const select = r.getCurrentHit;
    r.getCurrentHit = () => ({ object: h.gripTargetList[0] });
    state.trigger = true; r.handleTriggerBeginIntent(controller); r.updateHorn(150);
    check(!state.raySqueezeTarget && r.audioSystem.honkVoices.voices.size === 0, 'group grip cannot bypass sphere');
    state.trigger = false; r.handleTriggerEndIntent(controller); r.getCurrentHit = select;
    // Resolve the earlier pulse/scale change before measuring pure translation.
    r.updateLockedHonkGroupTransforms();
    const positions = honks.map(member => member.root.position.clone());
    controller.position.x += 0.2;
    r.updateGripTransform(); r.updateLockedHonkGroupTransforms();
    for (let i = 0; i < honks.length; i++) {
      check(Math.abs(honks[i].root.position.x - positions[i].x - 0.2) < 1e-6, `group moves together: ${i}, before=${positions[i].x}, after=${honks[i].root.position.x}`);
    }
    r.handleGripEndIntent(controller);
    point(h.getSqueezeColliderSphere().center);
    state.trigger = true; r.handleTriggerBeginIntent(controller); r.updateHorn(200);
    await new Promise(resolve => setTimeout(resolve, 0));
    r.deleteInstrument(h);
    check(!state.raySqueezeTarget && r.audioSystem.honkVoices.voices.size === 0, 'delete releases captured chord');
    return { comparisons, hits, visualScale, lockedSphereVoices: 3, groupMovement: true,
      sameFrameTransforms: true, holdRollUnlockDelete: true };
  } finally {
    const context = r.audioSystem.audioContextService.context;
    app.dispose(); await context?.close();
  }
}
