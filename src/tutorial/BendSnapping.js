import { getHonkPitchBendRange } from "../config/honk.js";
import { scoreForStep } from "./scoring.js";

export const BEND_SNAP_ENTER_SEMITONES = 0.9;
export const BEND_SNAP_EXIT_SEMITONES = 1.2;
const MINIMUM_ROLL_SEMITONES = 0.18;
const applyBendStop = (value, stop) => !stop ? value : stop.direction > 0
  ? Math.min(value, stop.value) : Math.max(value, stop.value);

// Preserve note order, including returns to a previous pitch. A curve's
// interpolated samples are not notes; written pitch targets take precedence.
export function bendSnapSequence(event) {
  const authored = event.pitchTargets?.map(target => target.midi - event.midi);
  const curve = event.bend || [];
  const values = authored?.length && authored.every(Number.isFinite) ? authored :
    curve.filter((point, i) => i === 0 || i === curve.length - 1 ||
      (point.semitones - curve[i - 1].semitones) *
      (curve[i + 1].semitones - point.semitones) <= 0).map(point => point.semitones);
  return values.filter((value, i) => Number.isFinite(value) && (i === 0 || value !== values[i - 1]));
}

export class BendSnapping {
  constructor(adapter) {
    this.adapter = adapter;
    this.holds = new WeakMap();
    this.scores = new WeakMap();
  }
  scoreFor(guide) {
    let score = this.scores.get(guide);
    if (!score || score.step !== guide.step || score.anchor !== guide.anchorMs) {
      score = { step: guide.step, anchor: guide.anchorMs,
        events: guide.step.events || scoreForStep(guide.step), played: new Set() };
      this.scores.set(guide, score);
    }
    return score;
  }
  eventFor(guide, target, now) {
    if (!guide?.step || ["demonstration", "simulation"].includes(guide.mode) ||
        guide.complete === true) return null;
    const matches = event => this.adapter.ids(event.role).includes(target.id);
    if (guide.practiceGate) {
      const gate = guide.practiceGate;
      return now >= gate.anchorMs && gate.current && matches(gate.current) ? gate.current : null;
    }
    const score = this.scoreFor(guide);
    if (!guide.step.timed) return score.events.find(matches) || null;
    if (guide.anchorMs === null || now < guide.anchorMs ||
        guide.beatAt(now) < (guide.startBeat ?? score.events[0]?.beat ?? 0)) return null;
    // The score clock only guards count-in. Once playing, follow each hand's
    // actual note order, even when the tutorial has moved to a later event.
    return score.events.find(event => !score.played.has(event) && matches(event)) || null;
  }
  isSnapped(controller) {
    const hold = this.holds.get(controller);
    return Boolean(hold?.limited || Number.isFinite(hold?.snapped));
  }
  resolve(guide, controller, interaction, bend, now) {
    const target = interaction.instrumentState;
    const input = this.adapter.r.controllerStates.get(controller);
    const enabled = guide?.step && !["demonstration", "simulation"].includes(guide.mode) &&
      guide.complete !== true && input?.trigger && !input.stickActive && interaction.bendEnabled !== false &&
      !controller.userData?.virtualTutorial && controller.visible !== false &&
      controller.userData?.inputConnected !== false && target.root?.visible && !target.disposed;
    if (!enabled || !Number.isFinite(bend)) {
      this.holds.delete(controller);
      return bend;
    }
    const range = getHonkPitchBendRange(target);
    let hold = this.holds.get(controller);
    if (!hold || hold.guide !== guide || hold.step !== guide.step || hold.anchor !== guide.anchorMs ||
        (guide.practiceGate && hold.event !== guide.practiceGate.current) || hold.target !== target ||
        !this.adapter.ids(hold.event.role).includes(target.id) ||
        hold.range !== range || hold.reference !== interaction.bendStartInverseQuaternion ||
        !interaction.activeVoiceIds?.size) {
      const event = this.eventFor(guide, target, now);
      if (!event) { this.holds.delete(controller); return bend; }
      const sequence = bendSnapSequence(event);
      hold = { guide, step: guide.step, anchor: guide.anchorMs, event, target, range,
        reference: interaction.bendStartInverseQuaternion, sequence,
        next: sequence[0] === 0 && sequence.length > 1 ? 1 : 0,
        snapped: null, capturedAt: 0, complete: false, stop: null, limited: false };
      this.holds.set(controller, hold);
      if (!event.bend?.length && guide.step.timed && !guide.practiceGate)
        this.scoreFor(guide).played.add(event);
    }
    if (!hold.event.bend?.length) return bend;
    const value = bend * range;
    const eitherDirection = hold.event.bendSnapEitherDirection;
    const destination = eitherDirection ? Math.sign(value) : hold.sequence[hold.next];
    const previous = eitherDirection ? 0 : hold.sequence[hold.next - 1] ?? 0;
    const direction = Math.sign(destination - previous);
    const following = hold.sequence[hold.next + 1];
    // A turn or final note is a one-sided hard stop. Keep the last reached
    // stop while approaching the next note, so over-rotation cannot escape it.
    // Intermediate notes still allow travel toward a higher/lower next note.
    const stop = !eitherDirection && direction && Math.abs(destination) <= range &&
      (!Number.isFinite(following) || Math.sign(following - destination) !== direction)
      ? { value: destination, direction } : null;
    const bounded = applyBendStop(applyBendStop(value, hold.stop), stop);
    hold.limited = bounded !== value;
    // Measure a reversal from the furthest wrist roll, not the early magnetic
    // capture angle. Over-rotation must not make the return note harder to reach.
    if (hold.stop && !hold.complete && direction === -hold.stop.direction)
      hold.capturedAt = hold.stop.direction > 0
        ? Math.max(hold.capturedAt, value) : Math.min(hold.capturedAt, value);
    const movement = Math.min(MINIMUM_ROLL_SEMITONES, Math.abs(destination - previous) * 0.3);
    // Each captured note arms the next one. Fresh wrist movement is required:
    // overlapping zones must never play several notes from a stationary hand.
    const approaching = hold.complete || (value - hold.capturedAt) * direction >= movement;
    if (Number.isFinite(destination) && Math.abs(destination) <= range &&
        (!eitherDirection || destination !== 0) && approaching &&
        Math.abs(bounded - destination) <= BEND_SNAP_ENTER_SEMITONES + 1e-8) {
      if (hold.snapped !== destination) hold.capturedAt = value;
      hold.snapped = destination;
      if (stop) hold.stop = stop;
      if (!eitherDirection && !hold.complete) {
        if (hold.next < hold.sequence.length - 1) hold.next++;
        else {
          hold.complete = true;
          if (guide.step.timed && !guide.practiceGate) this.scoreFor(guide).played.add(hold.event);
        }
      }
      return destination / range;
    }
    if (hold.snapped !== null && Math.abs(bounded - hold.snapped) <= BEND_SNAP_EXIT_SEMITONES + 1e-8)
      return hold.snapped / range;
    hold.snapped = null;
    return bounded / range;
  }
}
