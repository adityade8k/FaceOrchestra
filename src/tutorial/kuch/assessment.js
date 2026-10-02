import { kuchTiming } from "./timing.js";

const fail = (reason) => ({ ok: false, reason });
const pass = { ok: true };
function stableSpan(samples, start, end, pitch, cents, maxGap) {
  let since = null,
    previous = null,
    best = 0,
    firstStart = null;
  for (const s of samples) {
    if (s.at < start || s.at > end) continue;
    if (Math.abs(s.pitch - pitch) * 100 > cents) {
      since = null;
      previous = null;
      continue;
    }
    if (previous === null || s.at - previous > maxGap) since = s.at;
    previous = s.at;
    if (s.at - since > best) {
      best = s.at - since;
      firstStart = since;
    }
  }
  return { duration: best, start: firstStart };
}
// Uses observed PROCESSED bend, never the commanded/demo curve as evidence.
export function assessKuchNote(
  expected,
  event,
  anchorMs,
  timing = kuchTiming(),
) {
  if (
    !event.released ||
    !event.voiced ||
    event.voiceInterrupted ||
    event.allReleased === false ||
    event.articulated === false ||
    event.invalidMembers
  )
    return fail("Keep one voiced hold, then release all voices.");
  const policy = expected.assessment;
  const pitches = expected.midis || [expected.midi];
  if (
    pitches.some((p) => p !== undefined) &&
    (event.midis?.length !== pitches.length ||
      pitches.some(
        (p) =>
          !event.midis.some(
            (m) => Math.abs(m - p) * 100 <= (policy?.basePitchCents ?? 20),
          ),
      ))
  )
    return fail("Use the starting instrument and its written base pitch.");
  const onset = event.startMs - anchorMs - expected.beat * timing.beatMs;
  const release =
    event.endMs - anchorMs - (expected.beat + expected.beats) * timing.beatMs;
  if (policy) {
    if (Math.abs(onset) > policy.onsetMs)
      return fail("Start at the first pitch landmark.");
    const releaseTolerance = expected.bend
      ? policy.releaseMs
      : Math.min(policy.releaseMs, expected.beats * timing.beatMs * 0.45);
    if (Math.abs(release) > releaseTolerance)
      return fail("Hold until the final written release.");
  } else if (
    Math.abs((event.endMs - event.startMs) / timing.beatMs - expected.beats) >=
    0.45
  )
    return fail("Match the written hold and release.");
  const raw = event.bendSamples || [];
  if (policy?.requirePitchSamples && !raw.length)
    return fail("No sounded-pitch observation.");
  if (
    raw.some(
      (s) => !Number.isFinite(s.offsetMs) || !Number.isFinite(s.semitones),
    )
  )
    return fail("Invalid pitch observation.");
  if (!expected.bend) {
    if (
      (event.maxAbsBend || 0) * 100 > (policy?.pitchCents ?? 35) ||
      raw.some((s) =>
        event.midis.some(
          (base) =>
            !pitches.some(
              (pitch) =>
                Math.abs(base + s.semitones - pitch) * 100 <=
                (policy?.pitchCents ?? 35),
            ),
        ),
      )
    )
      return fail("Keep the sounded pitch steady on this ordinary note.");
    return pass;
  }
  if (!policy || raw.length < 4)
    return fail("Observe the starting pitch, roll and destination hold.");
  const samples = raw.map((s) => ({
    at: onset + s.offsetMs,
    pitch: event.midis[0] + s.semitones,
  }));
  const transition = expected.transition,
    base = expected.midi,
    destination = transition.destinationMidi;
  const direction = Math.sign(destination - base),
    landmark = transition.landmarkOffsetBeats * timing.beatMs;
  if (
    samples.some(
      (s) => (s.pitch - base) * direction * 100 < -policy.directionCents,
    )
  )
    return fail("Roll in the written pitch direction.");
  if (
    samples.some(
      (s) => (s.pitch - destination) * direction * 100 > policy.pitchCents,
    )
  )
    return fail("Settle on the destination without overshooting.");
  let furthest = 0;
  for (const s of samples) {
    const progress = (s.pitch - base) * direction;
    if ((furthest - progress) * 100 > policy.directionCents)
      return fail("Continue the written slide without reversing pitch.");
    furthest = Math.max(furthest, progress);
  }
  const start = stableSpan(
    samples,
    -policy.onsetMs,
    transition.startOffsetBeats * timing.beatMs,
    base,
    policy.pitchCents,
    policy.maxSampleGapMs,
  );
  if (start.duration < policy.startHoldMs)
    return fail("Establish the starting pitch before rolling.");
  const intermediate = samples.filter((s) => {
    const fraction = (s.pitch - base) / (destination - base);
    return (
      fraction > 0.2 &&
      fraction < 0.8 &&
      s.at >= transition.startOffsetBeats * timing.beatMs - 65 &&
      s.at <= landmark + policy.landingLateMs
    );
  });
  if (
    intermediate.length < 2 ||
    !intermediate.some(
      (s, i) => i && (s.pitch - intermediate[i - 1].pitch) * direction > 0.02,
    )
  )
    return fail(
      "Roll through the slide; do not jump directly to its endpoint.",
    );
  const settled = stableSpan(
    samples,
    landmark - policy.landingEarlyMs,
    expected.beats * timing.beatMs + policy.releaseMs,
    destination,
    policy.pitchCents,
    policy.maxSampleGapMs,
  );
  if (
    settled.duration < policy.settleMs ||
    settled.start > landmark + policy.landingLateMs ||
    Math.abs(samples.at(-1).pitch - destination) * 100 > policy.pitchCents
  )
    return fail(
      "Reach the destination near its landmark and hold it before releasing.",
    );
  // Reject arriving substantially early, even if a long destination hold follows.
  if (
    samples.some(
      (s) =>
        s.at > transition.startOffsetBeats * timing.beatMs &&
        s.at < landmark - policy.landingEarlyMs &&
        Math.abs(s.pitch - destination) * 100 <= policy.pitchCents,
    )
  )
    return fail("Save the destination for its timing landmark.");
  return pass;
}
export function assess(events, heard, anchorMs, timing = kuchTiming()) {
  const remaining = heard.filter(
    (e) => e.origin === "learner" && (e.kind === "note" || e.kind === "strike"),
  );
  const failures = [];
  let correct = 0,
    landmarks = 0;
  for (const expected of events) {
    // Consume at most one observation per gesture, even if it has two landmarks.
    let nearest = -1,
      distance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i],
        offset = Math.abs(
          (e.startMs - anchorMs) / timing.beatMs - expected.beat,
        );
      if (e.role === expected.role && offset < 0.4 && offset < distance) {
        nearest = i;
        distance = offset;
      }
    }
    if (nearest < 0) {
      failures.push({
        id: expected.id,
        reason: "Missing attack at the written target.",
      });
      continue;
    }
    const [event] = remaining.splice(nearest, 1);
    const result =
      event.kind === "strike"
        ? expected.midi === undefined && !expected.midis && event.withdrawn
          ? pass
          : fail(
              "Use the written action and pull the stick clear after a strike.",
            )
        : expected.midi !== undefined || expected.midis
          ? assessKuchNote(expected, event, anchorMs, timing)
          : fail("Strike this percussion target.");
    if (result.ok) {
      correct++;
      landmarks += expected.sourceEventIds?.length || 1;
    } else failures.push({ id: expected.id, reason: result.reason });
  }
  const extra = remaining.length;
  const requiredCriteriaMet = !failures.some(
    (f) =>
      events.find((e) => e.id === f.id)?.bend ||
      /hold|release|voiced|pitch observation/i.test(f.reason),
  );
  return {
    ok: correct === events.length && !extra,
    requiredCriteriaMet,
    bpm: timing.bpm,
    correct,
    total: events.length,
    landmarks,
    extra,
    failures,
    score: Math.round((100 * correct) / Math.max(events.length + extra, 1)),
  };
}
