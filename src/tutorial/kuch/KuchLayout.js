import * as THREE from "three";
import { tuningForMidi } from "../composition.js";
import {
  connectTutorialClock,
  connectTutorialHonk,
} from "../TutorialRoutes.js";
import { BPM, VOICINGS, PITCHES } from "./score.js";
const LOOPER_ROLES = ["chordLooper", "alternativeLooper", "percussionLooper"];
// Shared scene setup for lessons and recording; never starts a tutorial session.
export class KuchLayout {
  constructor(host) {
    this.host = host;
    this.r = host.r;
    this.a = host.adapter;
    this.labels = [];
    this.labelBounds = new THREE.Box3();
  }
  setup() {
    // Dense live chord recording needs more headroom than a single Honk.
    this.output = this.r.audioSystem.masterBus.output;
    const now = this.r.audioSystem.getCurrentTime(),
      pending = this.host.kuchOutputRestore;
    this.outputGainBefore =
      pending?.output === this.output && pending.at > now
        ? pending.value
        : this.output.gain.value;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.outputGainBefore * 0.6, now);
    this.host.kuchOutputRestore = null;
    this.a.begin("learner");
    const spawn = (kind, role, x, y, z, scale, midi) => {
      const root = this.r.createSpawnedComponent(kind, {
        name: role,
        baseScale: scale,
        ...(midi === undefined ? {} : { tuning: tuningForMidi(midi) }),
      });
      if (!root) throw new Error(`Could not create ${role}.`);
      const h = this.r.activeInstrumentState;
      h.root.position.copy(
        new THREE.Vector3(x, y, z)
          .applyQuaternion(this.a.layoutRotation)
          .add(this.a.anchor),
      );
      h.root.quaternion.copy(this.a.layoutRotation);
      h.root.updateMatrixWorld(true);
      if (kind === "looper") this.r.syncLooperTransformReference(h);
      this.a.roles.set(role, [...(this.a.roles.get(role) || []), h.id]);
      if (kind === "honk") {
        h.setVowel("O");
        h.setNose((1 - 80 / 127) / 0.78);
        this.a.labelPresentation.styleNote(h);
      }
      return h;
    };
    for (const [role, midis] of Object.entries(VOICINGS)) {
      midis.forEach((m, i) =>
        spawn(
          "honk",
          role,
          (role === "D" ? -0.31 : 0.32) + (i - (midis.length - 1) / 2) * 0.088,
          0.02,
          -0.2,
          1.65,
          m,
        ),
      );
      this.label(role, `${role} major`);
    }
    PITCHES.forEach((m, i) => {
      spawn(
        "honk",
        `lead-${m}`,
        ((i % 6) - 2.5) * 0.175,
        0.72 - Math.floor(i / 6) * 0.3,
        -0.12,
        1.1,
        m,
      );
    });
    spawn("looper", "chordLooper", -0.31, -0.37, 0.16, 0.6);
    spawn("looper", "alternativeLooper", -0.04, -0.37, 0.16, 0.6);
    spawn("looper", "percussionLooper", 0.24, -0.37, 0.16, 0.6);
    spawn("honk", "percussion", 0.69, -0.31, 0.16, 1.65, 48);
    spawn("metronome", "metronome", -0.68, -0.32, 0.16, 0.65);
    this.label("chordLooper", "D PATTERN");
    this.label("alternativeLooper", "CHANGE PATTERN · SAME OUTPUT");
    this.label("percussionLooper", "STICK LOOP · HIHAT");
    this.label("percussion", "BOINK");
    this.label("metronome", "METRONOME");
    for (const role of ["D", "C", "percussion"])
      connectTutorialHonk(this.a, role);
    for (const role of ["D", "C"])
      connectTutorialHonk(this.a, role, "alternativeLooper");
    for (const role of LOOPER_ROLES) {
      connectTutorialClock(this.a, role);
      this.r.setLooperControlValue(this.a.get(role), "recordLength", 1);
      this.r.setLooperControlValue(this.a.get(role), "gap", -1);
      this.r.setLooperControlValue(
        this.a.get(role),
        "volume",
        role !== "percussionLooper" ? -0.62 : -0.66,
      );
    }
    const metro = this.a.get("metronome");
    metro.setBpm(BPM);
    metro.setVolume(0.12);
    this.r.updateMetronomeLabel(metro);
  }
  label(role, text) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff4dd";
    ctx.font = "600 30px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 43);
    const texture = new THREE.CanvasTexture(canvas),
      sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthTest: false }),
      );
    sprite.scale.set(0.31, 0.039, 1);
    sprite.userData.role = role;
    sprite.raycast = () => {};
    this.r.scene.add(sprite);
    this.labels.push(sprite);
  }
  updateLabels() {
    for (const sprite of this.labels) {
      const members = this.a.members(sprite.userData.role);
      sprite.visible = members.length > 0;
      if (members.length) {
        const box = this.labelBounds.makeEmpty();
        for (const h of members)
          box.union(this.a.labelPresentation.instrumentBounds(h));
        box.getCenter(sprite.position);
        sprite.position.y = box.max.y + 0.04;
      }
    }
  }
  afterFrame(now) {
    this.a.observe(now);
    this.updateLabels();
  }
  dispose() {
    if (this.output) {
      const at = this.r.audioSystem.getCurrentTime() + 0.15;
      this.output.gain.setValueAtTime(this.outputGainBefore, at);
      this.host.kuchOutputRestore = {
        output: this.output,
        value: this.outputGainBefore,
        at,
      };
    }
    for (const sprite of this.labels) {
      sprite.removeFromParent();
      sprite.material.map.dispose();
      sprite.material.dispose();
    }
    this.labels = [];
  }
}
