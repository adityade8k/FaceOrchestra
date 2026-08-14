import { HONK_RELEASE_ORIGINS } from "../../audio/honk/HonkReleaseProfile.js";

export const CONTROLLER_HONK_RELEASE_OPTIONS = Object.freeze({
  origin: HONK_RELEASE_ORIGINS.controller,
});

export function releaseControllerHonkVoice(runtime, voiceId) {
  return runtime.releaseHonkVoice(voiceId, CONTROLLER_HONK_RELEASE_OPTIONS);
}
