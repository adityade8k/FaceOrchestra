import {
  STICK_PERCUSSION_SETTINGS,
  STICK_PERCUSSION_TYPES,
} from "../../config/audio.js";

export const PERCUSSION_TYPES = STICK_PERCUSSION_TYPES;
export const PERCUSSION_PROFILES = STICK_PERCUSSION_SETTINGS;

// The finite lifetime used by the voice's envelopes, resonators and cleanup.
// Recording a strike uses the same endpoint; waiting to press Stop adds nothing.
export function getPercussionDurationMs(type) {
  if (type === PERCUSSION_TYPES.hihat) {
    const s = PERCUSSION_PROFILES.hihat, noise = Math.max(s.noiseSeconds, 0.01);
    return (Math.max(noise, s.metallicDecaySeconds ?? noise) + Math.max(s.metallicEchoTailSeconds ?? 0.2, 0) + 0.06) * 1000;
  }
  if (type === PERCUSSION_TYPES.metronomeWood) {
    const s = PERCUSSION_PROFILES.metronomeWood;
    return (Math.max(s.bodyDecaySeconds, 0.03, s.noiseSeconds, 0.005) + 0.03) * 1000;
  }
  const s = PERCUSSION_PROFILES.boink, body = Math.max(s.bodySeconds, 0.04);
  return (Math.max(body, s.subSeconds ?? body, Math.max(s.shellSeconds ?? body * 0.72, 0.03),
    Math.max(s.malletSeconds ?? 0.04, 0.005)) + Math.max(s.roomTailSeconds ?? 0.16, 0) + 0.05) * 1000;
}
