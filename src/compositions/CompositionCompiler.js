import { LooperTimeline } from "../instruments/looper/timeline/LooperTimeline.js";
import { HONK_RELEASE_ORIGINS } from "../audio/honk/HonkReleaseProfile.js";
import { MAX_PITCH_BEND_SEMITONES } from "../config/honk.js";

// Pure score -> existing transport events. Routes bind logical roles only at
// preparation. No score data, scene objects or timers are mutated here.
export function compilePattern({
  events,
  beats,
  beatMs,
  routes,
  defaults = {},
}) {
  if (![2, 4, 8, 16].includes(beats))
    throw new Error("Split backing patterns at supported loop boundaries");
  const timeline = new LooperTimeline();
  timeline.startRecording(0, { beatIntervalMs: beatMs, beatOriginMs: 0 });
  timeline.lengthMode = "fixed-window";
  timeline.fixedWindowBeats = beats;
  for (const event of events) {
    const route = routes[event.role];
    if (!route) throw new Error(`Missing route for ${event.role}`);
    const start = event.beat * beatMs;
    if (!Number.isFinite(start) || start < 0 || start >= beats * beatMs)
      throw new Error("Event outside pattern");
    if (event.type || event.sound) {
      timeline.addDrumHitEvent(route.trackId, {
        trackIndex: route.trackIndex,
        timeMs: start,
        drumType: event.type || event.sound,
      });
      continue;
    }
    const end = (event.beat + event.beats) * beatMs;
    if (!(end > start) || end > beats * beatMs + 0.001)
      throw new Error("Note crosses pattern boundary without a tie");
    const track = timeline.ensureTrack(route.trackId, {
      trackIndex: route.trackIndex,
    });
    track.addEvent("gestureSnapshot", start, {
      values: { squeeze: 1, bend: 0, ...defaults },
    });
    track.addEvent("squeezeStart", start, { value: 1, gateOnly: true });
    for (const point of event.bend || [])
      track.addFieldEvent(
        "bend",
        start + point.fraction * (end - start),
        point.semitones / MAX_PITCH_BEND_SEMITONES,
        "linear",
      );
    track.addEvent("squeezeEnd", end, {
      value: 0,
      gateOnly: true,
      releaseOrigin: HONK_RELEASE_ORIGINS.controller,
    });
    track.addFieldEvent("squeeze", end, 0, "step");
    track.addFieldEvent("bend", end, 0, "step");
  }
  timeline.stopRecording(beats * beatMs);
  return timeline;
}
