// DevTools: await (await import('/scripts/benchmark-manual-honks-browser.mjs')).benchmark()
// Run the identical script on both revisions. Uses real assets, raycasts,
// contact hysteresis, runtime input/performance, Web Audio nodes and rendering.
export async function benchmark({ frames = 60 } = {}) {
  const THREE = await import('three');
  const { createFaceOrchestraApp } = await import('/src/app/createFaceOrchestraApp.js');
  const results = [];
  for (const accompaniment of [false, true]) for (const locked of [false, true]) for (const count of [1, 3]) {
    const app = createFaceOrchestraApp({ container: document.createElement('div'),
      storage: { getItem() { return null; }, setItem() {}, removeItem() {} } });
    await app.initialize();
    const r = app.runtime;
    const honks = [];
    for (let i = 0; i < count; i++) {
      r.createSpawnedComponent('honk');
      const h = r.activeInstrumentState;
      const radius = h.getSqueezeColliderSphere().radius;
      h.root.position.set(i * radius * 1.4, 1, -0.5);
      honks.push(h);
    }
    r.scene.updateMatrixWorld(true);
    r.honkContactSystem.update(); r.honkContactSystem.update();
    if (locked && count > 1) r.lockConnectedChordStates(honks[0]);
    else honks[0].locked = locked;
    const controller = r.controllers[0];
    controller.matrixAutoUpdate = true;
    const state = r.controllerStates.get(controller);
    const point = () => {
      controller.position.copy(honks[0].getSqueezeColliderSphere().center);
      controller.position.z += 0.5;
      controller.quaternion.identity();
      controller.updateMatrixWorld(true);
    };
    point();
    if (r.getCurrentHit(controller)?.object !== honks[0].squeezeCollider) {
      throw new Error('Fixture must point at the registered squeeze sphere');
    }
    r.controllers[1].matrixAutoUpdate = true;
    r.controllers[1].position.set(10, 10, 10);
    let looper;
    if (accompaniment) {
      r.createSpawnedComponent('looper'); looper = r.activeInstrumentState;
      looper.root.position.set(-0.6, 1, -0.5);
      looper.connectTrack(0, honks[0].id);
      const add = (type, timeMs, extra) => looper.timeline.addActionEvent('track-0', { trackIndex: 0, type, timeMs, ...extra });
      add('squeezeStart', 0, { value: 1, gateOnly: true });
      add('gestureSnapshot', 0, { values: { squeeze: 1, bend: 0.4, vowel: 'A' } });
      add('squeezeEnd', 250, { value: 0, gateOnly: true });
      looper.timeline.finalizeDuration(); looper.timeline.durationMs = 500;
      looper.looperData.hasRecording = true;
      r.createSpawnedComponent('metronome');
      r.activeInstrumentState.root.position.set(0.8, 1, -0.5);
      r.activeInstrumentState.pressButton('play', performance.now());
      looper.play(performance.now());
    }
    const audio = r.audioSystem;
    const readyAt = performance.now(); await audio.ensureAudio();
    const readinessMs = performance.now() - readyAt;
    const context = audio.audioContextService.context;
    const counts = { generalQueries: 0, lockedQueries: 0, meshRaycasts: 0, rootMatrixUpdates: 0,
      rootWorldUpdates: 0, poseSwitches: 0, startRequests: 0, creations: 0, oscillators: 0, filters: 0, gains: 0 };
    const phases = {};
    const events = [];
    const restore = [];
    const wrap = (object, key, callback) => {
      const original = object[key]; object[key] = function (...args) { return callback(original.bind(this), args); };
      restore.push(() => { object[key] = original; });
    };
    for (const [key, name] of [['createOscillator', 'oscillators'], ['createBiquadFilter', 'filters'], ['createGain', 'gains']]) {
      wrap(context, key, (fn, args) => { counts[name]++; return fn(...args); });
    }
    wrap(r.raycastSystem, 'getCurrentHit', (fn, args) => { counts.generalQueries++; return fn(...args); });
    wrap(r.raycastSystem, 'getLockedInstrumentFromRay', (fn, args) => { counts.lockedQueries++; return fn(...args); });
    for (const h of honks) {
      wrap(h.root, 'updateMatrixWorld', (fn, args) => { counts.rootMatrixUpdates++; return fn(...args); });
      wrap(h.root, 'updateWorldMatrix', (fn, args) => { if (args[1]) counts.rootWorldUpdates++; return fn(...args); });
      wrap(h, 'withInteractionPose', (fn, args) => {
        if (!h.interactionPoseActive && h.honkPresentation && (h.honkVisualRoot.scale.x !== 1 ||
          h.honkPresentation.squeeze !== h.hornSqueezeValue || h.honkPresentation.bend !== h.bendValue)) counts.poseSwitches++;
        return fn(...args);
      });
      for (const mesh of h.gripTargetList) wrap(mesh, 'raycast', (fn, args) => { counts.meshRaycasts++; return fn(...args); });
      wrap(h, 'startAudioVoice', (fn, args) => { counts.startRequests++; return fn(...args); });
    }
    wrap(audio.honkVoices, 'createVoice', (fn, args) => {
      const begin = performance.now(); const voice = fn(...args); counts.creations++;
      const event = { createdMs: begin, nodeCreationMs: performance.now() - begin };
      events.push(event);
      const start = voice.start.bind(voice); voice.start = (...values) => {
        event.voiceId = [...audio.honkVoices.voices].find(([, candidate]) => candidate === voice)?.[0];
        event.onset = values[0] ?? context.currentTime; event.dispatchMs = performance.now(); return start(...values);
      };
      const release = voice.release.bind(voice); voice.release = (...values) => {
        event.release = context.currentTime; return release(...values);
      };
      return voice;
    });
    const measure = (name, fn) => {
      const start = performance.now(); const value = fn();
      (phases[name] ||= []).push(performance.now() - start); return value;
    };
    const samples = [];
    let inputMs;
    try {
      for (let frame = 0; frame < frames; frame++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        const down = frame % 20 === 0;
        if (down) { point(); state.trigger = true; inputMs = now; measure('input', () => r.handleTriggerBeginIntent(controller)); }
        if (frame % 20 === 15) { state.trigger = false; measure('release', () => r.handleTriggerEndIntent(controller)); }
        // Move C out/back during the second note; leave A-B intact.
        if (count === 3 && !locked && frame === 25) honks[2].root.position.x += 2;
        if (count === 3 && !locked && frame === 31) honks[2].root.position.x -= 2;
        r.scene.updateMatrixWorld(true);
        measure('hover', () => r.updateRaycastHover());
        measure('contacts', () => r.honkContactSystem.update());
        measure('relationships', () => { r.updateLockedHonkGroupTransforms(); r.updateMetronomes(now); r.updateClockedLooperTransports(now); r.updateMetronomeConnections(now); });
        measure('performance', () => r.updateHorn(now));
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        measure('render', () => app.sceneRuntime.render());
        samples.push({ frame, inputMs, revision: r.honkContactGraph.revision,
          members: r.getTouchingInstrumentChain(honks[0]).length,
          squeeze: honks.map(h => h.processedLivePerformance?.squeeze), cpuMs: performance.now() - now });
      }
      state.trigger = false; r.handleTriggerEndIntent(controller);
      const heldCounts = { ...counts };
      // A controlled discontinuity measures the costly authoritative/visible
      // pose difference independently of display cadence and playback phase.
      for (const h of honks) {
        h.resetLivePerformance();
        h.setAutomationLayer('profile-transition', { squeeze: 1, bend: 0.5 });
      }
      r.applyResolvedHonkPerformanceStates(performance.now());
      for (const h of honks) h.clearAutomationLayer('profile-transition');
      r.applyResolvedHonkPerformanceStates(performance.now() + 1000 / 60);
      const transitionBefore = { ...counts };
      const transitionStart = performance.now();
      for (let i = 0; i < 10; i++) r.getGripHit(controller);
      const transitionQueries = { cpuMs: performance.now() - transitionStart,
        counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value - transitionBefore[key]])) };
      const summary = values => {
        const sorted = [...values].sort((a, b) => a - b);
        return { total: values.reduce((a, b) => a + b, 0), p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)] };
      };
      results.push({ count, locked, accompaniment, frames, readinessMs, counts: heldCounts, transitionQueries,
        phases: Object.fromEntries(Object.entries(phases).map(([key, values]) => [key, summary(values)])),
        frameCPU: summary(samples.map(s => s.cpuMs)), events, samples,
        drawCalls: app.sceneRuntime.renderer.info.render.calls });
    } finally {
      for (const undo of restore.reverse()) undo();
      looper?.stop(); app.dispose(); await context.close();
    }
  }
  return { three: THREE.REVISION, userAgent: navigator.userAgent, results };
}
