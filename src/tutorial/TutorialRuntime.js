import { ApplicationNavigation } from "../navigation/ApplicationNavigation.js";
import { RecordingCoordinator } from "../performance/RecordingCoordinator.js";
import { TutorialPanels } from "./TutorialPanels.js";
import { LearningProgress } from "../persistence/LearningProgress.js";

import { compositionRegistry } from "../compositions/CompositionRegistry.js";

import * as THREE from "three";
import { TutorialAdapter } from "./TutorialAdapter.js";
import { TutorialSession } from "./TutorialSession.js";
import { TutorialPanel } from "./TutorialPanel.js";
import { CompositionConductor } from "./CompositionConductor.js";
import { COMPOSITION as C, TUTORIAL_LOOPERS } from "../compositions/songs/jog/definition.js";

import { TutorialLessonFlow } from "./TutorialLessonFlow.js";
import { TutorialTimingCues } from "./TutorialTimingCues.js";
import { LESSON_CONTROL_IDS } from "./TutorialLessonPolicy.js";
import { GuidedPlayOffset } from "./GuidedPlayOffset.js";
import { BendSnapping } from "./BendSnapping.js";
import { LiveBendFeedback } from "./LiveBendFeedback.js";
import { BackingLayout } from "./BackingLayout.js";

const BASIC_BEND_GUIDE = {
  step: {
    type: "note",
    role: "basic",
    bendSnapEitherDirection: true,
    bend: [{ semitones: -1 }, { semitones: 0 }, { semitones: 0 }, { semitones: 1 }],
  },
};

export class TutorialRuntime {
  constructor(runtime) {
    this.r = runtime;
    this.navigation = new ApplicationNavigation(this);
    this.recording = new RecordingCoordinator(this);
    this.panels = new TutorialPanels(this);
    this.guidedPlayOffset = new GuidedPlayOffset();
    this.adapter = new TutorialAdapter(runtime, (e) => this.accept(e));
    this.backingLayout = new BackingLayout(this);
    this.bendSnapping = new BendSnapping(this.adapter);
    this.cues = new TutorialTimingCues(this.adapter);
    this.liveBendFeedback = new LiveBendFeedback(runtime);
    this.flow = new TutorialLessonFlow(this);
    this.session = null;
    this.conductor = null;
    this.demo = null;
    this.navigation.freePlayScene = null;
    this.busy = false;
    this.screen = "launch";
    this.ready = false;
    this.disposed = false;
    this.lastDraw = -Infinity;
    this.diagnostics = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 2.5;
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.rayDirection = new THREE.Vector3();
    this.report = null;
    this.practiceProgress = null;
    this.simulationProgress = null;
    this.uiFeedback = "";
    this.learningProgress = new LearningProgress();
    this.navigation.screen = "launch";
    this.navigation.libraryPage = 0;
    this.navigation.catalog = compositionRegistry;
    this.pendingXRPlacementFrames = 0;
    this.onVisibility = () => {
      if (document.hidden) {
        for (const frame of this.layoutFrames()) frame.cancelDrag();
        this.basics?.suspend();
        this.recording.session?.interrupt("visibility-interruption");
        this.conductor?.pause("Tab hidden. Resume restarts the current action.");
        if (this.session?.mode === "practice")
          this.flow.cancelOutgoing({
            keepResult: this.session.phase === "results",
          });
        this.uiFeedback = "Tab hidden. Choose Practice or Demonstrate again.";
        this.adapter.releaseAll();
        this.cues.reset();
        this.liveBendFeedback.reset();
      }
    };
  }
  initialize() {
    if (this.ready) return;
    this.ready = true;
    this.adapter.initialize();
    this.r.hideInstructionPanel();
    this.r.instructionPanelClosed = true;
    this.panel = new TutorialPanel({
      scene: this.r.scene,
      camera: this.r.camera,
      renderer: this.r.renderer,
      onAction: (id) => this.action(id),
    });
    this.navigation.initialize();
    if (this.r.xrSessionActive) this.onXRStart();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.panels.render(performance.now());
  }
  accept(event) {
    if (this.dataTutorial) {
      this.dataTutorial.accept(event);
      return;
    }
    if (this.basics && !this.basics.finale) {
      this.basics.accept(event);
      return;
    }
    this.session?.accept(event);
    this.demo?.session.accept(event);
    if (this.session && ["note", "strike"].includes(event.kind)) {
      this.diagnostics.push({
        id: event.id,
        kind: event.kind,
        role: event.role,
        origin: event.origin,
        beat:
          this.session.anchorMs === null
            ? null
            : (event.startMs - this.session.anchorMs) / this.session.beatMs,
        durationBeats: event.durationBeats,
        midis: event.midis,
        lane: event.lane,
        recordedCount: event.recordedCount,
        voiced: event.voiced,
        invalidMembers: event.invalidMembers,
        maxAbsBend: event.maxAbsBend,
      });
      if (this.diagnostics.length > 256) this.diagnostics.shift();
    }
  }
  observeStrike(event, context, recordedCount) {
    if (this.session || this.basics || this.dataTutorial)
      this.adapter.observeStrike(event, context, recordedCount);
  }
  onPreview(preview, entry, controller) {
    if (this.session) this.adapter.bindPreview(preview, entry, controller);
  }
  onPlaced(instruments, preview) {
    this.basics?.placed(instruments, preview);
    if (this.session) this.adapter.placed(instruments, preview);
  }
  onSpawnCancelled() {
    this.adapter.snapshotAt = -Infinity;
    this.lastDraw = -Infinity;
  }
  async action(id) {
    if (this.disposed) return;
    if (this.navigation.handles(id)) return this.navigation.action(id);
    if (this.busy) return;
    if (this.dataTutorial) {
      await this.dataTutorial.action(id);
      this.panels.render(performance.now());
      return;
    }
    if (this.basics) {
      await this.basics.action(id);
      this.panels.render(performance.now());
      return;
    }
    if (this.recording.session) {
      await this.recording.session.action(id.replace("jog-record-", ""));
      this.panels.render(performance.now());
      return;
    }
    if (this.session) {
      // No hidden Spawn, Prepare, connection or backing-generation routes.
      if (!LESSON_CONTROL_IDS.includes(id)) return;
      if (id === "exit") {
        await this.navigation.enterPlay();
        return;
      }
      if (id === "recenter") {
        this.panel.recenter(this.r.getUserCamera(), true);
        return;
      }
      try {
        if (this.session.mode === "simulation") {
          if (id === "step-demo" && !this.session.complete) {
            if (this.conductor?.paused) this.conductor.resume(performance.now());
            else this.conductor?.pause();
          }
        } else await this.flow.action(id);
      } catch (error) {
        this.flow.fail(error.message);
      }
      this.panels.render(performance.now());
      return;
    }
    if (id === "practice" || id === "simulate") {
      try {
        await this.r.audioSystem.ensureAudio();
        await this.enter(id === "simulate" ? "simulation" : "practice");
      } catch (error) {
        this.uiFeedback = error.message;
        this.panels.render(performance.now());
      }
    }
  }

  async enter(mode) {
    this.navigation.screen = null;
    this.flow.cancelOutgoing();
    this.busy = true;
    this.r.sessionMode = "transition";
    try {
      if (!this.navigation.freePlayScene)
        this.navigation.freePlayScene = this.r.sceneSerializer.serialize();
      if (this.session?.mode === "practice") this.practiceProgress = this.session.exportProgress();
      if (this.session?.mode === "simulation")
        this.simulationProgress = this.session.exportProgress();
      this.conductor?.stop();
      this.stopDemo();
      this.adapter.clear();
      this.session = new TutorialSession({ mode, now: performance.now() });
      this.r.sessionMode = mode;
      const progress = mode === "practice" && this.learningProgress.load(C.id, C.version);
      if (progress?.index >= 0 && progress.index < this.session.steps.length) {
        this.session.index = progress.index;
        this.session.outcomes = new Map(Object.entries(progress.progress?.outcomes || {}));
        this.session.demonstrated = new Set(progress.progress?.demonstrated || []);
        this.session.phrasesPassed = progress.progress?.phrasesPassed || [];
      }
      this.screen = "lesson";
      this.uiFeedback = "";
      this.diagnostics = [];
      this.report = null;
      this.r.hideInstructionPanel();
      this.r.instructionPanelClosed = true;
      this.adapter.begin(this.session.origin);
      this.conductor =
        mode === "simulation" ? new CompositionConductor(this.adapter, this.session) : null;
      this.panels.render(performance.now());
    } finally {
      this.busy = false;
    }
  }

  retry(now) {
    if (this.session?.mode === "practice") {
      this.flow.practice();
      return;
    }
    this.stopDemo();
    this.adapter.releaseAll();
    const step = this.session?.step;
    if (!step) return;
    const recording = ["record", "finalize"].includes(step.type);
    this.session.retry(now, { recording });
    if (["performance", "phrase"].includes(step.type) && !this.adapter.get("metronome")?.playing)
      this.adapter.command("tempo", now, this.session.origin);
    if (this.conductor) {
      this.conductor.stepId = null;
      this.conductor.lastNow = now;
      this.conductor.paused = false;
    }
    this.uiFeedback = "";
    this.adapter.snapshotAt = -Infinity;
  }
  demonstrate(now) {
    return this.flow.demonstrate();
  }
  stopDemo() {
    this.flow.stopDemo(false);
  }
  isBendSnapped(controller) {
    return this.bendSnapping.isSnapped(controller);
  }
  snapBend(controller, interaction, bend, now) {
    let guide = null;
    if (
      this.ready &&
      !this.busy &&
      !this.disposed &&
      !this.demo &&
      this.r?.sessionMode !== "play"
    ) {
      if (this.basics && !this.basics.finale) {
        if (
          this.basics.practicing &&
          !this.basics.setup &&
          !this.basics.demo &&
          this.basics.step.id === "bend"
        )
          guide = BASIC_BEND_GUIDE;
      } else if (this.dataTutorial) {
        if (this.dataTutorial.phase === "practice") guide = this.dataTutorial.guide;
      } else if (this.recording.session) guide = this.recording.session.guidance(now);
      else if (
        this.session?.mode === "practice" &&
        this.session.phase === "practicing" &&
        !this.conductor?.paused
      )
        guide = this.session;
    }
    return this.bendSnapping.resolve(guide, controller, interaction, bend, now);
  }
  beforeFrame(now) {
    this.navigation.menu?.update();
    if (!this.ready || this.busy || this.disposed) return;
    this.backingLayout.update();
    if (this.dataTutorial) {
      this.dataTutorial.update(now);
      return;
    }
    if (this.basics) {
      if (this.pendingXRPlacementFrames > 0) {
        this.pendingXRPlacementFrames--;
        if (this.pendingXRPlacementFrames === 0) this.basics.relocateToViewer();
      }
      this.basics.update(now);
      if (!this.basics.finale) return;
    }
    if (this.recording.session) {
      if (this.pendingXRPlacementFrames > 0) {
        this.recording.placePanel();
        this.pendingXRPlacementFrames--;
      }
      this.recording.session.update(now);
      return;
    }
    if (this.pendingXRPlacementFrames > 0 && !this.basics) {
      this.panel.recenter(this.r.getUserCamera(), Boolean(this.session));
      this.pendingXRPlacementFrames--;
    }
    if (this.demo && !this.flow.demoOwnsTakes(this.demo))
      this.flow.stopDemo(
        false,
        "Example stopped because an instrument changed. Your current take is kept.",
      );
    try {
      this.conductor?.update(now);
      this.demo?.conductor.update(now);
    } catch (error) {
      this.flow.fail(error.message);
      if (this.session?.mode === "simulation") {
        this.session.reject(error.message);
        this.conductor?.pause(error.message);
      }
      this.adapter.releaseVirtuals();
      console.error("Tutorial conductor:", error);
    }
    // The score's final rest stops backing; the attempt retains release grace.
    if (
      this.session?.step?.type === "performance" &&
      !this.session.practiceGate &&
      this.session.anchorMs !== null &&
      now >= this.session.anchorMs + 95 * this.session.beatMs &&
      !this.session.failed &&
      !this.session.finalRestApplied &&
      (this.session.mode !== "practice" || this.session.phase === "practicing")
    ) {
      this.adapter.stopSound();
      this.session.finalRestApplied = true;
    }
  }
  afterFrame(now) {
    this.liveBendFeedback?.update(
      now,
      this.ready && !this.busy && !this.disposed && this.r.sessionMode === "play",
    );
    if (now - (this.progressSavedAt || 0) > 1500) {
      this.progressSavedAt = now;
      if (this.session?.mode === "practice" && !this.basics)
        this.learningProgress.save(C.id, C.version, {
          index: this.session.index,
          progress: this.session.exportProgress(),
        });
    }
    if (this.dataTutorial) {
      this.adapter.observe(now);
      this.adapter.updateSustainTimings?.(
        this.dataTutorial.phase ? this.dataTutorial.guide : null,
        now,
      );
      this.cues.update(this.dataTutorial.phase ? this.dataTutorial.guide : null, now);
      if (now - this.lastDraw > 100) {
        this.panels.render(now);
        this.lastDraw = now;
      }
      return;
    }
    if (this.basics && !this.basics.finale) {
      this.adapter.observe(now);
      this.basics.sample(now);
      if (now - this.lastDraw > 100) {
        this.panels.render(now);
        this.lastDraw = now;
      }
      return;
    }
    if (!this.ready || this.busy || this.disposed) return;
    if (this.recording.session) {
      this.adapter.observe(now);
      const guide = this.recording.session.guidance(now);
      this.adapter.updateSustainTimings?.(guide, now);
      this.cues.update(guide, now, {
        active: Boolean(guide && !guide.complete(now)),
      });
      if (now - this.lastDraw >= 50) {
        this.panels.render(now);
        this.lastDraw = now;
      }
      if (this.panel.xr) {
        const hit = this.r.controllers
          .filter((c) => !c.userData.virtualTutorial)
          .map((c) => this.panelHit(c))
          .find((h) => h?.object.userData.action);
        this.panel.hover(hit?.object);
      }
      return;
    }
    if (this.session) {
      this.adapter.observe(now);
      if (!this.demo && !this.conductor?.paused && this.session.phase === "practicing")
        this.adapter.updateSustainTimings?.(this.session, now);
      const snapshot = this.adapter.snapshot(now);
      if (this.session.mode === "simulation")
        Object.assign(this.adapter.takeEvidence, this.session.takeEvidence);
      if (snapshot.aligned)
        this.alignmentEvidence = {
          atMs: now,
          loopers: snapshot.loopers.chordLooper.startBeat,
          phaseDifference: Math.abs(
            snapshot.loopers.chordLooper.phase - snapshot.loopers.percussionLooper.phase,
          ),
        };
      if (this.demo) {
        this.demo.session.update(snapshot, now);
        const ds = this.demo.session,
          limit = ds.step?.timed
            ? (ds.step.beats + 24) * ds.beatMs + 5000
            : ds.step?.type === "switch"
              ? 90000
              : ["playback", "start-all"].includes(ds.step?.type)
                ? 30000
                : 10000;
        if (ds.complete || ds.failed || this.demo.conductor.paused)
          this.flow.stopDemo(
            ds.complete,
            ds.failed || this.demo.conductor.paused ? ds.feedback : "",
          );
        else if (now - ds.enteredAt > limit)
          this.flow.stopDemo(
            false,
            `${ds.step.title} could not complete. Check the instruments, then press Demonstrate again.`,
          );
      } else if (!this.conductor?.paused) {
        const previous = this.session.step?.id;
        const previousPhase = this.session.phase;
        this.session.practiceGate?.update(now, this.adapter.gestures.values());
        this.session.update(snapshot, now);
        if (this.session.pendingAssessment) {
          const { reason } = this.session.pendingAssessment;
          this.session.finishAttempt(snapshot, now, reason);
        }
        if (previousPhase !== "results" && this.session.phase === "results")
          this.flow.finishPractice();
        if (this.session.step?.id !== previous) {
          this.uiFeedback = "";
          this.lastDraw = -Infinity;
          if (this.session.feedback.startsWith("Repair:")) {
            this.adapter.releaseAll();
            this.conductor?.pause(this.session.feedback);
          }
        }
        if (this.session.complete && !this.report) {
          this.conductor?.stop();
          this.adapter.releaseAll();
          this.adapter.stopSound();
          this.report = {
            ...this.session.exportProgress(),
            durationSeconds: this.conductor ? this.conductor.elapsedMs / 1000 : null,
            takes: this.adapter.takes,
            liveTakes: this.session.takeEvidence,
            launches: Object.fromEntries(
              TUTORIAL_LOOPERS.map((l) => [
                l.role,
                [...(this.adapter.get(l.role)?.looperData.launchHistory || [])],
              ]),
            ),
            startAll: this.adapter.startAllRequest,
            alignment: this.alignmentEvidence,
            audioState: this.r.audioSystem.audioContextService.context?.state,
          };
          if (this.session.mode === "practice")
            this.practiceProgress = this.session.exportProgress();
          else this.simulationProgress = this.session.exportProgress();
        }
      }
    }
    this.adapter.focusRing.visible = false;
    this.cues.update(this.demo?.session || this.session, now, {
      active: !this.conductor?.paused && (Boolean(this.demo) || this.session?.phase !== "results"),
    });
    this.panel.animate?.(now);
    if (
      now - this.lastDraw >= 100 &&
      (this.session || this.lastPendingPreview !== this.r.spawn.pendingSpawnPlacement)
    ) {
      this.panels.render(now);
      this.lastDraw = now;
      this.lastPendingPreview = this.r.spawn.pendingSpawnPlacement;
    }
    if (this.panel.xr) {
      const hit = this.r.controllers
        .filter((c) => !c.userData.virtualTutorial)
        .map((c) => this.panelHit(c))
        .find((hit) => hit?.object.userData.action);
      this.panel.hover(hit?.object);
    }
  }
  blocksController(controller) {
    return Boolean(
      this.busy ||
      this.layoutFrames().some((frame) => frame.blocked.has(controller)) ||
      this.navigation.menu?.blocked.has(controller) ||
      ((this.session?.mode === "simulation" ||
        this.demo ||
        this.basics?.demo ||
        this.recording.session?.demonstrating ||
        this.dataTutorial?.phase === "demo") &&
        !controller.userData.virtualTutorial),
    );
  }
  panelHit(controller) {
    if (!this.panel?.group.visible) return null;
    controller.getWorldPosition(this.position);
    controller.getWorldQuaternion(this.quaternion);
    this.ray.set(this.position, this.rayDirection.set(0, 0, -1).applyQuaternion(this.quaternion));
    return this.panel.hit(this.ray);
  }
  layoutFrames() {
    return [
      this.dataTutorial?.ensemble?.layoutFrame,
      this.recording.session?.ensemble?.layoutFrame,
      this.backingLayout?.frame,
    ].filter(Boolean);
  }
  captureLayoutIntent(intent, state) {
    const frames = this.layoutFrames();
    const owner = frames.find((frame) => frame.blocked.has(intent.controller));
    return owner
      ? owner.captureIntent(intent, state)
      : frames.some((frame) => frame.captureIntent(intent, state));
  }
  nearestPanelHit(controller, instrumentHit) {
    const hit = this.panelHit(controller);
    return hit && (!instrumentHit || hit.distance <= instrumentHit.distance) ? hit : null;
  }
  capturePanelTrigger(controller) {
    const hit = this.nearestPanelHit(controller, this.r.raycastSystem.getCurrentHit(controller));
    if (!hit) return false;
    const state = this.r.controllerStates.get(controller);
    this.r.clearControllerTriggerInteraction(state);
    state.tutorialPanelCapture = true;
    state.suppressTriggerUntilRelease = true;
    if (hit.object.userData.action && !hit.object.userData.disabled)
      this.action(hit.object.userData.action);
    return true;
  }
  releasePanelTrigger(controller) {
    const state = this.r.controllerStates.get(controller);
    if (!state?.tutorialPanelCapture) return false;
    state.tutorialPanelCapture = false;
    state.suppressTriggerUntilRelease = false;
    this.r.releaseRaySqueeze(state);
    return true;
  }
  onXRStart() {
    this.pendingXRPlacementFrames = 4;
    this.recording.lastTrackedFrame = null;
    this.recording.reference?.removeEventListener("reset", this.recording.onReferenceReset);
    this.recording.reference = this.r.renderer.xr.getReferenceSpace();
    this.recording.onReferenceReset = () => {
      for (const frame of this.layoutFrames()) frame.cancelDrag();
      this.navigation.menu?.referenceChanged(this.r.getUserCamera());
      this.recording.session?.interrupt("reference-space-reset");
      this.dataTutorial?.cancel();
      this.basics?.suspend();
    };
    this.recording.reference?.addEventListener("reset", this.recording.onReferenceReset);
    this.r.hideInstructionPanel();
    this.r.instructionPanelClosed = true;
    this.panel?.setXR(true, this.r.getUserCamera());
    this.panel?.recenter(this.r.getUserCamera(), Boolean(this.session || this.recording.session));
  }
  onXREnd() {
    for (const frame of this.layoutFrames()) frame.cancelDrag();
    this.navigation.menu?.cancelDrag();
    this.dataTutorial?.cancel();
    if (this.basics) {
      this.basics.suspend();
      this.basics.cancelDemo().catch((error) => {
        this.uiFeedback = error.message;
      });
    }
    this.navigation.menu?.cancelDrag();
    this.pendingXRPlacementFrames = 0;
    this.recording.lastTrackedFrame = null;
    this.recording.session?.interrupt("session-end");
    this.conductor?.stop();
    this.flow.cancelOutgoing();
    this.adapter.releaseAll();
    this.panel?.setXR(false);
    if (this.session && !this.basics)
      this.navigation.enterPlay().catch((error) => console.error(error));
  }

  guidedPlayRunning() {
    return Boolean(
      this.dataTutorial?.phase ||
      this.basics?.demo ||
      this.demo ||
      ["starting", "syncing", "count-in", "performing", "saving"].includes(
        this.recording.session?.phase,
      ) ||
      this.session?.phase === "practicing" ||
      (this.session?.mode === "simulation" && !this.conductor?.paused),
    );
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.navigation.dispose();
    this.dataTutorial?.dispose();
    this.dataTutorial = null;
    this.conductor?.stop();
    this.stopDemo();
    this.basics?.dispose();
    this.basics = null;
    this.recording.session?.interrupt("disposed");
    this.recording.reference?.removeEventListener("reset", this.recording.onReferenceReset);
    this.flow.cancelOutgoing();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.cues.dispose();
    this.backingLayout.dispose();
    this.liveBendFeedback.dispose();
    this.adapter.dispose();
    this.panel?.dispose();
  }
}
