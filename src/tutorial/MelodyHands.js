import { Quaternion, Vector3 } from "three";
import { createNoteSquare, disposeNoteSquare, setNoteSquare, noteSquareScale,
  NOTE_SQUARE_SIZE, NOTE_SQUARE_REST_SCALE } from "./NoteSquare.js";
import { bendAt } from "../compositions/jog/definition.js";
import { BEND_SENSITIVITY, MAX_PITCH_BEND_SEMITONES } from "../config/honk.js";

// Two ordinary controller rays, not a second sound path. Hand identity is a
// teaching suggestion only; note assessment never checks the controller ID.
export class MelodyHands {
  constructor(ensemble) {
    this.ensemble = ensemble; this.a = ensemble.a; this.r = ensemble.r;
    this.notes = {}; this.labels = new Map(); this.offset = new Vector3();
    this.rollStarts = {}; this.roll = new Quaternion(); this.rollAxis = new Vector3(0, 0, 1);
    this.a.handIndicators = this;
    const melodyRoles = new Set(ensemble.definition.score.events.map(e => e.role));
    // A live melody can retain palette notes that now occur only inside bends.
    const fullPalette = ensemble.definition.playback === "honk-live-two-hand-v1";
    for (const recipe of ensemble.definition.arrangement.recipes.filter(r => r.kind === "honk" && (fullPalette || r.part === "melody" || melodyRoles.has(r.role)))) {
      const sprite = createNoteSquare(`Tutorial note square: ${recipe.role}`);
      sprite.scale.setScalar(NOTE_SQUARE_SIZE * NOTE_SQUARE_REST_SCALE);
      this.r.scene.add(sprite); this.labels.set(recipe.role, sprite);
    }
  }
  trigger(hand, role, active, now, semitones = 0) {
    const controller = this.a.virtuals[hand === "R" ? 0 : 1];
    if (!active) { this.a.input(controller, "trigger", false, now); this.a.park(controller); delete this.rollStarts[hand]; return; }
    const h = this.a.get(role), state = this.r.controllerStates.get(controller);
    if (!h?.isPlayable()) throw new Error(`Missing melody target ${role}`);
    if (!state.trigger) {
      h.root.getWorldQuaternion(controller.quaternion);
      this.rollStarts[hand] = controller.quaternion.clone();
      controller.position.copy(h.getSqueezeColliderSphere().center)
        .add(this.offset.set(0, 0, .38).applyQuaternion(controller.quaternion));
      controller.updateMatrixWorld(true);
      if (this.r.getCurrentHit(controller)?.object !== h.squeezeCollider) throw new Error(`Cannot select ${role}; move it clear of other controls.`);
      this.a.input(controller, "trigger", true, now);
    }
    if (this.rollStarts[hand]) {
      this.roll.setFromAxisAngle(this.rollAxis, semitones / MAX_PITCH_BEND_SEMITONES / BEND_SENSITIVITY);
      controller.quaternion.copy(this.rollStarts[hand]).multiply(this.roll);
      controller.updateMatrixWorld(true);
    }
  }
  play(events, beat, now, { swapHands = false } = {}) {
    const next = Object.fromEntries(["R", "L"].map(hand => [hand, events.find(e => e.hand === hand && beat >= e.beat && beat < e.beat + e.beats)]));
    let released = false;
    for (const hand of ["R", "L"]) if (next[hand]?.id !== this.notes[hand]) {
      this.trigger(swapHands ? hand === "R" ? "L" : "R" : hand, null, false, now); released = true;
    }
    if (released) { this.r.updateHorn(now); this.a.observe(now); }
    // Preserve attack order when two near-simultaneous MIDI notes become due
    // in the same animation frame, regardless of which hand plays first.
    for (const hand of ["R", "L"].sort((a, b) => (next[a]?.beat ?? Infinity) - (next[b]?.beat ?? Infinity))) {
      const changed = next[hand]?.id !== this.notes[hand];
      this.notes[hand] = next[hand]?.id;
      if (next[hand]) {
        const note = next[hand];
        this.trigger(swapHands ? hand === "R" ? "L" : "R" : hand, note.role, true, now,
          bendAt(note.bend, (beat - note.beat) / note.beats));
        if (changed) this.r.updateHorn(now);
      }
    }
  }
  update(events = null, beat = 0, beatMs = 60000 / (this.ensemble.metro?.bpm || this.ensemble.definition.bpm)) {
    for (const [role, sprite] of this.labels) {
      const h = this.a.get(role), event = events?.findLast(e => e.role === role && beat >= e.beat && beat < e.beat + e.beats);
      sprite.visible = Boolean(h?.root.visible);
      if (!sprite.visible) continue;
      const sphere = h.getSqueezeColliderSphere();
      const scale = this.ensemble.layoutFrame?.visualScaleFor(role) ?? 1;
      this.offset.set(.07, .07, 0).multiplyScalar(scale).applyQuaternion(this.ensemble.layoutFrame?.root.quaternion || this.a.layoutRotation);
      sprite.position.copy(sphere.center).add(this.offset);
      this.r.getUserCamera?.().getWorldQuaternion(sprite.quaternion);
      setNoteSquare(sprite, Boolean(event));
      sprite.scale.setScalar(NOTE_SQUARE_SIZE * scale * (event
        ? noteSquareScale(event, beat, beatMs) : NOTE_SQUARE_REST_SCALE));
      sprite.userData.eventId = event?.id;
    }
  }
  release() {
    for (const hand of ["R", "L"]) this.trigger(hand, null, false, performance.now());
    this.notes = {};
    this.update();
  }
  dispose() {
    this.release();
    for (const sprite of this.labels.values()) disposeNoteSquare(sprite);
    this.labels.clear();
    if (this.a.handIndicators === this) this.a.handIndicators = null;
  }
}
