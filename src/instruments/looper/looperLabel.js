// Fixed lengths show their selected limit. Open recordings count completed
// beats while recording; saved takes show their actual length, excluding the gap.
export function getLooperLabelBeats(looper, now = performance.now()) {
  const data = looper.looperData;
  if (data.recordBeats > 0) return data.recordBeats;
  if (data.transport.recordArmed) return 0;
  if (data.transport.recording) {
    const progress = looper.looperController.recording.getRecordingProgress(looper, now);
    return Math.max(0, Math.floor((progress?.elapsedBeats || 0) + 1e-7));
  }
  const timeline = data.timeline;
  const interval = timeline?.sourceBeatIntervalMs || timeline?.beatIntervalMs;
  if (!timeline?.hasRecording() || !(interval > 0)) return 0;
  return Math.round((timeline.recordedDurationMs / interval) * 10) / 10;
}

export function getLooperLabelText(looper, now) {
  const beats = getLooperLabelBeats(looper, now);
  return `${looper.looperData.gapBeats} gap\n${beats} ${beats === 1 ? "beat" : "beats"}`;
}
