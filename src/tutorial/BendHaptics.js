import { getHonkPitchBendRange } from "../config/honk.js";
import { observeBendGesture } from "./observeBendGesture.js";

export const BEND_HAPTIC_PULSE = Object.freeze({ intensity: 0.55, durationMs: 18 });
const EPSILON = 1e-8;
const REARM_SEMITONES = 0.08;

// The numbered gauge marks are semitones. Include authored fractional holds
// and turning points too, without treating interpolated curve samples as stops.
export function bendHapticStops(events, range = 4) {
  const stops = new Set();
  for (let value = -range; value <= range; value++) stops.add(value);
  for (const event of events) {
    const curve = event.bend || [];
    for (let i = 0; i < curve.length; i++) {
      const value = curve[i].semitones;
      if (!Number.isFinite(value) || Math.abs(value) > range) continue;
      const before = value - curve[i - 1]?.semitones;
      const after = curve[i + 1]?.semitones - value;
      if (i === 0 || i === curve.length - 1 || before * after <= 0) stops.add(value);
    }
  }
  return [...stops].sort((a, b) => a - b)
    .filter((value, i, values) => i === 0 || value - values[i - 1] > EPSILON);
}

export class BendHaptics {
  constructor(adapter) {
    this.adapter = adapter;
    this.holds = new Map();
    this.events = null;
    this.roles = new Map();
  }
  reset() {
    this.holds.clear();
    this.events = null;
    this.roles.clear();
  }
  update(events = []) {
    if (events !== this.events) {
      this.reset();
      this.events = events;
      for (const event of events) {
        if (!event.role) continue;
        if (!this.roles.has(event.role)) this.roles.set(event.role, []);
        this.roles.get(event.role).push(event);
      }
    }
    const observations = [];
    for (const [controller, gesture] of this.adapter.gestures) {
      const targets = this.roles.get(gesture.role);
      if (!targets || controller.userData?.virtualTutorial || gesture.origin !== "learner" ||
          controller.visible === false || controller.userData?.inputConnected === false) continue;
      const observation = observeBendGesture(this.adapter, gesture.role, "practice");
      if (!observation || observation.controller !== controller) continue;
      observations.push({ ...observation, gestureId: gesture.id, events: targets,
        semitones: observation.target.getLivePerformanceState().bend * getHonkPitchBendRange(observation.target) });
    }
    this.updateObservations(observations);
  }
  updateObservations(observations) {
    const runtime = this.adapter.r, seen = new Set();
    for (const observation of observations) {
      const { controller, gestureId, events = [], semitones: value } = observation;
      const gamepad = runtime.getControllerGamepad?.(controller);
      if (!gamepad || !runtime.hapticsService || !Number.isFinite(value)) continue;
      const range = getHonkPitchBendRange(observation.target);
      seen.add(controller);
      let hold = this.holds.get(controller);
      if (!hold || hold.gestureId !== gestureId || hold.target !== observation.target || hold.range !== range) {
        const stops = bendHapticStops(events, range);
        const gap = Math.min(...stops.slice(1).map((stop, i) => stop - stops[i]));
        hold = { gestureId, target: observation.target, range, previous: value,
          stops, rearm: Math.min(REARM_SEMITONES, gap / 4), disarmed: new Set() };
        for (const stop of stops) if (Math.abs(value - stop) <= EPSILON) hold.disarmed.add(stop);
        this.holds.set(controller, hold);
      }
      let crossed = false;
      for (const stop of hold.stops) {
        if (hold.disarmed.has(stop)) {
          if (Math.abs(value - stop) > hold.rearm) hold.disarmed.delete(stop);
          continue;
        }
        if ((hold.previous < stop - EPSILON && value >= stop - EPSILON) ||
            (hold.previous > stop + EPSILON && value <= stop + EPSILON)) {
          crossed = true;
          if (Math.abs(value - stop) <= hold.rearm) hold.disarmed.add(stop);
        }
      }
      hold.previous = value;
      // Coalesce crossings within one frame into one thud; never queue late
      // pulses that would point to a wrist angle the learner has already left.
      if (crossed) runtime.hapticsService?.pulse(
        gamepad, BEND_HAPTIC_PULSE,
      )?.catch?.(() => {});
    }
    for (const controller of this.holds.keys()) if (!seen.has(controller)) this.holds.delete(controller);
  }
}
