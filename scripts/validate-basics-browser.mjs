// Browser integration: real rays, semantic input, contact physics and Web Audio.
// No direct objective awards, fabricated timelines or overwritten hit results.
export async function validate(app, { isolationOnly = false } = {}) {
  const THREE = await import('three');
  const { BASICS_STEPS } = await import('../src/tutorial/basicsSteps.js');
  const r = app.runtime, t = r.tutorial;
  // Software-rendered headless frames are too slow for controller timing.
  // Drive the unchanged frame scheduler at real wall time, rendering separately.
  app.stopCompute();
  const tick = setInterval(() => app.update(.016, 0, performance.now()), 16);
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (predicate, message, timeout = 7000) => {
    const end = performance.now() + timeout;
    while (!predicate()) {
      if (performance.now() > end) throw new Error(message + ' at ' + t.basics?.step.id + ': ' + JSON.stringify(t.basics?.model()));
      await delay(20);
    }
  };
  await t.action('play');
  r.createSpawnedComponent('honk', { name: 'Protected composition', baseScale: 1.6 });
  const seed = r.activeInstrumentState; seed.setVowel('E'); seed.root.position.set(3, 1, -2);
  const canonical = scene => JSON.stringify(scene, (_, value) => typeof value === 'number' ? Number(value.toFixed(8)) : value);
  const saved = canonical(r.sceneSerializer.serialize());
  const listenersBefore = r.instrumentRegistry.listeners.size;
  await t.action('basics');
  const b = t.basics;
  check(b && !t.uiFeedback, 'Basics starts');
  check(b.fixtures.honks.length === 1 && r.instrumentRegistry.size === 1, 'Exactly one default horn');
  if (isolationOnly) {
    await t.enterPlay(); clearInterval(tick);
    return { before: JSON.parse(saved), after: r.sceneSerializer.serialize() };
  }
  // New Object3Ds act as tracked controller poses; all input goes through the
  // existing mapper/coordinator. They are learner-origin, not demo controllers.
  const controllers = [0, 1].map(i => {
    const c = new THREE.Group(); c.userData.controllerId = 'basics-browser-' + i;
    c.userData.handedness = i ? 'left' : 'right';
    c.userData.tutorialOrigin = 'learner';
    c.userData.radialMenu = r.createRadialMenu(); c.add(c.userData.radialMenu);
    r.scene.add(c); r.controllers.push(c); r.interactionCoordinator.registerController(c);
    return c;
  });
  const [right, left] = controllers;
  const send = (c, button, pressed) => r.interactionCoordinator.receiveInput({
    type: 'button.transition', controller: c, handedness: c.userData.handedness,
    button, pressed, timestamp: performance.now(),
  });
  const axis = (direction) => r.interactionCoordinator.receiveInput({
    type: 'axis.step', controller: right, handedness: 'right', axis: 'thumbstickX', direction, timestamp: performance.now(),
  });
  const away = c => { c.position.set(5, 2, 2); c.quaternion.identity(); c.updateMatrixWorld(true); };
  const point = (target, c = right, grip = false) => {
    if (!target) throw new Error('Missing target at ' + b.step.id);
    target.updateWorldMatrix(true, false);
    const center = target.getWorldPosition(new THREE.Vector3());
    const size = target.geometry?.boundingSphere?.radius || 0;
    for (const offset of [[0, 0, .6], [0, .16, .45], [.22, 0, .4], [-.22, 0, .4], [0, -.16, .4], [0, 0, .12]]) {
      c.position.copy(center).add(new THREE.Vector3(...offset));
      c.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(c.position, center, new THREE.Vector3(0, 1, 0)));
      c.updateMatrixWorld(true);
      const hit = grip ? r.getGripHit(c) : r.getCurrentHit(c);
      if (grip ? r.instrumentRegistry.getFromObject3D(hit?.object) === r.instrumentRegistry.getFromObject3D(target) : hit?.object === target) return;
    }
    throw new Error('Ray cannot reach ' + target.name + ' size ' + size + ' at ' + b.step.id);
  };
  const release = async () => {
    for (const c of controllers) { for (const key of ['trigger', 'grip', 'primary', 'secondary']) send(c, key, false); away(c); }
    axis(0); await delay(90);
  };
  const next = async id => {
    globalThis.basicsTestStage = id;
    await wait(() => b.step.id === id && !b.setup, 'Auto advance to ' + id);
    await release();
    const old = b.index; await b.action('next-step');
    check(b.index === old, id + ': unfinished Next is blocked');
  };
  const squeeze = async (ms = 280) => { point(b.horn.squeezeCollider); send(right, 'trigger', true); await delay(ms); };
  const clickTarget = async (target, c = right) => {
    point(target, c); send(c, 'trigger', true); await delay(35); send(c, 'trigger', false); away(c); await delay(65);
  };
  const grab = async (h = b.horn) => { point(h.squeezeCollider, right, true); send(right, 'grip', true); await delay(50); };
  const move = async (delta) => { right.position.add(new THREE.Vector3(...delta)); right.updateMatrixWorld(true); await delay(160); };
  const button = (l, action) => clickTarget(l.hitTargets['HIT_looper_' + action]);
  const dragEar = async (side, direction) => {
    point(b.horn.hitTargets[side === 'left' ? 'HIT_leftEar' : 'HIT_rightEar'], left);
    send(left, 'trigger', true); await delay(45);
    left.position.y += direction * .08; left.updateMatrixWorld(true); await delay(180);
    if (b.step.id === 'ears' && b.objectives.size === 0) throw new Error('Ear evidence: ' + JSON.stringify({
      value: b.horn.getEarAmount(side), live: b.horn.getLivePerformanceState(), fresh: b.fresh.get(left) && {
        trigger: b.fresh.get(left).trigger, parameter: b.fresh.get(left).parameter, objective: b.fresh.get(left).objective,
      }, interaction: r.controllerStates.get(left).activeTriggerInteraction && {
        type: r.controllerStates.get(left).activeTriggerInteraction.type, side: r.controllerStates.get(left).activeTriggerInteraction.side,
        dragStartMorphValue: r.controllerStates.get(left).activeTriggerInteraction.dragStartMorphValue,
        startY: r.controllerStates.get(left).activeTriggerInteraction.dragStartY, y: left.position.y,
        min: r.controllerStates.get(left).activeTriggerInteraction.sphere?.userData.minY,
        max: r.controllerStates.get(left).activeTriggerInteraction.sphere?.userData.maxY,
      },
    }));
    send(left, 'trigger', false); away(left); await delay(70);
  };
  const wire = async (from, to) => {
    point(from); send(right, 'trigger', true); await delay(70);
    point(to); await delay(100); send(right, 'trigger', false); away(right); await delay(150);
  };
  let failure;
  try {
    globalThis.basicsTestStage = 'honk';
    await release();
    const snapshot = JSON.stringify(r.sceneSerializer.serialize());
    await b.action('step-help'); await delay(200);
    check(b.completed.size === 0 && snapshot === JSON.stringify(r.sceneSerializer.serialize()), 'Help cannot mutate instruments or earn completion');
    await b.action('next-step'); check(b.index === 0, 'First step cannot be skipped');
    await squeeze();
    await wait(() => b.step.id === 'bend', 'Honk advances');
    await delay(300);
    check(!b.completed.has('bend'), 'Held trigger cannot complete next step');
    await release(); await squeeze();
    right.rotation.z += .22; right.updateMatrixWorld(true); await delay(250);
    await next('move');
    await grab(); await move([.025, 0, 0]); check(!b.completed.has('move'), 'Movement jitter ignored');
    await move([.12, 0, 0]);
    await next('rotate'); await grab();
    right.rotation.z += .4; right.updateMatrixWorld(true); await delay(180);
    await next('small'); await grab();
    for (let i = 0; i < 9 && !b.completed.has('small'); i++) { axis(-1); axis(0); await delay(45); }
    await next('big'); await grab();
    for (let i = 0; i < 32 && !b.completed.has('big'); i++) { axis(1); axis(0); await delay(45); }
    await next('ears');
    check(Math.abs(b.horn.baseScale - 2.5) < .02, 'Maximum size returns to working size');
    for (const [side, direction] of [['left', 1], ['left', -1], ['right', 1], ['right', -1]]) await dragEar(side, direction);
    await next('pitch'); await squeeze();
    right.rotation.z += .22; right.updateMatrixWorld(true); await delay(220);
    check(b.objectives.has('bend') && !b.completed.has('pitch'), 'Combined pitch requires both objectives');
    await dragEar('left', 1);
    await next('volume'); await squeeze();
    for (const direction of [1, -1]) {
      point(b.horn.hitTargets.HIT_nose, left); send(left, 'trigger', true); await delay(45);
      left.position.y += direction * .08; left.updateMatrixWorld(true); await delay(180);
      send(left, 'trigger', false); away(left); await delay(70);
    }
    await next('vowels');
    for (let i = 0; i < 5; i++) await clickTarget(b.horn.hitTargets.HIT_mouth, left);
    check(b.objectives.size === 0, 'Cycling vowels silently earns no credit');
    for (let i = 0; i < 5; i++) {
      await squeeze(); send(right, 'trigger', false); away(right); await delay(70);
      if (i < 4) await clickTarget(b.horn.hitTargets.HIT_mouth, left);
    }
    await next('duplicate'); await grab(); send(right, 'primary', true); await delay(100); send(right, 'primary', false);
    await next('chord'); await grab(); send(right, 'primary', true); await delay(70); send(right, 'primary', false); await delay(70);
    check(b.fixtures.honks.length === 3, 'Grip+A creates the third real horn');
    send(right, 'primary', true); send(right, 'primary', false); check(b.fixtures.honks.length === 3, 'Extra duplicates capped');
    await move([0, .25, 0]);
    await release();
    // Move each member using the real grip system into squeeze-sphere overlap.
    const center = b.horn.root.position.clone();
    for (const h of b.fixtures.honks.slice(1)) {
      await grab(h); const delta = center.clone().sub(h.root.position); await move(delta.toArray()); await release();
    }
    await squeeze();
    await next('freeze'); point(b.horn.squeezeCollider); send(right, 'secondary', true); await delay(50); send(right, 'secondary', false);
    await grab(); await move([.16, 0, 0]);
    await next('unfreeze');
    check(Boolean(r.honkLockService.getGroupForMember(b.horn.id)), 'Frozen group survives transition');
    point(b.horn.squeezeCollider); send(right, 'secondary', true); await delay(50); send(right, 'secondary', false);
    await next('clear'); send(left, 'primary', true); await delay(50); send(left, 'primary', false);
    await next('create');
    check(b.fixtures.honks.length === 0, 'X clears only tutorial horns');
    const completedBefore = b.completed.size;
    await b.action('previous-step'); await b.action('previous-step');
    check(b.step.id === 'unfreeze' && r.honkLockService.getGroupForMember(b.horn.id), 'Back restores frozen unfreeze fixture');
    await delay(1100); check(b.step.id === 'unfreeze', 'Completed revisit never automatically advances');
    check(b.completed.size === completedBefore, 'Fixture restore preserves completion history');
    await b.action('next-step'); await b.action('next-step'); await release();
    // The ordinary catalog preview is placed with a fresh trigger; no direct spawn.
    right.position.copy(t.adapter.anchor).add(new THREE.Vector3(0, 0, .6)); right.quaternion.identity(); right.updateMatrixWorld(true);
    send(right, 'primary', true); await delay(70);
    // Select by rolling and pulling through the ordinary menu.
    const state = r.controllerStates.get(right);
    check(state.radialMenuOpen, 'A opens normal creation menu');
    const categories = r.spawnCatalog.getRadialCategories();
    const category = categories.findIndex(item => item.entries.some(entry => entry.id === 'honk'));
    const rollTo = predicate => {
      const start = right.rotation.z;
      for (let i = 0; i < 720; i++) {
        right.rotation.z = start + i * .015; right.updateMatrixWorld(true); r.spawnMenuController.update(right, state);
        if (predicate()) return;
      }
      throw new Error('Cannot select Honk in radial menu');
    };
    rollTo(() => state.radialMenuParentSelectedIndex === category);
    right.position.addScaledVector(state.radialMenuPullAxis, .08); right.updateMatrixWorld(true); r.spawnMenuController.update(right, state);
    rollTo(() => categories[category].entries[state.radialMenuChildSelectedIndex]?.id === 'honk');
    send(right, 'primary', false);
    check(Boolean(r.pendingSpawnPlacement), 'Roll/pull/release creates ordinary Honk preview');
    right.quaternion.identity(); right.updateMatrixWorld(true);
    await delay(90); send(right, 'trigger', true); await delay(50); send(right, 'trigger', false);
    await next('metronome');
    await clickTarget(b.guidance.target());
    await next('bpm');
    const m = b.fixtures.get('metronome'), control = m.handleRig.controls.get('bpm');
    // Real ray drag around the authored handle arc.
    point(b.guidance.target()); send(right, 'trigger', true); await delay(50);
    for (let i = 0; i < 8 && !b.tempoChanged; i++) await move([.035, .03, 0]);
    send(right, 'trigger', false);
    await next('length');
    const dragControl = async (name, sign, until) => {
      point(b.looper.hitTargets['HIT_looper_' + name]); send(right, 'trigger', true); await delay(50);
      for (let i = 0; i < 40 && !until(); i++) await move([0, sign * .006, 0]);
      send(right, 'trigger', false); away(right); await delay(70);
    };
    await dragControl('recordLength', -1, () => b.looper.looperData.recordBeats === 4);
    await next('wire-horn');
    await wire(b.looper.tracks[0].nodeTarget, b.horn.hitTargets.HIT_honkConnection);
    await next('wire-clock');
    await wire(b.guidance.target(), b.looper.tracks.find(track => !track.connectedHonkId).nodeTarget);
    await next('record'); await button(b.looper, 'record');
    await delay(350); check(!b.completed.has('record'), 'Armed silence does not complete recording');
    await squeeze(420); send(right, 'trigger', false);
    await next('playback'); await button(b.looper, 'play');
    await wait(() => b.objectives.has('heard'), 'Recorded phrase actually sounds');
    await button(b.looper, 'stop');
    await next('gap');
    await dragControl('gap', 1, () => b.objectives.has('gap'));
    await dragControl('gap', -1, () => b.objectives.has('zero'));
    await next('second-record'); await button(b.looper, 'record'); await squeeze(350); send(right, 'trigger', false);
    await next('shared-clock');
    await wire(b.guidance.target(), b.looper.tracks.find(track => !track.connectedHonkId).nodeTarget);
    await next('switch');
    await button(b.fixtures.get('chordLooper'), 'play'); await wait(() => b.objectives.has('first'), 'First loop heard');
    await button(b.fixtures.get('alternativeLooper'), 'play');
    await next('strike');
    away(right); send(right, 'grip', true); await delay(100);
    check(r.controllerStates.get(right).stickActive, 'Empty-space Grip equips the real stick');
    const { TutorialStrikeTargets } = await import('../src/tutorial/TutorialStrikeTargets.js');
    const strikeTargets = new TutorialStrikeTargets(t.adapter);
    const pointOnBody = strikeTargets.get('basic').clone();
    const stick = r.stickEquipmentSystem.getEquippedStick(right.userData.controllerId);
    right.position.set(0, 0, 0); right.quaternion.identity(); right.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(stick.collider);
    const offset = bounds.getCenter(new THREE.Vector3()), halfZ = (bounds.max.z - bounds.min.z) / 2;
    const stroke = async approach => {
      right.position.copy(pointOnBody).sub(offset); right.position.z += halfZ + (1 - approach) * .32 - .035;
      right.updateMatrixWorld(true); await delay(90);
    };
    await stroke(0); await stroke(1); await delay(150);
    check(b.objectives.size === 0, 'Lingering stick contact does not count as a withdrawn strike');
    await stroke(0); await wait(() => b.objectives.has('first'), 'First real strike');
    await stroke(1); await stroke(0);
    await next('finish');
    check(b.completed.size === BASICS_STEPS.length - 1, 'All action lessons completed without skips');
    check(!t.panel.model.navigation.some(a => /skip/i.test(a.label)), 'No Skip control');
    await b.enter(BASICS_STEPS.findIndex(step => step.id === 'playback')); await release();
    check(b.looper.timeline.hasRecording() && b.fixtures.get('metronome').playing, 'Playback review restores recorded take and running clock');
    await button(b.looper, 'play'); await wait(() => b.objectives.has('heard'), 'Restored playback is audible');
    await delay(1000); check(b.step.id === 'playback', 'Repeating a completed playback lesson stays in review');
    await b.action('restart'); await release();
    check(b.completed.size === 0 && b.fixtures.honks.length === 1 && r.instrumentRegistry.size === 1, 'Restart cleans tutorial objects and begins with one horn');
    // Check both compact canvas layout and XR ray targets at the working pose.
    t.panel.setXR(true); b.guidance.update(performance.now()); t.render(performance.now());
    check(t.panel.layout.every(region => region.bottom <= region.limit), 'Compact panel text fits');
    check(t.panel.buttons.filter(node => node.visible).length === 7, 'All seven lesson/session controls exist in world space');
    return { checks, reached: 'finish', lessons: BASICS_STEPS.map(s => s.id), headsetTested: false, acousticListeningTested: false };
  } catch (error) {
    failure = error; throw error;
  } finally {
    clearInterval(tick);
    await release();
    await t.enterPlay();
    if (!failure) {
      check(canonical(r.sceneSerializer.serialize()) === saved, 'Exit restores pre-tutorial composition (transform tolerance 1e-8)');
      check(r.instrumentRegistry.listeners.size === listenersBefore && !b.guidance.ring.parent && b.fixtures.owned.size === 0,
        'Exit removes owned objects, cues and registry listener');
    }
    for (const c of controllers) {
      const i = r.controllers.indexOf(c); if (i >= 0) r.controllers.splice(i, 1);
      r.controllerStates.delete(c); c.removeFromParent();
    }
  }
}
