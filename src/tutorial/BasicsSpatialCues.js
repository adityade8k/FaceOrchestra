import * as THREE from "three";
import { HONK_CONNECTION_TARGET_NAME } from "../config/looper.js";
import { createBasicsTargetCue, updateBasicsTargetCue } from "./basicsTargetCue.js";

// Tutorial-only destination cue. Never participates in picking or completion.
export class BasicsSpatialCues {
  constructor(tutorial) {
    this.t = tutorial;
    this.root = new THREE.Group();
    this.root.name = "Basics spatial guidance";
    this.destination = createBasicsTargetCue("Basics destination cue");
    this.root.add(this.destination);
    tutorial.r.scene.add(this.root);
    this.reset();
  }
  destinationTarget() {
    const t = this.t;
    if (t.step.target === "honk-wire") return t.horn?.hitTargets[HONK_CONNECTION_TARGET_NAME];
    if (t.step.target === "clock-wire") {
      const l = t.looper;
      const incoming = l && t.r.metronomeConnectionManager.getConnectionForTarget("looper", l.id);
      return (
        l?.tracks.find((track) => track.trackId === incoming?.targetPortId) ||
        l?.tracks.find((track) => !track.connectedHonkId)
      )?.nodeTarget;
    }
    return null;
  }
  update(visible, now, rotation) {
    const target = this.destinationTarget();
    this.root.visible = visible && Boolean(target);
    this.destination.visible = this.root.visible;
    if (target) updateBasicsTargetCue(this.destination, target, rotation, now);
  }
  reset() {
    this.root.visible = false;
    this.destination.visible = false;
  }
  dispose() {
    this.reset();
    this.root.removeFromParent();
    this.destination.geometry.dispose();
    this.destination.material.dispose();
  }
}
