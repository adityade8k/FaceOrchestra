import { BendGauge } from "./BendGauge.js";
import { bendGaugeState } from "./bendGaugeState.js";
import { observeBendGesture } from "./observeBendGesture.js";
import * as THREE from "three";
import { scoreForStep } from "./scoring.js";
import { timingCueState } from "./timingCueState.js";
import {
  bendCueState,
  bendCueDisplacement,
  BEND_PRACTICE_DURATION_MS,
} from "./bendCueState.js";

// Musical phases are derived from the attempt clock, with no timers or UI cadence.
export class TutorialTimingCues {
  constructor(adapter, { createCanvas } = {}) {
    this.adapter = adapter;
    this.gauge = new BendGauge(adapter.r.scene, createCanvas);
    this.geometry = new THREE.RingGeometry(1, 1.06, 48);
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
    this.pool = Array.from({ length: 6 }, () => {
      const make = (color) => {
        const mesh = new THREE.Mesh(
          this.geometry,
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
        mesh.name = "Tutorial timing ring";
        mesh.raycast = () => {};
        mesh.renderOrder = 100;
        mesh.visible = false;
        adapter.r.scene.add(mesh);
        return mesh;
      };
      const reference = make(0xfff4dd);
      reference.material.opacity = 0.45;
      return {
        yellow: make(0xffd15a),
        green: make(0x60ef9b),
        reference,
        bend: make(0xffad38),
      };
    });
    this.step = null;
    this.events = [];
  }
  reset() {
    this.gauge.reset();
    for (const pair of this.pool)
      for (const mesh of Object.values(pair)) mesh.visible = false;
    this.step = null;
    this.bendInstruction = "";
    this.releasedGuide = null;
    this.candidates.length = 0;
    this.events = [];
  }
  update(session, now, { active = true } = {}) {
    this.gauge.reset();
    this.sessionMode = session?.mode;
    this.now = now;
    for (const pair of this.pool)
      for (const mesh of Object.values(pair)) mesh.visible = false;
    this.bendInstruction = "";
    if (!session?.step || !active) return;
    const step = session.step;
    if (this.step !== step) {
      this.step = step;
      this.events = step.events || scoreForStep(step);
      this.releasedGuide = null;
    }
    this.adapter.r.getUserCamera().getWorldQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
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
      // Untimed notes wait at the white target; their hold clock starts on the
      // actual squeeze. A completed/withdrawn strike has no lingering ring.
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
    const beat = session.beatAt(now);
    const candidates = this.candidates;
    candidates.length = 0;
    for (const event of this.events) {
      if (!event.role) continue;
      const state = timingCueState(beat, event, {
        percussion,
        beatMs: session.beatMs,
      });
      if (!state) continue;
      const priority =
        state.phase === "prepare"
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
      const pair = this.pool[index++];
      this.show(pair, event.role, state, percussion);
      if (repeat) pair.reference.visible = false;
      for (const mesh of Object.values(pair))
        Object.assign(mesh.userData, {
          eventId: event.id,
          role: event.role,
          phase: state.phase,
        });
      this.drawnRoles.add(event.role);
    }
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
    pair.reference.scale.setScalar(radius * 1.12);
    pair.reference.visible = true;
    for (const [key, color] of [
      ["yellow", "yellow"],
      ["green", "green"],
    ]) {
      const mesh = pair[key],
        scale = state[color];
      if (!scale) continue;
      mesh.position.copy(point);
      mesh.quaternion.copy(this.quaternion);
      mesh.scale.setScalar(radius * 1.12 * scale);
      mesh.visible = true;
    }
    if (percussion) return;
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
    marker.visible = Boolean(state.bend);
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
      ...this.pool.flatMap((pair) => Object.values(pair)),
    ];
  }
  dispose() {
    this.gauge.dispose();
    for (const pair of this.pool)
      for (const mesh of Object.values(pair)) {
        mesh.removeFromParent();
        mesh.material.dispose();
      }
    this.geometry.dispose();
  }
}
