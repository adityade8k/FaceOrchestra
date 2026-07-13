import * as THREE from "three";
import { FrameScheduler } from "./FrameScheduler.js";

const userPosition = new THREE.Vector3();

export class FaceOrchestraApp {
  constructor({ sceneRuntime, runtime, frameScheduler = new FrameScheduler() } = {}) {
    if (!sceneRuntime || !runtime) {
      throw new TypeError("FaceOrchestraApp requires sceneRuntime and the composed runtime services.");
    }
    this.sceneRuntime = sceneRuntime;
    this.runtime = runtime;
    this.frameScheduler = frameScheduler;
    this.running = false;
    this.initialized = false;
    this.lastFrameMs = null;
    this.elapsedSeconds = 0;
    this.configureFramePhases();
  }

  async initialize() {
    if (this.initialized) return this;
    await this.runtime.initialize();
    this.initialized = true;
    return this;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.sceneRuntime.start();
    this.sceneRuntime.renderer.setAnimationLoop((frameMs) => {
      const now = Number.isFinite(frameMs) ? frameMs : performance.now();
      const delta = this.lastFrameMs === null ? 0 : Math.max((now - this.lastFrameMs) / 1000, 0);
      this.lastFrameMs = now;
      this.elapsedSeconds += delta;
      this.update(delta, this.elapsedSeconds, now);
      this.sceneRuntime.render();
    });
  }

  update(delta = 0, elapsed = this.elapsedSeconds, now = performance.now()) {
    return this.frameScheduler.run({ delta, elapsed, now });
  }

  onXRSessionStart(session = this.sceneRuntime.renderer.xr.getSession()) {
    this.sceneRuntime.setXRBlendMode(session?.environmentBlendMode);
    this.runtime.onXRSessionStart();
  }

  onXRSessionEnd() {
    try {
      return this.runtime.onXRSessionEnd();
    } finally {
      this.sceneRuntime.resetAfterXR();
    }
  }

  async endXRSession() {
    const session = this.sceneRuntime.renderer.xr.getSession();
    if (session) await session.end();
    else this.onXRSessionEnd();
  }

  dispose() {
    if (!this.initialized && !this.running) return;
    this.running = false;
    this.runtime.dispose();
    this.sceneRuntime.dispose();
    this.initialized = false;
  }

  configureFramePhases() {
    const runtime = this.runtime;

    this.frameScheduler.add("INPUT", (frame) => {
      frame.hadPendingSpawn = Boolean(runtime.pendingSpawnPlacement);
      runtime.pollControllers(frame.now);
    }, { label: "poll XR hardware" });

    this.frameScheduler.add("INTENT", () => {
      runtime.interactionCoordinator.flushInputs();
    }, { label: "route semantic intents" });

    this.frameScheduler.add("TRANSFORM", (frame) => {
      runtime.updatePendingPanelPlacement();
      if (runtime.pendingSpawnPlacement) {
        runtime.updatePendingSpawnPreview();
        runtime.updateLooperPlaybackDuringPendingSpawn(frame.now);
        frame.skipRemaining = true;
        return;
      }
      if (frame.hadPendingSpawn) {
        frame.skipRemaining = true;
        return;
      }
      runtime.updateRadialMenus();
      runtime.updateRaycastHover();
      runtime.updateTriggerInteraction();
      runtime.updateGripTransform();
    }, { label: "preview, ray, and grip transforms" });

    this.frameScheduler.add("COLLISION", (frame) => {
      runtime.honkContactSystem.update();
      runtime.getUserCamera().getWorldPosition(userPosition);
      runtime.stickCollisionSystem.update(frame.now, { userPosition });
    }, { label: "honk contacts and stick strikes" });

    this.frameScheduler.add("RELATIONSHIPS", (frame) => {
      runtime.updateLooperFollowerTransforms();
      runtime.updateLockedHonkGroupTransforms();
      runtime.updateShakeDisconnect(frame.now);
    }, { label: "locks and looper assignments" });

    this.frameScheduler.add("AUTOMATION", (frame) => {
      runtime.updateLooperRecordings(frame.now);
    }, { label: "record and advance looper transport" });

    this.frameScheduler.add("PERFORMANCE", (frame) => {
      runtime.updateHorn(frame.now);
    }, { label: "resolve live input plus automation" });

    this.frameScheduler.add("PRESENTATION", (frame) => {
      runtime.updateLooperMorphAnimations(frame.now);
      runtime.updateLooperWires();
    }, { label: "morphs, audio, wires, and UI" });
  }
}
