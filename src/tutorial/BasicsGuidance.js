import * as THREE from "three";
import { MODEL_LABEL_SETTINGS } from "../config/ui.js";
import { INTERACTION_TARGET_NAMES, getHonkPitchBendRange } from "../config/honk.js";
import { getLooperButtonName, getLooperControlName } from "../instruments/looper/looperNames.js";
import { BASICS_EARS } from "./basicsSteps.js";
import {
  createBasicsTargetCue,
  updateBasicsTargetCue,
  basicsTargetRadius,
  BASICS_TARGET_COLORS,
} from "./basicsTargetCue.js";
import { BasicsSpatialCues } from "./BasicsSpatialCues.js";
import { BendGauge } from "./BendGauge.js";
import { BendHaptics } from "./BendHaptics.js";

const BASIC_BEND_TARGETS = [{ role: "basic" }];

export class BasicsGuidance {
  constructor(tutorial) {
    this.t = tutorial;
    this.r = tutorial.r;
    this.bendHaptics = new BendHaptics(tutorial.a);
    this.scratch = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.look = new THREE.Object3D();
    this.bounds = new THREE.Box3();
    this.bodyBounds = new THREE.Box3();
    this.notePosition = new THREE.Vector3();
    this.ring = createBasicsTargetCue("Basics target cue");
    this.arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      0.12,
      BASICS_TARGET_COLORS.action,
      0.035,
      0.022,
    );
    this.arrow.line.geometry = this.arrow.line.geometry.clone();
    this.arrow.cone.geometry = this.arrow.cone.geometry.clone();
    this.arrow.traverse((o) => {
      o.raycast = () => {};
    });
    this.arrow.visible = false;
    this.badgeCanvas = document.createElement("canvas");
    this.badgeCanvas.width = 384;
    this.badgeCanvas.height = 80;
    this.badgeTexture = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeTexture.colorSpace = THREE.SRGBColorSpace;
    this.badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.052),
      new THREE.MeshBasicMaterial({
        map: this.badgeTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.badge.raycast = () => {};
    this.badge.renderOrder = 32;
    this.badge.visible = false;
    this.badge.name = "Basics controller cue";
    this.r.scene.add(this.ring, this.arrow, this.badge);
    this.bend = new BendGauge(this.r.scene);
    this.spatial = new BasicsSpatialCues(tutorial);
    this.recenter();
  }
  target() {
    const t = this.t,
      h = t.horn,
      l = t.looper,
      m = t.fixtures.get("metronome");
    let target = t.step.target;
    if (t.step.id === "pitch" && t.activeObjectives[0]?.startsWith("ear-")) target = "ear";
    if (target === "ear") {
      const cue =
        t.step.id === "pitch"
          ? BASICS_EARS[0]
          : BASICS_EARS[t.objectives?.size || 0] || BASICS_EARS[0];
      return h?.hitTargets[INTERACTION_TARGET_NAMES[cue.side + "Ear"]];
    }
    if (target === "squeeze") return h?.hitTargets[INTERACTION_TARGET_NAMES.horn];
    if (target === "body" || target === "group") return h?.root;
    if (target === "mouth" || target === "nose")
      return h?.hitTargets[INTERACTION_TARGET_NAMES[target]];
    if (target === "metronome-play")
      return (
        [...(m?.targetsByRole?.values() || [])].find(
          (o) => o.userData.metronomeButtonAction === "play",
        ) || m?.root
      );
    if (target === "bpm")
      return (
        m?.handleRig?.controls.get("bpm")?.collider ||
        m?.handleRig?.controls.get("bpm")?.node ||
        m?.root
      );
    if (["recordLength", "gap"].includes(target))
      return l?.hitTargets[getLooperControlName(target)];
    if (target === "record")
      return t.objectives?.has("sound")
        ? l?.hitTargets[getLooperButtonName("stop")]
        : t.objectives?.has("armed")
          ? h?.squeezeCollider
          : l?.hitTargets[getLooperButtonName("record")];
    if (target === "play") {
      const owner =
        t.step.id === "switch" &&
        (l?.transport.playing || (!t.objectives?.has("second") && t.objectives?.has("first")))
          ? t.fixtures.get("alternativeLooper")
          : l;
      return owner?.hitTargets[
        getLooperButtonName(
          t.step.id === "playback" && t.objectives?.has("heard") ? "pause" : "play",
        )
      ];
    }
    if (target === "honk-wire")
      return l?.tracks.find((track) => !track.connectedHonkId)?.nodeTarget;
    if (target === "clock-wire") {
      const first = t.fixtures.get("chordLooper");
      const connection =
        first && this.r.metronomeConnectionManager.getConnectionForTarget("looper", first.id);
      const portId =
        t.step.id === "shared-clock" ? connection?.portId : m?.connectionPorts.keys().next().value;
      return m?.getConnectionPortTarget(portId) || m?.root;
    }
    return null;
  }
  recenter({ pin = false } = {}) {
    const camera = this.r.getUserCamera();
    camera.getWorldPosition(this.eye);
    camera.getWorldQuaternion(this.rotation);
    this.desired.set(0, 0.15, -1.45).applyQuaternion(this.rotation).add(this.eye);
    this.t.host.panel.group.position.copy(this.desired);
    this.pinned = pin;
    this.anchorAt = -Infinity;
  }
  update(now) {
    const t = this.t,
      panel = t.host.panel,
      camera = this.r.getUserCamera();
    if (["bend", "pitch"].includes(t.step.id) && !t.demo)
      this.bendHaptics.update(BASIC_BEND_TARGETS);
    else this.bendHaptics.reset();
    const visible = !t.host.navigation.screen && t.host.navigation.menu.visible;
    const target = this.target();
    camera.getWorldPosition(this.eye);
    camera.getWorldQuaternion(this.rotation);
    const alpha = 1 - Math.exp(-Math.min(50, Math.max(0, now - (this.lastAt ?? now - 16))) / 160);
    this.lastAt = now;
    const moving = [...this.r.controllerStates.values()].some(
      (s) => s.gripHeld && t.fixtures.owned.has(s.gripSourceInstrumentState?.id),
    );
    const recordingLesson = t.step.target === "record";
    if (recordingLesson && this.recordStep !== t.step.id) {
      this.recordStep = t.step.id;
      this.desired.set(0, 0.65, -1.6).applyQuaternion(this.rotation).add(this.eye);
    }
    if (!moving && !this.pinned && !recordingLesson && target && now - this.anchorAt > 100) {
      this.anchorAt = now;
      this.bounds.makeEmpty();
      const owner = this.r.instrumentRegistry.getFromObject3D(target);
      const owners = t.step.target === "group" ? t.fixtures.honks : [owner].filter(Boolean);
      for (const h of owners) {
        if (h.kind === "honk" && h.noteLabelGroup && h.honkVisualRoot) {
          // Keep the shared pitch label adjacent to the animated hat.
          t.a.labelPresentation.styleNote(h);
          this.bodyBounds.setFromObject(h.honkVisualRoot);
          this.bodyBounds.getCenter(this.notePosition);
          this.notePosition.y =
            this.bodyBounds.max.y + MODEL_LABEL_SETTINGS.gap + MODEL_LABEL_SETTINGS.size * 0.6;
          h.noteLabelGroup.position.copy(h.root.worldToLocal(this.notePosition));
          h.noteLabelGroup.updateWorldMatrix(true, true);
        }
        this.bounds.expandByObject(h.root);
      }
      if (!this.bounds.isEmpty()) {
        this.bounds.getCenter(this.desired);
        // Panel bottom stays at least 10 cm above the face/controls.
        this.desired.y = this.bounds.max.y + 0.1 + 0.33 * panel.group.scale.y;
        // Avoid chasing far-away objects; Reset lesson brings the fixture back.
        if (this.desired.distanceTo(this.eye) > 3) this.desired.copy(panel.group.position);
      }
    }
    if (!t.host.navigation.menu.drag && visible) {
      panel.group.position.lerp(this.desired, alpha);
      this.look.position.copy(panel.group.position);
      this.look.lookAt(this.eye);
      panel.group.quaternion.slerp(this.look.quaternion, alpha);
      panel.group.updateMatrixWorld(true);
    }
    const showCues = visible && !["body", "group"].includes(t.step.target);
    this.ring.visible = Boolean(showCues && target);
    this.badge.visible = this.ring.visible;
    this.arrow.visible = false;
    if (this.ring.visible) {
      target.getWorldPosition(this.scratch);

      const label = t.step.id === "strike" ? "GRIP" : "TRIGGER";
      if (label !== this.badgeLabel) {
        this.badgeLabel = label;
        const ctx = this.badgeCanvas.getContext("2d");
        ctx.clearRect(0, 0, 384, 80);
        ctx.fillStyle = "#102321dd";
        ctx.beginPath();
        ctx.roundRect(2, 2, 380, 76, 30);
        ctx.fill();
        ctx.strokeStyle = "#ffcf20";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "#fff4dd";
        ctx.font = "600 38px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, 192, 54);
        this.badgeTexture.needsUpdate = true;
      }
      this.badge.position
        .copy(this.scratch)
        .add(new THREE.Vector3(0.27, -0.09, 0).applyQuaternion(this.rotation));
      this.badge.quaternion.copy(this.rotation);
      const wiring = ["honk-wire", "clock-wire"].includes(t.step.target);
      const squeeze = target === t.horn?.squeezeCollider;
      const radius = squeeze
        ? t.horn?.getSqueezeColliderSphere()?.radius * 1.18
        : basicsTargetRadius(target);
      updateBasicsTargetCue(this.ring, target, this.rotation, now, {
        radius,
        color: wiring ? BASICS_TARGET_COLORS.source : BASICS_TARGET_COLORS.action,
      });
      const cue =
        t.step.id === "ears"
          ? BASICS_EARS[t.objectives.size]
          : t.step.id === "volume"
            ? { direction: t.activeObjectives[0]?.startsWith("down-") ? -1 : 1 }
            : null;
      if (cue) {
        this.arrow.visible = visible;
        this.arrow.position
          .copy(this.scratch)
          .add(new THREE.Vector3(0.11, 0, 0).applyQuaternion(this.rotation));
        this.arrow.setDirection(new THREE.Vector3(0, cue.direction, 0));
      }
    }
    if (visible && ["bend", "pitch"].includes(t.step.id) && t.horn) {
      const sphere = t.horn.getSqueezeColliderSphere();
      const bend = t.horn.getProcessedLivePerformanceState().bend * getHonkPitchBendRange(t.horn);
      if (sphere)
        this.bend.update(
          {
            required: bend < -0.1 ? -1 : 1,
            actual: bend,
            destinationSemitones: bend < -0.1 ? -1 : 1,
            start: "Squeeze",
            destination: "Roll wrist",
            status: "Either direction · at least one semitone",
            onTarget: Math.abs(bend) >= 0.88,
          },
          sphere.center,
          Math.max(0.055, sphere.radius * 0.6),
          this.rotation,
          1,
          null,
          now,
        );
    } else this.bend.reset();
    this.spatial.update(showCues, now, this.rotation);
    panel.animate(now);
    if (panel.xr && visible) {
      const hit = this.r.controllers
        .filter((c) => !c.userData.virtualTutorial)
        .map((c) => t.host.panelHit(c))
        .find((h) => h?.object.userData.action);
      panel.hover(hit?.object);
    }
  }
  reset() {
    this.spatial.reset();
    this.recordStep = null;
    this.bendHaptics.reset();
    this.ring.visible = false;
    this.arrow.visible = false;
    this.badge.visible = false;
    this.bend.reset();
    this.pinned = false;
    this.anchorAt = -Infinity;
  }
  dispose() {
    this.spatial.dispose();
    this.bendHaptics.reset();
    this.bend.dispose();
    this.ring.removeFromParent();
    this.arrow.removeFromParent();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.badge.removeFromParent();
    this.badge.geometry.dispose();
    this.badge.material.dispose();
    this.badgeTexture.dispose();
    this.arrow.line.geometry.dispose();
    this.arrow.line.material.dispose();
    this.arrow.cone.geometry.dispose();
    this.arrow.cone.material.dispose();
  }
}
