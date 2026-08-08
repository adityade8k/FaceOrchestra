import { LooperActionEventType, isDrumHitEvent } from "./timeline/LooperActionEvent.js";

const SQUEEZE_THRESHOLD = 0.025;

export const DEFAULT_BEAT_DETECTION_SETTINGS = Object.freeze({
  minBpm: 60,
  maxBpm: 200,
  chordClusterMs: 90,
  subdivisionsPerBeat: 4,
  maxSnapMs: 85,
});

export class LooperBeatDetector {
  constructor(settings = {}) {
    this.settings = { ...DEFAULT_BEAT_DETECTION_SETTINGS, ...settings };
  }

  analyze(timeline, { fallbackBeatIntervalMs = 0 } = {}) {
    const onsets = this.collectOnsets(timeline);
    const clusters = clusterTimes(onsets, this.settings.chordClusterMs);
    let beatIntervalMs = this.estimateBeatInterval(clusters);
    let inferred = true;
    if (!(beatIntervalMs > 0) && fallbackBeatIntervalMs > 0) {
      beatIntervalMs = fallbackBeatIntervalMs;
      inferred = false;
    }
    if (!(beatIntervalMs > 0) || clusters.length === 0) return null;

    const originMs = clusters[0];
    const subdivisionMs = beatIntervalMs / this.settings.subdivisionsPerBeat;
    const errors = clusters.map((timeMs) => {
      const relative = timeMs - originMs;
      return Math.abs(relative - Math.round(relative / subdivisionMs) * subdivisionMs);
    });
    const meanErrorMs = errors.reduce((sum, error) => sum + error, 0) / errors.length;
    return Object.freeze({
      bpm: 60000 / beatIntervalMs,
      beatIntervalMs,
      subdivisionMs,
      originMs,
      onsetCount: onsets.length,
      clusterCount: clusters.length,
      meanErrorMs,
      confidence: Math.max(0, 1 - meanErrorMs / Math.max(subdivisionMs * 0.5, 1)),
      inferred,
    });
  }

  apply(timeline, analysis) {
    if (!timeline || !analysis) return false;
    const { originMs, subdivisionMs, beatIntervalMs } = analysis;
    for (const track of timeline.tracks.values()) {
      for (const event of track.events) {
        const relativeMs = event.timeMs - originMs;
        event.timeMs = isRhythmicGate(event)
          ? Math.max(originMs + snapWithLimit(relativeMs, subdivisionMs, this.settings.maxSnapMs), 0)
          : event.timeMs;
      }
      track.sorted = false;
      track.sortEvents();
    }

    timeline.beatIntervalMs = beatIntervalMs;
    timeline.beatAnalysis = { ...analysis };
    // Snapped gates can move the final sound. Rebuild the loop boundary from the
    // corrected content and align it to the next inferred beat; Stop time does
    // not add an implicit trailing gap.
    timeline.finalizeDuration(1);
    return true;
  }

  collectOnsets(timeline) {
    const onsets = [];
    for (const track of timeline?.tracks?.values?.() || []) {
      let squeezeActive = false;
      track.sortEvents();
      for (const event of track.events) {
        if (isDrumHitEvent(event)) {
          onsets.push(event.timeMs);
          continue;
        }
        if (!isSqueezeEvent(event)) continue;
        const active = (event.value || 0) > SQUEEZE_THRESHOLD;
        if (active && !squeezeActive) onsets.push(event.timeMs);
        squeezeActive = active;
      }
    }
    return onsets.sort((first, second) => first - second);
  }

  estimateBeatInterval(clusters) {
    if (clusters.length < 2) return 0;
    const minInterval = 60000 / this.settings.maxBpm;
    const maxInterval = 60000 / this.settings.minBpm;
    const folded = [];
    for (let index = 1; index < clusters.length; index += 1) {
      let interval = clusters[index] - clusters[index - 1];
      if (!(interval > 0)) continue;
      while (interval < minInterval) interval *= 2;
      while (interval > maxInterval) interval *= 0.5;
      folded.push(interval);
    }
    if (!folded.length) return 0;
    folded.sort((first, second) => first - second);
    const middle = Math.floor(folded.length / 2);
    return folded.length % 2
      ? folded[middle]
      : (folded[middle - 1] + folded[middle]) * 0.5;
  }
}

function isSqueezeEvent(event) {
  return event?.type === LooperActionEventType.Squeeze ||
    event?.type === LooperActionEventType.SqueezeStart ||
    event?.type === LooperActionEventType.SqueezeEnd;
}

function isRhythmicGate(event) {
  return isDrumHitEvent(event) ||
    event?.type === LooperActionEventType.SqueezeStart ||
    event?.type === LooperActionEventType.SqueezeEnd;
}

function clusterTimes(times, toleranceMs) {
  const clusters = [];
  for (const timeMs of times) {
    const last = clusters.at(-1);
    if (!last || timeMs - last.lastMs > toleranceMs) {
      clusters.push({ sum: timeMs, count: 1, lastMs: timeMs });
    } else {
      last.sum += timeMs;
      last.count += 1;
      last.lastMs = timeMs;
    }
  }
  return clusters.map(({ sum, count }) => sum / count);
}

function snapWithLimit(timeMs, gridMs, maxSnapMs) {
  if (!(gridMs > 0)) return timeMs;
  const snapped = Math.round(timeMs / gridMs) * gridMs;
  return Math.abs(snapped - timeMs) <= maxSnapMs ? snapped : timeMs;
}
