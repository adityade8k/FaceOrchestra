import * as THREE from "three";
import { PresentationCapture } from "../src/capture/PresentationCapture.js";

export async function validate(app) {
  const r = app.runtime,
    t = r.tutorial,
    checks = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (fn, ms = 12000) => {
    const start = performance.now();
    while (!fn()) {
      if (performance.now() - start > ms)
        throw new Error(`Timed out: ${fn} · ${t.kuch?.feedback}`);
      await wait(15);
    }
  };
  let oldInput;
  try {
    await t.enterPlay();
    await r.audioSystem.ensureAudio();
    const playCount = r.instrumentRegistry.size;
    await t.action("tutorials");
    await t.action("composition:kuch-to-hua-hai");
    check(
      t.panel.model.actions.some((a) => a.id === "composition-quick-practice"),
      "Kuch entry offers prepared full-song practice",
    );
    let releaseLoad;
    const load = t.catalog.load.bind(t.catalog);
    t.catalog.load = async (...args) => {
      await new Promise((resolve) => {
        releaseLoad = resolve;
      });
      return load(...args);
    };
    const cancelled = t.action("composition-quick-practice");
    await until(() => releaseLoad);
    await t.action("back");
    releaseLoad();
    await cancelled;
    t.catalog.load = load;
    check(
      !t.kuch && !t.jogRecording,
      "Cancelled asynchronous preparation cannot create a stale practice scene",
    );
    await t.action("tutorials");
    await t.action("composition:kuch-to-hua-hai");
    await Promise.all([
      t.action("composition-quick-practice"),
      t.action("composition-quick-practice"),
    ]);
    const k = t.kuch,
      a = t.adapter,
      metro = a.get("metronome"),
      roles = ["chordLooper", "alternativeLooper", "percussionLooper"];
    check(
      k?.step.id === "performance" && k.ready() && !k.running,
      "Quick entry is ready immediately without demonstrating or starting playback",
    );
    check(
      metro.bpm === 60 && !r.capture.active && !t.jogRecording,
      "Fresh quick practice is 60 BPM with melody live and no MR take",
    );
    check(
      r.instrumentRegistry.getByKind("metronome").length === 1 &&
        r.instrumentRegistry.getByKind("looper").length === 3,
      "One metronome and exactly three backing loopers",
    );
    check(
      Object.keys(k.results).length === 0,
      "Preparation awards no skipped lesson credit",
    );
    const routes = roles.map((role) =>
      r.metronomeConnectionManager.getConnectionForTarget(
        "looper",
        a.get(role).id,
      ),
    );
    check(
      routes[0].portId === routes[1].portId &&
        routes[0].portId !== routes[2].portId,
      "Chord alternatives share an exclusive output; percussion has a separate output",
    );
    const identities = [...r.instrumentRegistry.values()]
        .map((h) => h.id)
        .join(","),
      takes = roles.map((role) =>
        JSON.stringify(a.get(role).timeline.toJSON()),
      );
    for (const role of roles) {
      const h = a.get(role);
      check(
        h.timeline.fixedWindowBeats === 16 && h.timeline.hasRecording(),
        `${role} contains a real compiled sixteen-beat pattern`,
      );
    }
    const control = t.panel.tempoControls;
    check(
      control.input.type === "range" &&
        control.input.min === "40" &&
        control.input.max === "92" &&
        control.input.step === "1",
      "Desktop uses a native keyboard-operable 40–92 range",
    );
    control.input.value = "70";
    control.input.dispatchEvent(new Event("input"));
    check(metro.bpm === 60, "Slider preview leaves audio unchanged");
    control.input.dispatchEvent(new Event("change"));
    await wait(30);
    check(
      metro.bpm === 70 && k.selectedBpm() === 70,
      "Slider commits directly to session tempo and metronome",
    );
    metro.setBpm(80);
    check(
      k.selectedBpm() === 80 && t.panel.model.practiceTempo.bpm === 80,
      "Direct metronome changes use the same practice action",
    );
    k.setPracticeTempo(40);
    await t.action("step-practice");
    check(
      k.timing.bpm === 40 &&
        k.guide.beatMs === 1500 &&
        Math.abs(k.anchor - metro.beatOriginMs - 6000) < 1,
      "40 BPM attempt clock and backing share an exact six-second count-in",
    );
    const firstAnchor = k.anchor;
    let starts = 0;
    const start = k.start.bind(k);
    k.start = (...args) => {
      starts++;
      return start(...args);
    };
    control.input.value = "70";
    control.input.dispatchEvent(new Event("input"));
    control.input.value = "80";
    control.input.dispatchEvent(new Event("input"));
    control.input.dispatchEvent(new Event("change"));
    await wait(30);
    check(
      starts === 1 &&
        k.anchor !== firstAnchor &&
        k.timing.bpm === 80 &&
        !Object.keys(k.results).length,
      "Active tempo commit produces one restart and no failed outcome",
    );
    check(
      roles.every(
        (role, i) => JSON.stringify(a.get(role).timeline.toJSON()) === takes[i],
      ),
      "Repeated tempo changes preserve source timestamps and all backing takes",
    );
    check(
      [...r.instrumentRegistry.values()].map((h) => h.id).join(",") ===
        identities,
      "Retry and tempo changes reuse the prepared scene",
    );
    await until(
      () => roles.filter((role) => a.get(role).transport.playing).length === 2,
    );
    check(
      a.get("chordLooper").transport.playing &&
        a.get("percussionLooper").transport.playing &&
        !a.get("alternativeLooper").transport.playing,
      "Count-in launches chord and percussion together through the real transport",
    );
    check(
      roles.every(
        (role) =>
          Math.abs(
            a.get(role).timeline.durationMs /
              a
                .get(role)
                .looperController.getPlaybackRate(
                  a.get(role),
                  performance.now(),
                ) -
              12000,
          ) < 0.01,
      ),
      "92 BPM source loops play sixteen beats at 80 BPM without rescaling data",
    );
    k.setPracticeTempo(40);
    check(
      k.timing.bpm === 40 &&
        k.guide.beatAt(performance.now()) < -3.8 &&
        roles.every((role) => !a.get(role).transport.playing),
      "Changing tempo after backing starts cancels sounding playback and queues a fresh count-in",
    );
    await until(
      () =>
        a.get("chordLooper").transport.playing &&
        a.get("percussionLooper").transport.playing,
    );
    check(
      roles.every(
        (role) =>
          Math.abs(
            a.get(role).timeline.durationMs /
              a
                .get(role)
                .looperController.getPlaybackRate(
                  a.get(role),
                  performance.now(),
                ) -
              24000,
          ) < 0.01,
      ),
      "Real backing transport plays sixteen beats in 24 seconds at 40 BPM",
    );
    k.cancel();

    // Exercise world-panel ray capture with an application controller, without
    // claiming a physical headset. The entire drag is synchronous between frames.
    t.panel.setXR(true);
    t.menu.setVisible(true);
    t.render(performance.now());
    const c = r.controllers.find((c) => !c.userData.virtualTutorial),
      state = r.controllerStates.get(c);
    oldInput = {
      c,
      position: c.position.clone(),
      quaternion: c.quaternion.clone(),
      gamepad: c.userData.gamepad,
      trigger: state.trigger,
      panelPosition: t.panel.group.position.clone(),
    };
    c.userData.gamepad = {};
    // Put the movable panel clear of the ensemble; its left endpoint otherwise
    // sits behind an instrument collider and correctly loses the nearest hit.
    t.panel.group.position.x -= 3;
    const aim = (fraction) => {
      const point = control.group.localToWorld(
        new THREE.Vector3((80 + fraction * 912 - 536) * control.scaleX, 0, 0),
      );
      const q = control.group.getWorldQuaternion(new THREE.Quaternion());
      c.position
        .copy(point)
        // Place the synthetic ray just in front of the panel so instruments in
        // the practice layout do not occlude the slider's minimum endpoint.
        .add(new THREE.Vector3(0, 0, 0.03).applyQuaternion(q));
      c.quaternion.copy(q);
      c.updateMatrix();
      c.updateMatrixWorld(true);
    };
    t.panel.group.updateMatrixWorld(true);
    aim(0.3125);
    state.trigger = true;
    check(
      t.panelHit(c)?.object.userData.practiceSlider,
      "XR ray hits the slider on its actual panel: " +
        JSON.stringify({
          hit: t.panelHit(c)?.object.userData,
          visible: t.panel.group.visible,
          target: control.slider
            .getWorldPosition(new THREE.Vector3())
            .toArray(),
          controller: c.getWorldPosition(new THREE.Vector3()).toArray(),
        }),
    );
    t.menu.capture({ type: "interaction.trigger.begin", controller: c }, state);
    aim(1.5);
    t.menu.update();
    check(
      control.preview === 92 && t.blocksController(c),
      "XR drag clamps at 92 and exclusively captures musical input",
    );
    state.trigger = false;
    t.menu.capture({ type: "interaction.trigger.end", controller: c }, state);
    check(
      metro.bpm === 92 && !t.menu.sliderDrag,
      "XR trigger release commits the tempo",
    );
    aim(0);
    state.trigger = true;
    t.menu.capture({ type: "interaction.trigger.begin", controller: c }, state);
    check(
      t.menu.sliderDrag === c,
      "Hide cancellation begins with a captured slider drag",
    );
    t.menu.setVisible(false);
    state.trigger = false;
    t.menu.capture({ type: "interaction.trigger.end", controller: c }, state);
    check(
      metro.bpm === 92 && control.preview === null,
      "Hiding cancels an uncommitted XR drag",
    );
    t.menu.setVisible(true);
    t.panel.group.updateMatrixWorld(true);
    aim(0);
    check(
      t.menu.hit(c)?.object.userData.practiceSlider,
      "Reopened slider receives an unobstructed ray at its minimum",
    );
    state.trigger = true;
    t.menu.capture({ type: "interaction.trigger.begin", controller: c }, state);
    aim(-0.5);
    t.menu.update();
    check(
      control.preview === 40,
      "XR dragging below the track clamps at 40 BPM",
    );
    state.trigger = false;
    t.menu.capture({ type: "interaction.trigger.end", controller: c }, state);
    check(
      metro.bpm === 40 && k.selectedBpm() === 40,
      "XR release applies 40 BPM to the complete practice transport",
    );
    c.position.copy(oldInput.position);
    c.quaternion.copy(oldInput.quaternion);
    c.updateMatrix();
    c.userData.gamepad = oldInput.gamepad;
    state.trigger = oldInput.trigger;
    t.panel.group.position.copy(oldInput.panelPosition);
    t.panel.group.updateMatrixWorld(true);
    oldInput = null;
    t.panel.setXR(false);
    t.menu.setVisible(true);

    // Real virtual-controller demonstration drives both canonical audio and gauge.
    k.index = k.steps.findIndex((s) => s.id === "bend-intro");
    k.applyTempo();
    await t.action("step-demo");
    await until(() => t.cues.gauge.state?.preview);
    const previewPosition = t.cues.gauge.expected.position.clone();
    const previewRing = t.cues.pool.find((p) => p.green.visible);
    const previewScale = previewRing.green.scale.x;
    check(
      t.cues.gauge.state.required === 0 &&
        t.cues.gauge.state.actual === null &&
        !t.cues.pool.some((p) => p.yellow.visible),
      "Bend gauge appears with green preparation, without early yellow or borrowed actual input",
    );
    await wait(65);
    check(
      previewRing.green.scale.x < previewScale &&
        t.cues.gauge.expected.position.distanceTo(previewPosition) < 1e-10,
      "Green steadily shrinks while the preview bend target stays at its starting pitch",
    );
    await until(() => t.cues.gauge.state && !t.cues.gauge.state.preview);
    check(
      t.cues.pool.some((p) => p.yellow.visible) &&
        t.cues.gauge.state.required === 0,
      "Yellow begins growing after attack before the bend target starts rotating",
    );
    await until(
      () =>
        t.cues.gauge.state?.demonstration && t.cues.gauge.state.required > 0.7,
    );
    const gauge = t.cues.gauge,
      observed = a.gestures.get(a.virtuals[0]),
      h = r.instrumentRegistry.get(observed.targetId);
    check(
      Math.abs(
        gauge.state.actual - h.getProcessedLivePerformanceState().bend * 4,
      ) < 0.001,
      "Gauge actual equals the sounded processed live bend of its real owner",
    );
    check(
      gauge.root.userData.binding.targetId === h.id &&
        gauge.root.userData.binding.gestureId === observed.id,
      "Gauge binds the live target and gesture owner",
    );
    t.menu.setVisible(false);
    await wait(25);
    check(gauge.root.visible, "Menu hiding preserves performer bend guidance");
    for (const includeUI of [false, true]) {
      const capture = new PresentationCapture(r, () => {}, { includeUI });
      const sample = capture.sample(0);
      capture.recycle(sample.buffer);
      check(
        capture.ids.has(gauge.root) === includeUI,
        includeUI
          ? "Explicit UI capture includes guidance"
          : "Clean MR excludes the gauge",
      );
    }
    k.cancel();
    check(
      !gauge.root.visible && !Object.keys(k.results).length,
      "Cancellation resets gauge and demonstrations award no learner credit",
    );
    t.menu.setVisible(true);
    k.quickPractice();
    const beforeTake = k.take("chordLooper");
    k.quickPractice();
    check(
      JSON.stringify(k.take("chordLooper")) === JSON.stringify(beforeTake),
      "Shortcut preserves an existing compatible backing take",
    );
    check(
      [...r.instrumentRegistry.values()].map((h) => h.id).join(",") ===
        identities,
      "Repeated shortcut does not respawn instruments",
    );
    await t.action("step-practice");
    r.deleteInstrument(a.get(k.phase.events[0].role));
    await wait(30);
    check(
      !k.running && !gauge.root.visible,
      "Deleting a required target cancels the attempt and leaves no stale gauge",
    );
    await t.enterPlay();
    check(
      !t.kuch && r.instrumentRegistry.size === playCount,
      "Exit restores the Play workspace",
    );
    await t.selectComposition("kuch-to-hua-hai", "record-songs");
    const recording = t.jogRecording;
    recording.ensemble.prepare();
    recording.ensemble.validate();
    check(
      recording.ensemble.layout.constructor.name === "KuchLayout" && !t.kuch,
      "Record Songs shares the layout and backing service without a second tutorial instance",
    );
    const now = performance.now(),
      ensemble = recording.ensemble;
    ensemble.schedule({
      countAt: now,
      beatZero: now + 4000,
      wallNow: now,
      audioNow: r.audioSystem.getCurrentTime(),
      bpm: 60,
    });
    check(
      ensemble.timing.beatMs === 1000 && a.get("metronome").bpm === 60,
      "Ensemble scheduling accepts explicit session tempo",
    );
    a.get("metronome").setBpm(80);
    check(
      a.get("metronome").bpm === 60,
      "An active scheduled performance ignores manual tempo changes",
    );
    ensemble.cancel();
    await t.enterPlay();
    return {
      checks,
      unrun: [
        "Physical XR slider ergonomics and radial readability",
        "Headset audio timing and bend comfort",
      ],
      syntheticXR: true,
    };
  } finally {
    if (oldInput) {
      oldInput.c.userData.gamepad = oldInput.gamepad;
      oldInput.c.position.copy(oldInput.position);
      oldInput.c.quaternion.copy(oldInput.quaternion);
      oldInput.c.updateMatrix();
      r.controllerStates.get(oldInput.c).trigger = oldInput.trigger;
      t.panel.group.position.copy(oldInput.panelPosition);
      t.panel.group.updateMatrixWorld(true);
    }
    t.panel.setXR(false);
    t.menu.setVisible(true);
    await t.enterPlay();
  }
}
