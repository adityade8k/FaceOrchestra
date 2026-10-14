import { Quaternion, Vector3 } from 'three';
import { BendGauge } from './BendGauge.js';
import { BendHaptics } from './BendHaptics.js';
import { getHonkPitchBendRange } from '../config/honk.js';
import { bendCueDisplacement } from './bendCueState.js';

// Read-only feedback. This class has no score, snapper or pitch-writing API.
export class LiveBendFeedback {
  constructor(runtime, { createCanvas } = {}) {
    this.r = runtime; this.createCanvas = createCanvas;
    this.gauges = new Map(); this.bindings = new Map(); this.sequence = 0; this.haptics = new BendHaptics({ r: runtime });
    this.quaternion = new Quaternion(); this.start = new Quaternion();
    this.right = new Vector3(); this.localRight = new Vector3(); this.localUp = new Vector3();
  }
  update(now, enabled) {
    if (!enabled) { this.reset(); return; }
    const observations = [], seen = new Set(), targets = new Set();
    this.r.getUserCamera().getWorldQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    for (const controller of this.r.controllers) {
      const input = this.r.controllerStates.get(controller);
      const target = input?.raySqueezeInstrumentState ||
        (input?.activeTriggerInteraction?.type === 'holdSqueeze' && input.activeTriggerInteraction.instrumentState);
      if (!input?.trigger || input.stickActive || controller.userData?.virtualTutorial ||
          controller.visible === false || controller.userData?.inputConnected === false ||
          target?.kind !== 'honk' || target.disposed || !target.root?.visible ||
          target.hornHolders?.size > 1 || targets.has(target)) continue;
      const voice = this.r.getInstrumentVoiceId(this.r.getControllerVoiceId(controller), target);
      if (!target.hasAudioVoice(voice)) continue;
      const range = getHonkPitchBendRange(target), actual = target.getProcessedLivePerformanceState().bend * range;
      if (!Number.isFinite(actual)) continue;
      const reference = input.raySqueezeStartInverseQuaternion || input.activeTriggerInteraction?.bendStartInverseQuaternion;
      let binding = this.bindings.get(controller);
      if (!binding || binding.reference !== reference || binding.target !== target) {
        binding = { reference, target, id: `live-bend-${++this.sequence}` }; this.bindings.set(controller, binding);
      }
      const observation = { controller, target, targetId: target.id, gestureId: binding.id, semitones: actual };
      observations.push(observation); seen.add(controller); targets.add(target);
      if (!this.gauges.has(controller)) this.gauges.set(controller, new BendGauge(this.r.scene, this.createCanvas));
      if (reference) this.start.copy(reference).invert(); else controller.getWorldQuaternion(this.start);
      this.localRight.set(1, 0, 0).applyQuaternion(this.start);
      this.localUp.set(0, 1, 0).applyQuaternion(this.start);
      const orientation = bendCueDisplacement(.1, this.localRight.dot(this.right), this.localUp.dot(this.right)) >= 0 ? 1 : -1;
      const sphere = target.getSqueezeColliderSphere();
      this.gauges.get(controller).update({ normalPlay: true, actual, range }, sphere.center, sphere.radius,
        this.quaternion, orientation, observation, now);
    }
    for (const [controller, gauge] of this.gauges) if (!seen.has(controller)) { gauge.reset(); this.bindings.delete(controller); }
    this.haptics.updateObservations(observations);
  }
  reset() { for (const gauge of this.gauges.values()) gauge.reset(); this.haptics.reset(); this.bindings.clear(); }
  captureRoots() { return [...this.gauges.values()].map(gauge => gauge.root); }
  dispose() { this.reset(); for (const gauge of this.gauges.values()) gauge.dispose(); this.gauges.clear(); }
}
