// Browser integration: real rays, semantic input, contact physics and Web Audio.
// No direct objective awards, fabricated timelines or overwritten hit results.
export async function validate(app, { isolationOnly = false } = {}) {
  const THREE = await import("three");
  const { BASICS_STEPS } = await import("../../src/tutorial/basicsSteps.js");
  const { getLooperLabelText } = await import("../../src/instruments/looper/looperLabel.js");
  const r = app.runtime,
    t = r.tutorial;
  // Software-rendered headless frames are too slow for controller timing.
  // Drive the unchanged frame scheduler at real wall time, rendering separately.
  app.stopCompute();
  const tick = setInterval(() => app.update(0.016, 0, performance.now()), 16);
  const checks = [];
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
    checks.push(message);
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (predicate, message, timeout = 7000) => {
    const end = performance.now() + timeout;
    while (!predicate()) {
      if (performance.now() > end)
        throw new Error(
          message + " at " + t.basics?.step.id + ": " + JSON.stringify(t.basics?.model()),
        );
      await delay(20);
    }
  };
  await t.action("play");
  r.createSpawnedComponent("honk", {
    name: "Protected composition",
    baseScale: 1.6,
  });
  const seed = r.activeInstrumentState;
  seed.setVowel("E");
  seed.root.position.set(3, 1, -2);
  const canonical = (scene) =>
    JSON.stringify(scene, (_, value) =>
      typeof value === "number" ? Number(value.toFixed(8)) : value,
    );
  const saved = canonical(r.sceneSerializer.serialize());
  const listenersBefore = r.instrumentRegistry.listeners.size;
  await t.action("basics");
  const b = t.basics;
  check(b && !t.uiFeedback, "Basics starts");
  check(
    b.fixtures.honks.length === 1 && r.instrumentRegistry.size === 1,
    "Exactly one default horn",
  );
  if (isolationOnly) {
    await t.navigation.enterPlay();
    clearInterval(tick);
    return { before: JSON.parse(saved), after: r.sceneSerializer.serialize() };
  }
  // New Object3Ds act as tracked controller poses; all input goes through the
  // existing mapper/coordinator. They are learner-origin, not demo controllers.
  const controllers = [0, 1].map((i) => {
    const c = new THREE.Group();
    c.userData.controllerId = "basics-browser-" + i;
    c.userData.handedness = i ? "left" : "right";
    c.userData.tutorialOrigin = "learner";
    c.userData.radialMenu = r.createRadialMenu();
    c.add(c.userData.radialMenu);
    r.scene.add(c);
    r.controllers.push(c);
    r.interactionCoordinator.registerController(c);
    return c;
  });
  const [right, left] = controllers;
  const send = (c, button, pressed) =>
    r.interactionCoordinator.receiveInput({
      type: "button.transition",
      controller: c,
      handedness: c.userData.handedness,
      button,
      pressed,
      timestamp: performance.now(),
    });
  const axis = (direction) =>
    r.interactionCoordinator.receiveInput({
      type: "axis.step",
      controller: right,
      handedness: "right",
      axis: "thumbstickX",
      direction,
      timestamp: performance.now(),
    });
  const away = (c) => {
    c.position.set(5, 2, 2);
    c.quaternion.identity();
    c.updateMatrixWorld(true);
  };
  const point = (target, c = right, grip = false) => {
    if (!target) throw new Error("Missing target at " + b.step.id);
    target.updateWorldMatrix(true, false);
    const center = target.getWorldPosition(new THREE.Vector3());
    const size = target.geometry?.boundingSphere?.radius || 0;
    for (const offset of [
      [0, 0, 0.6],
      [0, 0.16, 0.45],
      [0.22, 0, 0.4],
      [-0.22, 0, 0.4],
      [0, -0.16, 0.4],
      [0, 0, 0.12],
    ]) {
      c.position.copy(center).add(new THREE.Vector3(...offset));
      c.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().lookAt(c.position, center, new THREE.Vector3(0, 1, 0)),
      );
      c.updateMatrixWorld(true);
      const hit = grip ? r.getGripHit(c) : r.getCurrentHit(c);
      if (
        grip
          ? r.instrumentRegistry.getFromObject3D(hit?.object) ===
            r.instrumentRegistry.getFromObject3D(target)
          : hit?.object === target
      )
        return;
    }
    throw new Error("Ray cannot reach " + target.name + " size " + size + " at " + b.step.id);
  };
  const release = async () => {
    for (const c of controllers) {
      for (const key of ["trigger", "grip", "primary", "secondary"]) send(c, key, false);
      away(c);
    }
    axis(0);
    await delay(90);
  };
  const next = async (id) => {
    globalThis.basicsTestStage = id;
    await wait(() => b.step.id === id && !b.setup, "Auto advance to " + id);
    await release();
    const old = b.index;
    await b.action("next-step");
    check(b.index === old, id + ": unfinished Next is blocked");
    if (["body", "group"].includes(b.step.target)) {
      check(
        !b.guidance.ring.visible &&
          !b.guidance.badge.visible &&
          !b.guidance.arrow.visible &&
          !b.guidance.spatial.root.visible,
        id + ": no target, badge or direction overlay on the Honk",
      );
    }
  };
  const squeeze = async (ms = 280) => {
    point(b.horn.squeezeCollider);
    send(right, "trigger", true);
    await delay(ms);
  };
  const clickTarget = async (target, c = right) => {
    point(target, c);
    send(c, "trigger", true);
    await delay(35);
    send(c, "trigger", false);
    away(c);
    await delay(65);
  };
  const grab = async (h = b.horn) => {
    point(h.squeezeCollider, right, true);
    send(right, "grip", true);
    await delay(50);
  };
  const move = async (delta) => {
    right.position.add(new THREE.Vector3(...delta));
    right.updateMatrixWorld(true);
    await delay(160);
  };
  const button = (l, action) => clickTarget(l.hitTargets["HIT_looper_" + action]);
  const dragEar = async (side, direction) => {
    point(b.horn.hitTargets[side === "left" ? "HIT_leftEar" : "HIT_rightEar"], left);
    send(left, "trigger", true);
    await delay(45);
    left.position.y += direction * 0.08;
    left.updateMatrixWorld(true);
    await delay(180);
    if (b.step.id === "ears" && b.objectives.size === 0)
      throw new Error(
        "Ear evidence: " +
          JSON.stringify({
            value: b.horn.getEarAmount(side),
            live: b.horn.getLivePerformanceState(),
            fresh: b.fresh.get(left) && {
              trigger: b.fresh.get(left).trigger,
              parameter: b.fresh.get(left).parameter,
              objective: b.fresh.get(left).objective,
            },
            interaction: r.controllerStates.get(left).activeTriggerInteraction && {
              type: r.controllerStates.get(left).activeTriggerInteraction.type,
              side: r.controllerStates.get(left).activeTriggerInteraction.side,
              dragStartMorphValue:
                r.controllerStates.get(left).activeTriggerInteraction.dragStartMorphValue,
              startY: r.controllerStates.get(left).activeTriggerInteraction.dragStartY,
              y: left.position.y,
              min: r.controllerStates.get(left).activeTriggerInteraction.sphere?.userData.minY,
              max: r.controllerStates.get(left).activeTriggerInteraction.sphere?.userData.maxY,
            },
          }),
      );
    send(left, "trigger", false);
    away(left);
    await delay(70);
  };
  const wire = async (from, to) => {
    point(from);
    send(right, "trigger", true);
    await delay(70);
    point(to);
    await delay(100);
    send(right, "trigger", false);
    away(right);
    await delay(150);
  };
  let failure;
  try {
    globalThis.basicsTestStage = "honk";
    await release();
    const snapshot = JSON.stringify(r.sceneSerializer.serialize());
    await b.action("step-help");
    await delay(200);
    check(
      b.completed.size === 0 && snapshot === JSON.stringify(r.sceneSerializer.serialize()),
      "Help cannot mutate instruments or earn completion",
    );
    await b.action("next-step");
    check(b.index === 0, "First step cannot be skipped");
    await squeeze();
    await wait(() => b.step.id === "bend", "Honk advances");
    await delay(300);
    check(!b.completed.has("bend"), "Held trigger cannot complete next step");
    await release();
    await squeeze();
    const bendWrist = async () => {
      const neutral = right.quaternion.clone();
      right.rotation.z += 0.25;
      right.updateMatrixWorld(true);
      await delay(260);
      right.quaternion.copy(neutral);
      right.updateMatrixWorld(true);
      await delay(230);
    };
    for (let i = 0; i < 3; i++) await bendWrist();
    await next("move");
    await grab();
    await move([0.025, 0, 0]);
    check(!b.completed.has("move"), "Movement jitter ignored");
    check(!b.guidance.spatial.ghost, "Movement has no wireframe silhouette");
    await move([-0.525, 0, 0]);
    check(
      b.objectives.has("move") && !b.completed.has("move"),
      "Free movement waits for a reachable horn",
    );
    const reachable = r
      .getUserCamera()
      .getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(0, -0.15, -0.55).applyQuaternion(t.adapter.layoutRotation));
    await move(reachable.sub(b.horn.root.position).toArray());
    await next("strike");
    away(right);
    send(right, "grip", true);
    await delay(100);
    check(r.controllerStates.get(right).stickActive, "Empty-space Grip equips the real stick");
    const { TutorialStrikeTargets } = await import("../../src/tutorial/TutorialStrikeTargets.js");
    const strikeTargets = new TutorialStrikeTargets(t.adapter);
    const pointOnBody = strikeTargets.get("basic").clone();
    const stick = r.stickEquipmentSystem.getEquippedStick(right.userData.controllerId);
    right.position.set(0, 0, 0);
    right.quaternion.identity();
    right.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(stick.collider);
    const offset = bounds.getCenter(new THREE.Vector3()),
      halfZ = (bounds.max.z - bounds.min.z) / 2;
    const stroke = async (approach) => {
      right.position.copy(pointOnBody).sub(offset);
      right.position.z += halfZ + (1 - approach) * 0.32 - 0.035;
      right.updateMatrixWorld(true);
      await delay(90);
    };
    await stroke(0);
    await stroke(1);
    await delay(150);
    check(b.objectives.size === 0, "Lingering stick contact does not count as a withdrawn strike");
    await stroke(0);
    await wait(() => b.objectives.has("first"), "First real strike");
    await stroke(1);
    await stroke(0);

    await next("rotate");
    await grab();
    right.rotation.z += 0.4;
    right.updateMatrixWorld(true);
    await delay(180);
    await next("small");
    await grab();
    for (let i = 0; i < 7 && !b.completed.has("small"); i++) {
      axis(-1);
      axis(0);
      await delay(45);
    }
    await next("big");
    await grab();
    for (let i = 0; i < 7 && !b.completed.has("big"); i++) {
      axis(1);
      axis(0);
      await delay(45);
    }
    await next("ears");
    check(Math.abs(b.horn.baseScale - 2.5) < 0.02, "Maximum size returns to working size");
    for (const [side, direction] of [
      ["left", 1],
      ["left", -1],
      ["right", 1],
      ["right", -1],
    ])
      await dragEar(side, direction);
    await next("pitch");
    await squeeze();
    for (let i = 0; i < 3; i++) {
      await bendWrist();
      check(
        b.objectives.has(`bend-${i + 1}`) && !b.completed.has("pitch"),
        "Combined pitch requires the sounding ear gestures",
      );
      await dragEar("left", 1);
      await dragEar("left", -1);
    }
    await next("volume");
    await squeeze();
    for (const direction of [1, -1, 1, -1, 1, -1]) {
      point(b.horn.hitTargets.HIT_nose, left);
      send(left, "trigger", true);
      await delay(45);
      left.position.y += direction * 0.08;
      left.updateMatrixWorld(true);
      await delay(180);
      send(left, "trigger", false);
      away(left);
      await delay(70);
    }
    await next("vowels");
    for (let i = 0; i < 5; i++) await clickTarget(b.horn.hitTargets.HIT_mouth, left);
    check(b.objectives.size === 0, "Cycling vowels silently earns no credit");
    for (let i = 0; i < 15; i++) {
      await squeeze();
      send(right, "trigger", false);
      away(right);
      await delay(70);
      if (i < 14) await clickTarget(b.horn.hitTargets.HIT_mouth, left);
    }
    await next("duplicate");
    check(
      !b.guidance.ring.visible && !b.guidance.badge.visible,
      "Duplicate has no overlaid mark or controller badge",
    );
    await grab();
    send(right, "primary", true);
    await delay(100);
    send(right, "primary", false);
    await move([0.22, 0, 0]);
    await release();
    await delay(1300);
    check(
      b.step.id === "duplicate" && b.completed.has("duplicate"),
      "Duplicate stays on its lesson after moving and releasing the copy",
    );
    const continueButton = b.model().navigation.find((action) => action.id === "next-step");
    check(
      continueButton.label === "Continue" && !continueButton.disabled,
      "Duplicate provides an enabled Continue button",
    );
    await b.action("next-step");
    await next("chord");
    check(
      !b.guidance.ring.visible && !b.guidance.badge.visible && !b.guidance.spatial.root.visible,
      "Chord has no colored target or controller badge",
    );
    await grab();
    send(right, "primary", true);
    await delay(70);
    send(right, "primary", false);
    await delay(70);
    check(b.fixtures.honks.length === 3, "Grip+A creates the third real horn");
    send(right, "primary", true);
    send(right, "primary", false);
    check(b.fixtures.honks.length === 3, "Extra duplicates capped");
    await move([0, 0.25, 0]);
    await release();
    // Move each member using the real grip system into squeeze-sphere overlap.
    const center = b.horn.root.position.clone();
    for (const h of b.fixtures.honks.slice(1)) {
      await grab(h);
      const delta = center.clone().sub(h.root.position);
      await move(delta.toArray());
      await release();
    }
    await squeeze();
    await next("freeze");
    point(b.horn.squeezeCollider);
    send(right, "secondary", true);
    await delay(50);
    send(right, "secondary", false);
    await grab();
    await move([0.16, 0, 0]);
    await next("unfreeze");
    check(
      Boolean(r.honkLockService.getGroupForMember(b.horn.id)),
      "Frozen group survives transition",
    );
    point(b.horn.squeezeCollider);
    send(right, "secondary", true);
    await delay(50);
    send(right, "secondary", false);
    await next("clear");
    send(left, "primary", true);
    await delay(50);
    send(left, "primary", false);
    await next("create");
    check(b.fixtures.honks.length === 0, "X clears only tutorial horns");
    const completedBefore = b.completed.size;
    await b.action("previous-step");
    await b.action("previous-step");
    check(
      b.step.id === "unfreeze" && r.honkLockService.getGroupForMember(b.horn.id),
      "Back restores frozen unfreeze fixture",
    );
    await delay(1100);
    check(b.step.id === "unfreeze", "Completed revisit never automatically advances");
    check(b.completed.size === completedBefore, "Fixture restore preserves completion history");
    await b.action("next-step");
    await b.action("next-step");
    await release();
    // The ordinary catalog preview is placed with a fresh trigger; no direct spawn.
    right.position.copy(t.adapter.anchor).add(new THREE.Vector3(0, 0, 0.6));
    right.quaternion.identity();
    right.updateMatrixWorld(true);
    send(right, "primary", true);
    await delay(70);
    // Select by rolling and pulling through the ordinary menu.
    const state = r.controllerStates.get(right);
    check(state.radialMenuOpen, "A opens normal creation menu");
    const categories = r.spawn.spawnCatalog.getRadialCategories();
    const category = categories.findIndex((item) =>
      item.entries.some((entry) => entry.id === "honk"),
    );
    const rollTo = (predicate) => {
      const start = right.rotation.z;
      for (let i = 0; i < 720; i++) {
        right.rotation.z = start + i * 0.015;
        right.updateMatrixWorld(true);
        r.spawn.spawnMenuController.update(right, state);
        if (predicate()) return;
      }
      throw new Error("Cannot select Honk in radial menu");
    };
    rollTo(() => state.radialMenuParentSelectedIndex === category);
    right.position.addScaledVector(state.radialMenuPullAxis, 0.08);
    right.updateMatrixWorld(true);
    r.spawn.spawnMenuController.update(right, state);
    rollTo(() => categories[category].entries[state.radialMenuChildSelectedIndex]?.id === "honk");
    send(right, "primary", false);
    check(
      Boolean(r.spawn.pendingSpawnPlacement),
      "Roll/pull/release creates ordinary Honk preview",
    );
    right.quaternion.identity();
    right.updateMatrixWorld(true);
    await delay(90);
    send(right, "trigger", true);
    await delay(50);
    send(right, "trigger", false);
    await next("metronome");
    const metro = b.fixtures.get("metronome");
    const metroLocal = metro.root
      .getWorldPosition(new THREE.Vector3())
      .sub(r.getUserCamera().getWorldPosition(new THREE.Vector3()))
      .applyQuaternion(t.adapter.layoutRotation.clone().invert());
    check(Math.abs(metroLocal.x) < 0.001, "Metronome spawns in the viewer’s middle");
    check(metro.baseScale === 1.75, "Metronome starts three size steps bigger");
    await clickTarget(b.guidance.target());
    await next("bpm");
    const m = b.fixtures.get("metronome"),
      control = m.handleRig.controls.get("bpm");
    // Real ray drag around the authored handle arc.
    point(b.guidance.target());
    send(right, "trigger", true);
    await delay(50);
    for (let i = 0; i < 8 && !b.tempoChanged; i++) await move([0.035, 0.03, 0]);
    send(right, "trigger", false);
    await next("length");
    const dragControl = async (name, sign, until) => {
      point(b.looper.hitTargets["HIT_looper_" + name]);
      send(right, "trigger", true);
      await delay(50);
      for (let i = 0; i < 40 && !until(); i++) await move([0, sign * 0.006, 0]);
      send(right, "trigger", false);
      away(right);
      await delay(70);
    };
    await dragControl("recordLength", -1, () => b.looper.looperData.recordBeats === 0);
    await next("wire-horn");
    check(
      b.looper.looperLabelTextValue === "0 gap\n0 beats",
      "Open recording shows the beat count instead of Manual",
    );
    check(
      b.guidance.spatial.destinationTarget() === b.horn.hitTargets.HIT_honkConnection,
      "Horn destination socket is highlighted",
    );
    await wire(b.looper.tracks[0].nodeTarget, b.horn.hitTargets.HIT_honkConnection);
    await next("wire-clock");
    const socketCue = b.guidance.spatial.destination;
    check(
      socketCue.visible && socketCue.scale.x >= 0.045 && socketCue.material.opacity >= 0.84,
      "Gold looper socket cue is large, bright and visible",
    );
    await wire(
      b.guidance.target(),
      b.looper.tracks.find((track) => !track.connectedHonkId).nodeTarget,
    );
    await next("record");
    await button(b.looper, "record");
    await delay(350);
    check(!b.completed.has("record"), "Armed silence does not complete recording");
    check(b.looper.looperLabelTextValue === "0 gap\n0 beats", "Armed label starts at zero beats");
    await squeeze(420);
    send(right, "trigger", false);
    await delay(90);
    check(b.looper.transport.recording, "Manual take waits for physical Stop");
    check(
      b.looper.looperLabelTextValue === getLooperLabelText(b.looper),
      "Recording label follows the live beat count",
    );
    await button(b.looper, "stop");
    await next("playback");
    check(
      b.looper.looperLabelTextValue === getLooperLabelText(b.looper) &&
        !b.looper.looperLabelTextValue.includes("Manual"),
      "Saved recording label retains its actual beat length",
    );
    await button(b.looper, "play");
    await wait(() => b.objectives.has("heard"), "Recorded phrase actually sounds");
    check(
      b.guidance.target() === b.looper.hitTargets.HIT_looper_pause,
      "Playback cue points to Pause",
    );
    await delay(30);
    check(
      b.guidance.ring.visible &&
        b.guidance.ring.material.color.getHex() === 0xffcf20 &&
        b.guidance.ring.geometry.parameters.innerRadius ===
          socketCue.geometry.parameters.innerRadius,
      "Step 24 Pause uses the same yellow ring style as the other action targets",
    );
    await button(b.looper, "pause");
    await wait(() => b.completed.has("playback"), "Physical Pause completes playback");
    check(b.looper.timeline.hasRecording(), "Pause retains the user’s phrase");
    await next("gap");
    await dragControl("gap", 1, () => b.objectives.has("gap"));
    const honkPosition = b.horn.root.position.clone();
    await dragControl("gap", -1, () => b.objectives.has("zero"));
    await next("second-record");
    const looperOffset = b.looper.root.position
      .clone()
      .sub(b.horn.root.position)
      .applyQuaternion(t.adapter.layoutRotation.clone().invert());
    check(
      b.horn.root.position.distanceTo(honkPosition) < 1e-6,
      "Step 26 leaves the Honk in its existing position",
    );
    check(
      Math.abs(looperOffset.z) < 1e-6 && looperOffset.length() < 0.6,
      "Step 26 keeps the second looper close beside the Honk at the same depth",
    );
    await button(b.looper, "record");
    await squeeze(350);
    send(right, "trigger", false);
    await delay(90);
    await button(b.looper, "stop");
    await next("shared-clock");
    await wire(
      b.guidance.target(),
      b.looper.tracks.find((track) => !track.connectedHonkId).nodeTarget,
    );
    await next("switch");
    const routes = r.metronomeConnectionManager;
    check(
      routes.getConnectionForTarget("looper", b.fixtures.get("chordLooper").id).portId ===
        routes.getConnectionForTarget("looper", b.fixtures.get("alternativeLooper").id).portId,
      "Shared-clock lesson connects both patterns to the same output",
    );
    await button(b.fixtures.get("chordLooper"), "play");
    await wait(() => b.objectives.has("first"), "First loop heard");
    await button(b.fixtures.get("alternativeLooper"), "play");
    await wait(() => b.completed.has("switch"), "Second loop is audible");
    await delay(1300);
    check(
      b.step.id === "switch" && b.fixtures.get("alternativeLooper").transport.playing,
      "Switch lesson keeps playing after completion",
    );
    for (const role of ["chordLooper", "alternativeLooper", "chordLooper", "alternativeLooper"]) {
      const pattern = b.fixtures.get(role);
      await button(pattern, "play");
      await wait(
        () => pattern.transport.playing && !pattern.looperData.queued,
        "Repeated switch to " + role,
      );
      check(b.step.id === "switch", "Repeated switching never advances or stops the lesson");
    }
    await b.action("next-step");
    await next("finale");
    const finale = await (
      await import("./validate-basics-finale-browser.mjs")
    ).validate(app, {
      prepared: true,
      onProgress: (stage) => (globalThis.basicsTestStage = "finale:" + stage),
    });
    await next("finish");
    check(
      b.completed.size === BASICS_STEPS.length - 1,
      "All music lessons completed without skips",
    );
    check(!t.panel.model.navigation.some((a) => /skip/i.test(a.label)), "No Skip control");
    send(right, "thumbstick", true);
    send(right, "thumbstick", false);
    check(
      b.objectives.size === 0 && t.navigation.menu.visible,
      "Right joystick does not pass menu lesson",
    );
    send(left, "thumbstick", true);
    await delay(50);
    check(!t.navigation.menu.visible && b.objectives.has("hide"), "Left joystick hides the menu");
    send(left, "thumbstick", false);
    send(left, "thumbstick", true);
    send(left, "thumbstick", false);
    await wait(
      () => b.completed.has("finish"),
      "Left joystick shows the menu and completes onboarding",
    );
    check(
      t.navigation.menu.visible && b.completed.size === BASICS_STEPS.length,
      "Every lesson completed through real input",
    );
    await b.enter(BASICS_STEPS.findIndex((step) => step.id === "playback"));
    await release();
    check(
      b.looper.timeline.hasRecording() && b.fixtures.get("metronome").playing,
      "Playback review restores recorded take and running clock",
    );
    await button(b.looper, "play");
    await wait(() => b.objectives.has("heard"), "Restored playback is audible");
    await delay(1000);
    check(b.step.id === "playback", "Repeating a completed playback lesson stays in review");
    await b.action("restart");
    await release();
    check(
      b.completed.size === 0 && b.fixtures.honks.length === 1 && r.instrumentRegistry.size === 1,
      "Restart cleans tutorial objects and begins with one horn",
    );
    // Check both compact canvas layout and XR ray targets at the working pose.
    t.panel.setXR(true);
    b.guidance.update(performance.now());
    t.panels.render(performance.now());
    check(
      t.panel.layout.every((region) => region.bottom <= region.limit),
      "Compact panel text fits",
    );
    check(
      t.panel.buttons.filter((node) => node.visible).length === 7,
      "All seven lesson/session controls exist in world space",
    );
    return {
      checks,
      reached: "finish",
      finale,
      lessons: BASICS_STEPS.map((s) => s.id),
      headsetTested: false,
      acousticListeningTested: false,
    };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    clearInterval(tick);
    await release();
    await t.navigation.enterPlay();
    if (!failure) {
      check(
        canonical(r.sceneSerializer.serialize()) === saved,
        "Exit restores pre-tutorial composition (transform tolerance 1e-8)",
      );
      check(
        r.instrumentRegistry.listeners.size === listenersBefore &&
          !b.guidance.ring.parent &&
          b.fixtures.owned.size === 0,
        "Exit removes owned objects, cues and registry listener",
      );
    }
    for (const c of controllers) {
      const i = r.controllers.indexOf(c);
      if (i >= 0) r.controllers.splice(i, 1);
      r.controllerStates.delete(c);
      c.removeFromParent();
    }
  }
}
