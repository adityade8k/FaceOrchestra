export function recordingGuidance(progress, assessmentBeat = null) {
  if (!progress) return '';
  if (progress.state === 'armed') {
    return 'Ready — begin on the cue.' + (assessmentBeat < 0
      ? `\nCount-in: ${Math.ceil(-assessmentBeat)} · capture waits for sound`
      : assessmentBeat > 0.35 ? '\nThe cue has passed. Begin now or retry; assessment stays on the original cue.' : '');
  }
  if (progress.state === 'recording') {
    const remaining = progress.remainingBeats;
    return `Beat ${progress.beat}/${progress.beats} · ${remaining.toFixed(1)} beats left` +
      (remaining <= 2 ? '\nEnding soon · settle and release' : '\nFit the full pattern into the recording window.');
  }
  return progress.automatic ? `Recording complete — ${progress.beats} beats`
    : `Recording stopped early — ${Number(progress.beats.toFixed(2))} beats saved`;
}
