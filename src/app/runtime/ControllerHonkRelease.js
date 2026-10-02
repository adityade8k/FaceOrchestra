import { HONK_RELEASE_ORIGINS } from "../../audio/honk/HonkReleaseProfile.js";

export const CONTROLLER_HONK_RELEASE_OPTIONS = Object.freeze({
  origin: HONK_RELEASE_ORIGINS.controller,
});

const liveOwners = new WeakMap();
// A fresh Trigger attack establishes a new relative-roll zero. Smoothing from
// a released gesture must not retune that new attack. Ongoing holds from the
// other hand keep their processed bend; released audio tails own their params.
export function prepareControllerHonkAttack(owner, voiceId) {
  let voices = liveOwners.get(owner);
  if (!voices) {
    voices = new Set();
    liveOwners.set(owner, voices);
  }
  for (const id of voices) if (!owner.hasAudioVoice(id)) voices.delete(id);
  if (!voices.size && owner.processedLivePerformance)
    owner.processedLivePerformance.bend = 0;
  voices.add(voiceId);
}

export function releaseControllerHonkVoice(runtime, voiceId, owner = null) {
  owner ||= runtime.instrumentRegistry
    ?.getByKind?.("honk")
    ?.find((h) => h.activeVoiceIds?.has(voiceId));
  if (owner) liveOwners.get(owner)?.delete(voiceId);
  if (owner?.activeVoiceIds?.has(voiceId)) {
    return owner.releaseAudioVoice(voiceId, CONTROLLER_HONK_RELEASE_OPTIONS);
  }
  return runtime.releaseHonkVoice(voiceId, CONTROLLER_HONK_RELEASE_OPTIONS);
}
