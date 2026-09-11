import { HONK_RELEASE_ORIGINS } from "../../audio/honk/HonkReleaseProfile.js";

export const CONTROLLER_HONK_RELEASE_OPTIONS = Object.freeze({
  origin: HONK_RELEASE_ORIGINS.controller,
});

export function releaseControllerHonkVoice(runtime, voiceId, owner = null) {
  if (owner?.activeVoiceIds?.has(voiceId)) {
    return owner.releaseAudioVoice(voiceId, CONTROLLER_HONK_RELEASE_OPTIONS);
  }
  return runtime.releaseHonkVoice(voiceId, CONTROLLER_HONK_RELEASE_OPTIONS);
}
