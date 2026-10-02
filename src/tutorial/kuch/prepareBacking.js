import { BEAT_MS, CHORDS, DRUMS } from "./score.js";
import { compilePattern } from "../../compositions/CompositionCompiler.js";
export const BACKING_ROLES = [
  "chordLooper",
  "alternativeLooper",
  "percussionLooper",
];
const roles = BACKING_ROLES;
export function compatibleBacking(h) {
  return (
    h.timeline.hasRecording() &&
    h.timeline.fixedWindowBeats === 16 &&
    h.timeline.tracks.size > 0 &&
    h.timeline.sourceBeatIntervalMs > 0 &&
    Math.abs(h.timeline.durationMs - 16 * h.timeline.sourceBeatIntervalMs) <
      0.01
  );
}
// Shared by quick practice and recording. Existing compatible learner takes stay intact.
export function prepareKuchBacking(
  adapter,
  { preserveExisting = false, snapshots } = {},
) {
  const expected = new Map();
  for (const [index, role] of roles.entries()) {
    const h = adapter.get(role),
      routes = {};
    if (!h) throw new Error(`Missing ${role}`);
    if (preserveExisting && compatibleBacking(h)) {
      expected.set(role, JSON.stringify(h.timeline.toJSON()));
      continue;
    }
    if (snapshots && !snapshots.has(role))
      snapshots.set(
        role,
        structuredClone(h.looperController.serializeState(h)),
      );
    for (const name of ["D", "C", "percussion"]) {
      const track = h.tracks.find((t) =>
        adapter.ids(name).includes(t.connectedHonkId),
      );
      if (track)
        routes[name] = { trackId: track.trackId, trackIndex: track.index };
    }
    routes.percussionLooper = { trackId: "looper-self-percussion" };
    const timeline = compilePattern({
      events: [CHORDS.D, CHORDS.change, DRUMS][index],
      beats: 16,
      beatMs: BEAT_MS,
      routes,
      defaults: { vowel: "O", nose: (1 - 80 / 127) / 0.78 },
    });
    h.looperController.restoreState(
      h,
      {
        timeline: timeline.toJSON(),
        controls: {
          recordBeats: 16,
          gap: -1,
          volume: index < 2 ? -0.62 : -0.66,
        },
      },
      { preserveConnections: true },
    );
    expected.set(role, JSON.stringify(h.timeline.toJSON()));
  }
  return expected;
}
export function restoreKuchBacking(adapter, snapshots) {
  for (const [role, take] of snapshots || []) {
    const h = adapter.get(role);
    if (h)
      h.looperController.restoreState(h, structuredClone(take), {
        preserveConnections: true,
      });
  }
  snapshots?.clear();
}
