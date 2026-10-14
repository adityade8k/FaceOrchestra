import { BendGauge } from "./BendGauge.js";
import { bendGaugeState } from "./bendGaugeState.js";
import { visualCueTime } from "./GuidedPlayOffset.js";
import { observeBendGesture } from "./observeBendGesture.js";
import { BendHaptics } from "./BendHaptics.js";
import * as THREE from "three";
import { scoreForStep } from "./scoring.js";
import { timingCueState } from "./timingCueState.js";
import { attackCueState } from "./attackCueState.js";
import { createNoteSquare, disposeNoteSquare, setNoteSquare, noteSquareScale,
  NOTE_SQUARE_REST_SCALE } from "./NoteSquare.js";
import {
  bendCueState,
  bendCueDisplacement,
  BEND_PRACTICE_DURATION_MS,
} from "./bendCueState.js";

// Musical phases are derived from the attempt clock, with no timers or UI cadence.
export class TutorialTimingCues {
  constructor(adapter, { createCanvas } = {}) {
    this.adapter = adapter;
    this.bendHaptics = new BendHaptics(adapter);
    this.gauge = new BendGauge(adapter.r.scene, createCanvas);
    this.geometry = new THREE.RingGeometry(1, 1.06, 48);
    // At full sustain the yellow outer edge meets the white circle's inner edge.
    this.sustainGeometry = new THREE.RingGeometry(0.94, 1, 48);
    const square = new THREE.Shape();
    square.moveTo(-1.06, -1.06); square.lineTo(1.06, -1.06);
    square.lineTo(1.06, 1.06); square.lineTo(-1.06, 1.06); square.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-1, -1); hole.lineTo(-1, 1);
    hole.lineTo(1, 1); hole.lineTo(1, -1); hole.closePath();
    square.holes.push(hole);
    this.squareGeometry = new THREE.ShapeGeometry(square);
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.startQuaternion = new THREE.Quaternion();
    this.right = new THREE.Vector3();
    this.localRight = new THREE.Vector3();
    this.localUp = new THREE.Vector3();
    this.bendInstruction = "";
    this.releasedGuide = null;
    // The authored Kuch score reaches six eligible states. Selection still
    // reserves capacity for current/nearest actions before decorative releases.
    this.candidates = [];
    this.drawnRoles = new Set();
    this.noteOutlines = new Map();
    this.pool = Array.from({ length: 6 }, () => {
      const make = (color, geometry = this.geometry) => {
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.92,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        // Headset guidance stays outside instrument/UI capture roots.
        mesh.name = geometry === this.squareGeometry ? "Tutorial current-note square" : "Tutorial timing ring";
        mesh.raycast = () => {};
        mesh.renderOrder = 100;
        mesh.visible = false;
        adapter.r.scene.add(mesh);
        return mesh;
      };
      const reference = make(0xffffff);
      reference.name = "Tutorial next-note circle";
      reference.material.opacity = 0.25;
      const white = make(0xffffff);
      white.name = "Tutorial sustain boundary";
      white.renderOrder = 101;
      const yellow = make(0xffd15a, this.sustainGeometry);
      yellow.name = "Tutorial sustain progress";
      const hand = createNoteSquare("Tutorial active-note square");
      setNoteSquare(hand, true);
      hand.visible = false; hand.raycast = () => {}; hand.renderOrder = 101;
      adapter.r.scene.add(hand);
      return {
        hand,
        white,
        yellow,
        green: make(0x60ef9b),
        red: make(0xff4141, this.squareGeometry),
        reference,
        bend: make(0xffad38),
      };
    });
    this.step = null;
    this.events = [];
  }
  reset() {
    this.bendHaptics.reset();
    this.gauge.reset();
    for (const pair of this.pool)
      for (const mesh of Object.values(pair)) mesh.visible = false;
    for (const outline of this.noteOutlines.values()) outline.visible = false;
    this.step = null;
    this.bendInstruction = "";
    this.releasedGuide = null;
    this.candidates.length = 0;
    this.events = [];
  }
  update(session, now, { active = true } = {}) {
    this.updateCues(session, now, { active });
    if (active && session?.step && session.mode !== "demonstration" && session.mode !== "simulation") {
      this.bendHaptics.update(this.bendEvents);
    } else this.bendHaptics.reset();
  }
  updateCues(session, now, { active = true } = {}) {
    this.gauge.reset();
    this.sessionMode = session?.mode;
    this.now = now;
    this.cueBeat = null;
    this.beatMs = session?.beatMs;
    for (const pair of this.pool)
      for (const mesh of Object.values(pair)) mesh.visible = false;
    for (const outline of this.noteOutlines.values()) outline.visible = false;
    this.bendInstruction = "";
    if (!session?.step || !active) return;
    const step = session.step;
    if (this.step !== step) {
      this.step = step;
      this.events = step.events || scoreForStep(step);
      this.bendEvents = this.events.filter(event => event.bend?.length);
      this.releasedGuide = null;
    }
    this.adapter.r.getUserCamera().getWorldQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    this.updateNoteOutlines(step);
    if (session.practiceGate) {
      const gate = session.practiceGate;
      gate.update(now, this.adapter.gestures.values());
      const event = gate.current;
      if (!event) { this.adapter.handIndicators?.update([]); return; }
      const countIn = now < gate.anchorMs;
      const state = {
        phase: countIn ? "prepare" : gate.isStrike(event) ? "strike" : "hold",
        isNext: countIn, event,
        fraction: gate.active ? gate.fraction : -1,
        sustainGesture: gate.active,
        sustainFraction: gate.active ? gate.fraction : -1,
        bend: bendCueState(event.bend, gate.active ? gate.fraction : 0, event),
      };
      const pair = this.pool[0];
      this.show(pair, event.role, state, gate.isStrike(event));
      for (const mesh of Object.values(pair)) Object.assign(mesh.userData, {
        eventId: event.id, role: event.role, phase: state.phase,
        sustainFraction: gate.fraction, readyToRelease: gate.readyToRelease,
      });
      const next = !countIn && gate.events[gate.index + 1];
      if (next) {
        const preview = this.pool[1];
        this.show(preview, next.role, { phase: "next", isNext: true, event: next, fraction: -1 }, gate.isStrike(next));
        for (const mesh of Object.values(preview)) Object.assign(mesh.userData, {
          eventId: next.id, role: next.role, phase: "next",
        });
      }
      // Existing note squares are highlighted from this cursor, never time.
      this.adapter.handIndicators?.update(countIn ? [] : [event], event.beat ?? 0, session.beatMs);
      return;
    }
    const percussion =
      ["drums", "strike"].includes(step.type) ||
      (step.type === "record" && step.looperRole === "percussionLooper");
    if (!step.timed || session.anchorMs === null) {
      const role = step.role || this.events[0]?.role || step.looperRole;
      const h = this.adapter.get(role);
      if (!h || h.pendingPlacement) return;
      let gesture = null,
        controller = null;
      for (const [candidate, g] of this.adapter.gestures)
        if (g.role === role) {
          gesture = g;
          controller = candidate;
          break;
        }
      const strike = this.adapter.lastStrikes.get(role);
      const cue =
        percussion &&
        session.mode === "demonstration" &&
        session.cueAnchorMs !== undefined
          ? timingCueState(
              (now - session.cueAnchorMs) / session.beatMs,
              { beat: 1 },
              { percussion: true },
            )
          : percussion && strike !== undefined
            ? timingCueState(
                (now - strike) / session.beatMs,
                { beat: 0 },
                { percussion: true },
              )
            : null;
      // Waiting consumes no hold time. A completed/withdrawn strike has no
      // lingering ring.
      if (percussion && strike !== undefined && !cue) return;
      if (!gesture && this.releasedGuide?.role === role) return;
      let state = cue || { phase: "prepare", yellow: 0, green: 0 };
      if (gesture) {
        const elapsed = now - gesture.startMs;
        this.releasedGuide = { role, at: now };
        const duration = step.bend
          ? BEND_PRACTICE_DURATION_MS
          : Math.max((step.minimumMs || 0) + 100, 600);
        // Waiting consumes no bend-guide time. Keep the settled target until
        // actual release even if the learner holds beyond the example duration.
        state = timingCueState(elapsed, { beat: 0, beats: duration }) || {
          phase: "hold",
          yellow: 0,
          green: 0,
        };
        state.bend = bendCueState(
          step.bend,
          Math.min(1, elapsed / BEND_PRACTICE_DURATION_MS),
          step,
        );
        if (this.isVoicedGesture(gesture)) {
          state.sustainGesture = gesture;
          state.sustainFraction = this.sustainFraction(gesture,
            this.adapter.sustainTimings?.get(gesture)?.durationMs ?? step.minimumMs ?? duration);
        }
      } else if (step.bend) {
        state = { phase: "prepare", yellow: 0, green: 1.35 };
      }
      state.event = step;
      state.fraction = gesture
        ? Math.min(1, (now - gesture.startMs) / BEND_PRACTICE_DURATION_MS)
        : -1;
      this.show(this.pool[0], role, state, percussion, controller);
      return;
    }
    // Advance only the score-facing cue clock. Observations, active sustain
    // circles, practice gates and assessment continue to use real time.
    const beat = session.beatAt(visualCueTime(this.adapter.r, now));
    this.cueBeat = beat;
    this.adapter.handIndicators?.update?.(this.events, beat, session.beatMs);
    const attackNext = step.cueStyle === "attack-next";
    const nextBeat = this.events.find(e => e.role && e.beat > beat)?.beat;
    const candidates = this.candidates;
    candidates.length = 0;
    for (const event of this.events) {
      if (!event.role) continue;
      const options = {
        percussion,
        beatMs: session.beatMs,
        nextBeat,
      };
      if (attackNext && event.beat === nextBeat) {
        // One yellow motion per Honk: a repeat counts down in the available
        // gap after the previous hold, without covering its release guidance.
        const previous = this.events.findLast(e => e.role === event.role && e.beat < event.beat);
        options.prepareStartBeat = Math.max(event.beat - 1, previous ? previous.beat + previous.beats : -Infinity);
      }
      const state = (attackNext ? attackCueState(beat, event, options) : timingCueState(beat, event, options)) ||
        (event.beat === nextBeat ? { phase: "next" } : null);
      if (!state) continue;
      state.isNext = event.beat === nextBeat;
      const priority =
        ["prepare", "next"].includes(state.phase)
          ? 1
          : ["release", "withdraw"].includes(state.phase)
            ? 2
            : 0;
      const distance = Math.abs(beat - event.beat);
      // One countdown per physical target: a more distant repeated attack must
      // not overlap its nearer countdown. Current hold + next attack may coexist.
      const duplicate = candidates.findIndex(
        (c) => c.event.role === event.role && c.priority === priority,
      );
      if (duplicate >= 0) {
        if (candidates[duplicate].distance <= distance) continue;
        candidates.splice(duplicate, 1);
      }
      const candidate = { event, state, priority, distance };
      let at = candidates.findIndex(
        (c) =>
          priority < c.priority ||
          (priority === c.priority && distance < c.distance),
      );
      if (at < 0) at = candidates.length;
      if (at < this.pool.length) {
        candidates.splice(at, 0, candidate);
        if (candidates.length > this.pool.length) candidates.pop();
      }
    }
    this.drawnRoles.clear();
    let index = 0;
    for (const { event, state, priority } of candidates) {
      if (priority === 2 && this.drawnRoles.has(event.role)) continue;
      const repeat = this.drawnRoles.has(event.role);
      if (repeat) state.yellow = 0;
      state.bend = bendCueState(
        event.bend,
        (beat - event.beat) / event.beats,
        event,
      );
      state.event = event;
      state.fraction = (beat - event.beat) / event.beats;
      if (!percussion && state.phase === "hold") {
        for (const gesture of this.adapter.gestures.values()) {
          if (gesture.role !== event.role || !this.isVoicedGesture(gesture)) continue;
          state.sustainGesture = gesture;
          state.sustainFraction = this.sustainFraction(gesture,
            this.adapter.sustainTimings?.get(gesture)?.durationMs ?? event.minimumMs ?? (Number.isFinite(event.beats)
              ? event.beats * session.beatMs : event.durationSeconds !== undefined
              ? event.durationSeconds * 1000 : event.beats * session.beatMs));
          break;
        }
      }
      const pair = this.pool[index++];
      this.show(pair, event.role, state, percussion);
      for (const mesh of Object.values(pair))
        Object.assign(mesh.userData, {
          eventId: event.id,
          role: event.role,
          phase: state.phase,
        });
      this.drawnRoles.add(event.role);
    }
  }
  isVoicedGesture(gesture) {
    return gesture.voiced && !gesture.invalidMembers && !gesture.voiceInterrupted;
  }
  updateNoteOutlines(step) {
    const percussion = ["drums", "strike"].includes(step.type) ||
      (step.type === "record" && step.looperRole === "percussionLooper");
    const roles = new Set(this.events.map(e => e.role).filter(Boolean));
    if (step.role) roles.add(step.role);
    for (const role of roles) {
      if (this.adapter.handIndicators?.labels.has(role)) continue;
      const h = this.adapter.get(role);
      if (!h?.root?.visible || h.disposed || h.pendingPlacement) continue;
      let square = this.noteOutlines.get(role);
      if (!square) {
        square = createNoteSquare(`Tutorial inactive-note square: ${role}`);
        this.noteOutlines.set(role, square);
        this.adapter.r.scene.add(square);
      }
      const sphere = !percussion && h.getSqueezeColliderSphere?.();
      let point = sphere?.center || h.root.getWorldPosition(this.position);
      if (percussion) {
        try { point = this.adapter.cacheStrikeTarget(role) || point; }
        catch { continue; }
      }
      square.position.copy(point)
        .addScaledVector(this.right, (sphere?.radius || .065) * 1.4);
      square.quaternion.copy(this.quaternion);
      square.scale.setScalar((sphere?.radius || .065) * .9 * NOTE_SQUARE_REST_SCALE);
      square.visible = true;
    }
  }
  sustainFraction(gesture, durationMs) {
    if (!(durationMs > 0)) return -1;
    return THREE.MathUtils.clamp(
      (this.now - (gesture.voicedStartMs ?? gesture.startMs)) / durationMs, 0, 1);
  }
  showSustain(pair, target, state) {
    const fraction = state.sustainFraction;
    if (!state.sustainGesture || !(fraction >= 0)) return;
    // Practice accepts the correct pitch from either hand. Anchor feedback on
    // the instrument that is actually sounding, including a retained bend.
    target = this.adapter.r.instrumentRegistry?.get(state.sustainGesture.targetId) || target;
    if (!target?.root?.visible || target.disposed || target.pendingPlacement) return;
    const sphere = target.getSqueezeColliderSphere?.();
    const center = sphere?.center || target.root.getWorldPosition(this.position);
    // On bent notes, keep both sustain rings inside the bend gauge's dot and
    // arrow paths so pressing Trigger cannot cover either pitch indicator.
    const ringScale = state.event?.bend?.length ? 0.95 : 1.35;
    const radius = (sphere?.radius || 0.065) * 1.12 * ringScale;
    for (const mesh of [pair.white, pair.yellow]) {
      mesh.position.copy(center);
      mesh.quaternion.copy(this.quaternion);
      mesh.visible = true;
      mesh.userData.sustainFraction = fraction;
      mesh.userData.readyToRelease = fraction >= 1;
    }
    pair.white.scale.setScalar(radius);
    pair.yellow.scale.setScalar(radius * fraction);
  }
  show(pair, role, state, percussion, controller = null) {
    const observation =
      state.event?.bend && state.fraction >= 0
        ? observeBendGesture(this.adapter, role, this.sessionMode)
        : null;
    if (observation) controller = observation.controller;
    const h = observation?.target || this.adapter.get(role);
    if (!h?.root?.visible || h.disposed || h.pendingPlacement) return;
    const sphere = !percussion && h.getSqueezeColliderSphere?.();
    let point = sphere?.center;
    if (!point && !percussion) point = h.root.getWorldPosition(this.position);
    if (!point) {
      try {
        point = this.adapter.cacheStrikeTarget(role) || h.root.position;
      } catch {
        return;
      }
    }
    const radius = sphere?.radius || 0.065;
    pair.reference.position.copy(point);
    pair.reference.quaternion.copy(this.quaternion);
    const current = state.phase === "hold" || state.phase === "strike";
    const referenceScale = (state.isNext ?? !current) && !["release", "withdraw"].includes(state.phase) ? 1.35 : 0;
    pair.reference.scale.setScalar(radius * 1.12 * referenceScale);
    pair.reference.visible = referenceScale > 0;
    if (current && !this.adapter.handIndicators?.labels.has(role)) {
      const outline = this.noteOutlines.get(role);
      if (outline) outline.visible = false;
      pair.hand.position.copy(point).addScaledVector(this.right, radius * 1.4);
      pair.hand.quaternion.copy(this.quaternion);
      pair.hand.scale.setScalar(radius * .9 * noteSquareScale(state.event, this.cueBeat, this.beatMs));
      pair.hand.visible = true;
    }
    if (percussion) return;
    this.showSustain(pair, h, state);
    if (!controller)
      for (const [candidate, g] of this.adapter.gestures)
        if (g.role === role) {
          controller = candidate;
          break;
        }
    controller ||=
      this.adapter.r.controllers?.find((c) => !c.userData.virtualTutorial) ||
      this.adapter.virtuals?.[0];
    const input = this.adapter.r.controllerStates.get(controller);
    const inverse =
      input?.activeTriggerInteraction?.bendStartInverseQuaternion ||
      input?.raySqueezeStartInverseQuaternion;
    if (inverse && this.adapter.gestures.has(controller))
      this.startQuaternion.copy(inverse).invert();
    else if (controller) controller.getWorldQuaternion(this.startQuaternion);
    else this.startQuaternion.copy(this.quaternion);
    this.localRight.set(1, 0, 0).applyQuaternion(this.startQuaternion);
    this.localUp.set(0, 1, 0).applyQuaternion(this.startQuaternion);
    const displacement = bendCueDisplacement(
      state.bend?.rollRadians || 0,
      this.localRight.dot(this.right),
      this.localUp.dot(this.right),
    );
    const marker = pair.bend;
    marker.position
      .copy(point)
      .addScaledVector(this.right, displacement * radius);
    marker.quaternion.copy(this.quaternion);
    marker.scale.setScalar(radius * 0.24);
    marker.visible = false;
    if (
      state.event?.bend &&
      (state.phase === "prepare" || state.fraction >= 0) &&
      state.fraction <= 1 &&
      !this.gauge.root.visible
    ) {
      const gauge = bendGaugeState(state.event, state.fraction, observation);
      if (gauge) {
        if (!this.bendInstruction) this.bendInstruction = gauge.instruction;
        // A small positive local wrist roll projects to this screen direction.
        const orientation =
          bendCueDisplacement(
            0.1,
            this.localRight.dot(this.right),
            this.localUp.dot(this.right),
          ) >= 0
            ? 1
            : -1;
        this.gauge.update(
          gauge,
          point,
          radius,
          this.quaternion,
          orientation,
          observation,
          this.now,
        );
      }
      marker.visible = false;
    }
    if (state.bend && !this.bendInstruction)
      this.bendInstruction = state.bend.instruction;
  }
  captureRoots() {
    return [
      this.gauge.root,
      ...this.noteOutlines.values(),
      ...this.pool.flatMap((pair) => Object.values(pair)),
    ];
  }
  dispose() {
    this.bendHaptics.reset();
    this.gauge.dispose();
    for (const pair of this.pool)
      for (const mesh of Object.values(pair)) {
        if (mesh === pair.hand) disposeNoteSquare(mesh);
        else { mesh.removeFromParent(); mesh.material.dispose(); }
      }
    for (const square of this.noteOutlines.values()) disposeNoteSquare(square);
    this.noteOutlines.clear();
    this.geometry.dispose();
    this.sustainGeometry.dispose();
    this.squareGeometry.dispose();
  }
}
