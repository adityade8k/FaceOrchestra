import { MAX_PITCH_BEND_SEMITONES } from "../config/honk.js";

// Resolve the actual held target and voice owner. Looper automation is deliberately
// absent: this is the same processed-live field consumed by HonkPerformanceRuntime.
export function observeBendGesture(adapter, role, mode) {
  let observed = null;
  for (const [controller, gesture] of adapter.gestures) {
    if (
      gesture.role !== role ||
      gesture.invalidMembers ||
      gesture.voiceInterrupted
    )
      continue;
    if (mode !== "demonstration" && gesture.origin !== "learner") continue;
    const input = adapter.r.controllerStates.get(controller);
    const target =
      input?.raySqueezeInstrumentState ||
      (input?.activeTriggerInteraction?.type === "holdSqueeze" &&
        input.activeTriggerInteraction.instrumentState);
    if (
      !input?.trigger ||
      input.stickActive ||
      !target ||
      target.id !== gesture.targetId ||
      !adapter.ids(role).includes(target.id) ||
      target.disposed ||
      !target.root?.visible
    )
      continue;
    const voice = adapter.r.getInstrumentVoiceId(
      adapter.r.getControllerVoiceId(controller),
      target,
    );
    if (!target.hasAudioVoice(voice)) continue;
    // Two owners sharing a live bend field cannot be attributed to one wrist.
    if (observed || target.hornHolders?.size > 1) return null;
    for (const [otherController, other] of adapter.gestures)
      if (
        otherController !== controller &&
        (other.targetId === target.id || other.memberIds?.includes(target.id))
      )
        return null;
    const bend = target.getProcessedLivePerformanceState().bend;
    if (Number.isFinite(bend))
      observed = {
        controller,
        target,
        targetId: target.id,
        role,
        gestureId: gesture.id,
        origin: gesture.origin,
        semitones: bend * MAX_PITCH_BEND_SEMITONES,
      };
  }
  return observed;
}
