// DevTools: await (await import('/tests/browser/validate-manual-honks-browser.mjs')).validate()
export async function validate() {
  const THREE = await import("three");
  const { createFaceOrchestraApp } = await import("/src/app/createFaceOrchestraApp.js");
  const app = createFaceOrchestraApp({
    container: document.createElement("div"),
    storage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
  });
  await app.initialize();
  const r = app.runtime;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const honks = [];
  const controller = r.controllers[0];
  // Model a connected controller in the isolated desktop fixture.
  controller.visible = true;
  controller.userData.inputConnected = true;
  controller.matrixAutoUpdate = true;
  const state = r.controllerStates.get(controller);
  const point = (position) => {
    controller.position.copy(position);
    controller.position.z += 0.5;
    controller.quaternion.identity();
    controller.updateMatrixWorld(true);
  };
  try {
    for (let i = 0; i < 3; i++) {
      r.createSpawnedComponent("honk");
      const h = r.activeInstrumentState;
      h.root.position.set(i * h.getSqueezeColliderSphere().radius * 1.4, 1, -0.5);
      honks.push(h);
    }
    r.scene.updateMatrixWorld(true);
    r.honkContactSystem.update();
    r.honkContactSystem.update();
    const h = honks[0];
    check(r.getTouchingInstrumentChain(h).length === 3, "transitive contact component");
    check(!r.honkContactGraph.hasContact(h.id, honks[2].id), "A and C must not directly touch");
    r.lockConnectedChordStates(h);
    await r.audioSystem.ensureAudio();
    point(h.getSqueezeColliderSphere().center);
    let squeezeBodyQueries = 0;
    const bodyRaycasts = h.gripTargetList.map((mesh) => [mesh, mesh.raycast]);
    for (const [mesh, original] of bodyRaycasts)
      mesh.raycast = function (...args) {
        squeezeBodyQueries++;
        return original.apply(this, args);
      };
    try {
      check(
        r.getCurrentHit(controller)?.object === h.squeezeCollider,
        "control-first sphere selection",
      );
      check(
        squeezeBodyQueries === 0,
        "squeeze selection does not traverse authored body triangles",
      );
    } finally {
      for (const [mesh, original] of bodyRaycasts) mesh.raycast = original;
    }
    check(r.getCurrentHit(controller)?.object === h.squeezeCollider, "real sphere ray selection");
    const start = performance.now();
    state.trigger = true;
    r.handleTriggerBeginIntent(controller, start);
    r.updateHorn(start);
    await new Promise((resolve) => setTimeout(resolve, 0));
    check(r.audioSystem.honkVoices.voices.size === 3, "locked sphere starts all three voices");
    r.updateHorn(start + 110);
    check(r.audioSystem.honkVoices.voices.size === 3, "sustained aim keeps all chord voices");
    controller.rotation.z = 0.03;
    r.updateHorn(start + 120);
    check(h.getLivePerformanceState().bend > 0, "real quaternion roll bends while aimed");
    controller.position.x += 2;
    r.updateHorn(start + 130);
    check(
      r.audioSystem.honkVoices.voices.size === 0 && !state.raySqueezeTarget,
      "leaving the locked chord stops every owned voice",
    );
    point(h.getSqueezeColliderSphere().center);
    r.updateHorn(start + 140);
    await new Promise((resolve) => setTimeout(resolve, 0));
    check(r.audioSystem.honkVoices.voices.size === 3, "held Trigger restarts the chord on reentry");
    controller.rotation.z = 0.25;
    r.updateHorn(start + 145);
    check(state.raySqueezeLatched, "deliberate bend locks the chord");
    controller.position.x += 2;
    r.updateHorn(start + 146);
    check(r.audioSystem.honkVoices.voices.size === 3, "bend-locked chord keeps playing off target");
    r.unlockHonkFormation(h);
    r.updateHorn(start + 150);
    check(r.audioSystem.honkVoices.voices.size === 3, "unlock retains the bend-locked chord");
    r.lockConnectedChordStates(h);
    r.updateHorn(start + 160);
    state.trigger = false;
    r.handleTriggerEndIntent(controller);
    check(
      r.audioSystem.honkVoices.voices.size === 0 && !state.raySqueezeTarget,
      "release clears capture",
    );

    // Compare the batched grip query with raw authoritative Three mesh rays.
    for (const other of honks.slice(1)) other.root.visible = false;
    h.resetLivePerformance();
    h.setAutomationLayer("geometry", { squeeze: 1, bend: 0.5 });
    r.applyResolvedHonkPerformanceStates(100);
    h.clearAutomationLayer("geometry");
    r.applyResolvedHonkPerformanceStates(100 + 1000 / 60);
    const visualScale = h.honkVisualRoot.scale.x;
    const box = h.withInteractionPose(() => new THREE.Box3().setFromObject(h.honkVisualRoot));
    let comparisons = 0;
    let hits = 0;
    let bodyPosition;
    for (let x = 0; x < 7; x++)
      for (let y = 0; y < 7; y++) {
        const position = new THREE.Vector3(
          THREE.MathUtils.lerp(box.min.x, box.max.x, (x + 0.5) / 7),
          THREE.MathUtils.lerp(box.min.y, box.max.y, (y + 0.5) / 7),
          box.max.z,
        );
        point(position);
        const selected = r.raycastSystem.getCurrentHit(controller);
        const classify = r.raycastSystem.isFallbackBody;
        let completeSelection;
        try {
          r.raycastSystem.isFallbackBody = () => false;
          completeSelection = r.raycastSystem.getCurrentHit(controller);
        } finally {
          r.raycastSystem.isFallbackBody = classify;
        }
        check(
          selected?.object === completeSelection?.object,
          "staged/full actual-mesh selection parity",
        );
        if (selected)
          check(
            Math.abs(selected.distance - completeSelection.distance) < 1e-9,
            "staged/full selection distance parity",
          );
        const hit = r.getGripHit(controller);
        const expected = h.withInteractionPose(() => {
          const found = [];
          for (const mesh of h.gripTargetList)
            THREE.Mesh.prototype.raycast.call(mesh, r.raycaster, found);
          return found.sort((a, b) => a.distance - b.distance)[0] || null;
        });
        check(Boolean(hit) === Boolean(expected), "batched/raw authoritative hit agreement");
        if (hit) {
          check(Math.abs(hit.distance - expected.distance) < 1e-9, "authoritative hit distance");
          bodyPosition = position;
          hits++;
        }
        check(h.honkVisualRoot.scale.x === visualScale, "visible pose restored after query");
        comparisons++;
      }
    check(hits > 0, "geometry fixture has hits");
    point(bodyPosition);
    const startX = h.root.position.x;
    h.root.position.x += 5;
    check(!r.getGripHit(controller), "same-frame movement invalidates ray geometry");
    h.root.position.x = startX;
    check(r.getGripHit(controller), "same-frame move back restores hit");

    // The actual group transform path retains each member's relative offset.
    for (const other of honks.slice(1)) other.root.visible = true;
    r.handleGripBeginIntent(controller);
    check(state.gripHeld, "locked body still permits grip");
    check(r.audioSystem.honkVoices.voices.size === 0, "grip alone remains silent");
    // Deliver a body hit to the actual Trigger handler while the group is held.
    const select = r.getCurrentHit;
    r.getCurrentHit = () => ({ object: h.gripTargetList[0] });
    state.trigger = true;
    r.handleTriggerBeginIntent(controller, start + 150);
    r.updateHorn(start + 150);
    await new Promise((resolve) => setTimeout(resolve, 0));
    check(
      state.raySqueezeTarget && r.audioSystem.honkVoices.voices.size === 3,
      "trigger plays the locked bounding box while the group is held",
    );
    state.trigger = false;
    r.handleTriggerEndIntent(controller);
    r.getCurrentHit = select;
    // Resolve the earlier pulse/scale change before measuring pure translation.
    r.updateLockedHonkGroupTransforms();
    const positions = honks.map((member) => member.root.position.clone());
    controller.position.x += 0.2;
    r.updateGripTransform();
    r.updateLockedHonkGroupTransforms();
    for (let i = 0; i < honks.length; i++) {
      check(
        Math.abs(honks[i].root.position.x - positions[i].x - 0.2) < 1e-6,
        `group moves together: ${i}, before=${positions[i].x}, after=${honks[i].root.position.x}`,
      );
    }
    r.handleGripEndIntent(controller);
    point(h.getSqueezeColliderSphere().center);
    state.trigger = true;
    r.handleTriggerBeginIntent(controller, start + 200);
    r.updateHorn(start + 200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    r.deleteInstrument(h);
    check(
      !state.raySqueezeTarget && r.audioSystem.honkVoices.voices.size === 0,
      "delete releases captured chord",
    );
    return {
      comparisons,
      hits,
      visualScale,
      squeezeBodyQueries,
      selectionParity: true,
      lockedSphereVoices: 3,
      groupMovement: true,
      sameFrameTransforms: true,
      holdRollUnlockDelete: true,
    };
  } finally {
    const context = r.audioSystem.audioContextService.context;
    app.dispose();
    await context?.close();
  }
}
