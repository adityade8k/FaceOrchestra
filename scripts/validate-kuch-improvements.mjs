import * as THREE from "three";
import { installCaptureControls } from "../src/capture/CaptureControls.js";
import { BEAT_MS } from "../src/tutorial/kuch/score.js";

export async function validate(app) {
  const r = app.runtime,
    t = r.tutorial,
    checks = [];
  const check = (value, message) => {
    if (!value) throw new Error(message);
    checks.push(message);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (fn, ms = 12000) => {
    const start = performance.now();
    while (!fn()) {
      if (performance.now() - start > ms)
        throw new Error(
          "Timed out: " +
            fn +
            " · " +
            JSON.stringify({
              feedback: t.kuch?.feedback,
              phase: t.kuch?.phase?.id,
              frameAgeMs: performance.now() - app.lastFrameMs,
              visibility: document.visibilityState,
            }),
        );
      await wait(20);
    }
  };
  const allCuesHidden = () =>
    t.cues.pool.every((p) => Object.values(p).every((m) => !m.visible));
  const noHeldVoices = () =>
    r.instrumentRegistry
      .getByKind("honk")
      .every((h) => h.hornHolders.size === 0);
  let disposeBadge, driver, restoreEmit;
  const originalXR = r.xrSessionActive;
  try {
    await t.enterPlay();
    await r.audioSystem.ensureAudio();
    t.learningProgress.save("kuch-to-hua-hai", 1, {
      index: 8,
      results: { performance: { ok: true } },
    });
    await t.action("tutorials");
    await t.action("composition:kuch-to-hua-hai");
    check(
      t.compositionOptions.arrangementId === "easier-bends" && !t.kuch,
      "Song options show Easier bends before scene preparation",
    );
    check(
      t.panel.model.navigation.some((b) => b.id === "arrangement:original"),
      "Original is available in the same song options",
    );
    await t.action("arrangement:original");
    await t.action("composition-start");
    check(
      t.kuch.arrangement.id === "original" && t.kuch.index === 0,
      "Original selected; version-1 mastery is not inherited",
    );
    t.menu.setVisible(false);
    const textureVersion = t.panel.texture.version,
      statusVersion = t.panel.statusTexture.version;
    t.panel.render({ ...t.panel.model, feedback: "Latest hidden feedback" });
    t.panel.setTransport("Latest hidden beat");
    check(
      t.panel.texture.version === textureVersion &&
        t.panel.statusTexture.version === statusVersion,
      "Hidden menu updates do not redraw canvas textures",
    );
    t.menu.setVisible(true);
    check(
      t.panel.nodes.feedback.textContent === "Latest hidden feedback" &&
        t.panel.nodes.target.textContent === "Latest hidden beat",
      "Reopening immediately presents the latest deferred menu state",
    );
    t.render(performance.now());
    t.learningProgress.save(t.kuch.progressId, t.kuch.progressVersion, {
      index: 1,
      results: { D: { ok: true } },
    });
    await t.enterPlay();
    await t.action("tutorials");
    await t.action("composition:kuch-to-hua-hai");
    await t.action("composition-start");
    const k = t.kuch;
    check(
      k.arrangement.id === "easier-bends" &&
        k.index === 0 &&
        !Object.keys(k.results).length,
      "Arrangement progress is isolated and default choice stays Easier bends",
    );
    k.index = k.steps.findIndex((s) => s.id === "bend-intro");
    const observed = [],
      accept = k.accept.bind(k);
    k.accept = (e) => {
      observed.push(e);
      accept(e);
    };
    await t.action("step-demo");
    await until(() => t.cues.pool.some((p) => p.green.visible));
    check(
      k.guide?.step.timed && k.guide.beatMs === BEAT_MS,
      "Kuch demonstration reaches shared timed cues at 92 BPM",
    );
    const guide = k.guide;
    t.menu.setVisible(false);
    check(
      t.cues.pool.some((p) => p.green.visible),
      "Hiding menu preserves green guidance immediately",
    );
    await until(() => !k.running);
    const demonstrated = observed.filter(
      (e) => e.kind === "note" && e.origin === "demonstration",
    );
    check(
      demonstrated.length === 2 &&
        demonstrated.every(
          (e) => e.voiced && e.released && !e.voiceInterrupted,
        ),
      "Bend introduction demonstrates two continuous real voices and releases",
    );
    check(
      demonstrated[0].bendSamples.some((s) => s.semitones > 1.7) &&
        demonstrated[1].bendSamples.some((s) => s.semitones < -0.8),
      "Both authored directions reach observed processed pitch",
    );
    check(
      !Object.keys(k.results).length,
      "Demonstration gives no learner mastery",
    );
    check(
      allCuesHidden() && !k.guide,
      "Finished phase removes its guidance adapter and rings",
    );
    t.menu.setVisible(true);
    await t.action("step-practice");
    t.adapter.setVirtualsActive(true, "learner");
    check(
      k.guide !== guide && k.guide.mode === "practice",
      "Practice owns a fresh, fixed attempt clock",
    );
    const play = () => {
      if (!k.phase) return;
      const now = performance.now(),
        beat = (now - k.anchor) / BEAT_MS;
      k.playNote(
        k.phase.events.find((e) => beat >= e.beat && beat < e.beat + e.beats),
        now,
      );
      driver = requestAnimationFrame(play);
    };
    play();
    await until(() => !k.running);
    cancelAnimationFrame(driver);
    check(
      k.results["bend-intro"]?.ok,
      "Real observed learner bends pass introduction assessment: " +
        JSON.stringify({
          result: k.results["bend-intro"],
          anchor: k.anchor,
          notes: k.heard
            .filter((e) => e.kind === "note")
            .map((e) => ({
              startMs: e.startMs,
              endMs: e.endMs,
              midis: e.midis,
              bendSamples: e.bendSamples,
            })),
        }),
    );
    await t.action("step-demo");
    await until(() => t.adapter.gestures.size > 0);
    r.xrSessionActive = true;
    t.observeXRFrame(performance.now(), null);
    r.xrSessionActive = originalXR;
    await wait(50);
    check(
      !k.running && allCuesHidden() && noHeldVoices(),
      "Tracking loss cancels phase, rings and held voices",
    );
    await t.action("step-demo");
    await until(() => t.adapter.gestures.size > 0);
    const h = t.adapter.get(k.phase.events[0].role);
    r.deleteInstrument(h);
    await wait(50);
    check(
      !k.running && allCuesHidden() && noHeldVoices(),
      "Deleting a required target cancels the gesture cleanly",
    );
    await t.enterPlay();
    await t.action("record-songs");
    await t.action("composition:kuch-to-hua-hai");
    await t.action("arrangement:original");
    await t.action("composition-start");
    // Headless Chrome cannot pass the physical-XR recording gate. Exercise
    // the selected ensemble directly, without faking a recording session.
    t.jogRecording.ensemble.prepare();
    t.jogRecording.ensemble.validate();
    check(
      t.jogRecording.composition.arrangement.id === "original" &&
        t.jogRecording.ensemble.arrangement.id === "original",
      "Record Songs prepares the same selected arrangement",
    );
    check(
      t.jogRecording.composition.contentVersion === 2,
      "Recording uses the new content version",
    );
    await t.enterPlay();

    await t.selectComposition("virag-2-jog-study", "record-songs");
    t.jogRecording.ensemble.prepare();
    t.jogRecording.ensemble.validate();
    const { DESCENDING_BEND, bendAt } = await import(
      "../src/tutorial/composition.js"
    );
    const { validateBend } = await import("../src/tutorial/validation.js");
    const emitted = [],
      emit = t.adapter.emit;
    t.adapter.emit = (e) => {
      emitted.push(e);
      emit(e);
    };
    restoreEmit = () => {
      t.adapter.emit = emit;
    };
    t.adapter.setVirtualsActive(true, "demonstration");
    const began = performance.now(),
      voices = new Set();
    await new Promise((resolve) => {
      const perform = () => {
        const now = performance.now(),
          fraction = (now - began) / 2250;
        if (fraction >= 1) {
          t.adapter.squeeze(null, false, 0, now);
          resolve();
          return;
        }
        t.adapter.squeeze(
          "melody-Eb4",
          true,
          bendAt(DESCENDING_BEND, fraction),
          now,
        );
        const h = t.adapter.get("melody-Eb4"),
          controller = t.adapter.virtuals[0];
        const voice = r.audioSystem.honkVoices.voices.get(
          r.getInstrumentVoiceId(r.getControllerVoiceId(controller), h),
        );
        if (voice) voices.add(voice);
        driver = requestAnimationFrame(perform);
      };
      perform();
    });
    await until(() => emitted.some((e) => e.kind === "note"));
    const jogNote = emitted.find((e) => e.kind === "note");
    check(
      voices.size === 1 && jogNote.voiced && jogNote.released,
      "Jog descending bend retains one real voice and releases",
    );
    check(
      validateBend(jogNote, DESCENDING_BEND).ok,
      "Jog processed Eb-to-C glide still passes its original assessment",
    );
    restoreEmit();
    restoreEmit = null;
    await t.enterPlay();

    // Exercise the actual DOM installer/recorder listener with a physical-hand
    // fixture. Its isolated XR emitter avoids pretending that Chrome has a headset.
    const physical = new THREE.Group(),
      virtual = new THREE.Group(),
      xr = new THREE.EventDispatcher();
    physical.userData.gamepad = {};
    virtual.userData = { gamepad: {}, virtualTutorial: true };
    r.scene.add(physical, virtual);
    const recorder = new EventTarget();
    Object.assign(recorder, {
      runtime: {
        ...r,
        controllers: [virtual, physical],
        xrSessionActive: true,
        renderer: { xr },
        tutorial: t,
      },
      state: "idle",
      elapsed: 0,
      connected: true,
      message: "fresh",
      active: false,
      pairing: "unchanged",
      takeId: "fixed",
      readiness() {},
    });
    disposeBadge = installCaptureControls(recorder);
    const badge = physical.children.find(
      (c) => c.name === "Mixed Reality Capture status",
    );
    check(
      Boolean(badge) && !virtual.children.includes(badge),
      "Capture badge attaches to a physical controller",
    );
    check(!badge.visible, "Idle badge remains hidden without a radial menu");
    const voiceState = r.audioSystem.audioContextService.context.state;
    for (const state of [
      "idle",
      "preparing",
      "recording",
      "stopping",
      "complete",
      "incomplete",
      "error",
    ]) {
      recorder.state = state;
      recorder.message = `fresh ${state}`;
      t.menu.setVisible(false);
      check(!badge.visible, `Badge immediately hidden in ${state}`);
      physical.userData.radialMenu = { visible: true, userData: {} };
      recorder.dispatchEvent(new Event("change"));
      check(
        !badge.visible,
        `Recorder refresh and radial menu cannot reveal ${state} badge`,
      );
      await wait(510);
      check(!badge.visible, `Periodic refresh preserves hidden ${state} badge`);
      t.menu.setVisible(true);
      check(badge.visible, `Show restores ${state} badge`);
      check(
        [...document.querySelectorAll(".capture-controls p")].some((p) =>
          p.textContent.includes(`fresh ${state}`),
        ),
        `Status remains fresh for ${state}`,
      );
    }
    check(
      recorder.pairing === "unchanged" &&
        recorder.takeId === "fixed" &&
        r.audioSystem.audioContextService.context.state === voiceState,
      "Menu visibility does not change pairing, take identity or audio",
    );
    physical.dispatchEvent({ type: "disconnected" });
    check(!badge.visible && !badge.parent, "Disconnect detaches badge");
    t.menu.setVisible(false);
    physical.dispatchEvent({ type: "connected" });
    check(
      !badge.visible && badge.parent === physical,
      "Hidden reconnect stays hidden",
    );
    xr.dispatchEvent({ type: "sessionend" });
    check(!badge.visible && !badge.parent, "XR exit leaves no orphan badge");
    const subscriptions = t.menu.visibilityListeners.size;
    disposeBadge();
    disposeBadge = null;
    check(
      t.menu.visibilityListeners.size === subscriptions - 1,
      "Capture control disposal removes menu subscription",
    );
    physical.removeFromParent();
    virtual.removeFromParent();
    t.menu.setVisible(true);
    return { checks, headset: false, acousticListening: false };
  } finally {
    cancelAnimationFrame(driver);
    disposeBadge?.();
    restoreEmit?.();
    r.xrSessionActive = originalXR;
    await t.enterPlay();
    t.menu.setVisible(true);
  }
}
