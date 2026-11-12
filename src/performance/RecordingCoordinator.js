import { SongRecordingSession } from "./SongRecordingSession.js";
import { SongDemonstration } from "./SongDemonstration.js";
import { MelodyLayoutFrame } from "../tutorial/MelodyLayoutFrame.js";

import * as THREE from "three";

export class RecordingCoordinator {
  constructor(host) {
    this.host = host;
    this.session = null;
    this.lastTrackedFrame = null;
  }
  async enter(module) {
    try {
      const ensemble = module.createEnsemble(this.host);
      const mode = new SongRecordingSession({
        composition: module.definition,
        createGuidance: module.createGuidance,
        guidedPlayOffsetMs: () => this.host.guidedPlayOffset.milliseconds,
        recorder: this.host.r.capture,
        ensemble,
        prepareLayout: () => {
          if (module.definition.score.events)
            ensemble.layoutFrame = new MelodyLayoutFrame(ensemble);
        },
        demonstration: new SongDemonstration(this.host, ensemble, module.definition),
        ensureAudio: () => this.host.r.audioSystem.ensureAudio(),
        trackingReady: () =>
          Boolean(
            this.host.r.xrSessionActive &&
            this.host.r.renderer.xr.getReferenceSpace() &&
            performance.now() - (this.lastTrackedFrame ?? -Infinity) < 250,
          ),
        onChange: () => this.host.panels.render(performance.now()),
        onExit: async () => {
          this.session.restoring = true;
          try {
            ensemble.dispose?.();
            await this.host.navigation.enterPlay();
            this.session = null;
            this.host.panels.render(performance.now());
          } finally {
            mode.restoring = false;
          }
        },
      });
      this.host.navigation.freePlayScene ??= this.host.r.sceneSerializer.serialize();
      this.session = mode;
      this.host.r.sessionMode = "song-recording";
      this.host.panels.render(performance.now());
      await mode.action("prepare");
    } catch (error) {
      this.host.uiFeedback = error.message;
      this.host.panels.render(performance.now());
    }
  }
  placePanel() {
    const camera = this.host.r.getUserCamera(),
      position = new THREE.Vector3(),
      rotation = new THREE.Quaternion();
    camera.getWorldPosition(position);
    camera.getWorldQuaternion(rotation);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    right.y = 0;
    right.normalize();
    this.host.panel.recenter(camera, true);
    this.host.panel.group.position.addScaledVector(right, -0.45);
    this.host.panel.group.lookAt(position.x, this.host.panel.group.position.y, position.z);
    this.host.panel.group.updateMatrixWorld(true);
  }
  observeXRFrame(now, frame) {
    const reference = this.host.r.renderer.xr.getReferenceSpace();
    if (frame && reference && frame.getViewerPose(reference)) this.lastTrackedFrame = now;
    else if (this.host.r.xrSessionActive) {
      this.lastTrackedFrame = null;
      for (const frame of this.host.layoutFrames()) frame.cancelDrag();
      this.host.navigation.menu?.cancelDrag();
      this.session?.interrupt("tracking-lost");
      this.host.dataTutorial?.cancel();
    }
  }
}
