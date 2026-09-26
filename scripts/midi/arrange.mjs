import { createHash } from "node:crypto";
import { validateComposition } from "../../src/compositions/CompositionRegistry.js";
import { validateDataArrangement } from "../../src/compositions/DataValidation.js";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const matches = (note, role) =>
  note.track === role.track &&
  note.channel === role.channel &&
  note.port === (role.port || 0);

// Conservative arrangement boundary: unsupported musical features remain in
// normalized source and require an authored decision, never a silent reduction.
export function arrangeMidi(normalized, options, previous = null) {
  const seq = normalized.sequences[options.sequence ?? 0];
  if (!seq || !options.live || !options.id || !options.title)
    throw new Error(
      "Provide sequence, stable id, title and explicit live track/channel/port mapping",
    );
  if (normalized.source.division.kind !== "ppq")
    throw new Error(
      "SMPTE retained faithfully; author a teaching beat map before arranging",
    );
  if (normalized.sequences.length > 1 && options.sequence === undefined)
    throw new Error("Format 2: choose one independent sequence explicitly");
  if (seq.tempo.length > 1)
    throw new Error(
      "Tempo changes retained; variable-tempo backing transport is not supported by this importer. Author a supported arrangement explicitly.",
    );
  const bpm = 60000000 / seq.tempo[0].us;
  const live = seq.notes.filter((n) => matches(n, options.live));
  if (!live.length) throw new Error("The chosen live role has no notes");
  const excluded = seq.notes.filter((n) => !matches(n, options.live));
  if (excluded.length && !options.exclusionsReason)
    throw new Error(
      "Other source roles require explicit accompaniment or exclusionsReason; review inventory before arranging",
    );
  const transpose = options.transpose || 0;
  const events = live.map((n) => ({
    id: n.id,
    role: `pitch-${n.midi + transpose}`,
    midi: n.midi + transpose,
    velocity: n.velocity,
    beat: n.beat,
    beats: n.beats,
    startSeconds: n.startSeconds,
    durationSeconds: n.durationSeconds,
    bend: n.bend.map((p) => ({
      seconds: p.seconds - n.startSeconds,
      semitones: p.semitones,
    })),
  }));
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (
      e.midi < 36 ||
      e.midi > 84 ||
      e.bend.some((p) => Math.abs(p.semitones) > 4)
    )
      throw new Error(
        `Unsupported pitch/bend range at ${e.id}; declare a transpose or reduction`,
      );
    if (
      i &&
      events[i - 1].startSeconds + events[i - 1].durationSeconds >
        e.startSeconds + 0.00001
    )
      throw new Error(
        "Overlapping live notes require an authored two-hand/chord arrangement; no reduction applied",
      );
  }
  if (live.some((n) => n.channel === 9 || n.expression.length))
    throw new Error(
      "Percussion/pressure requires an explicit supported mapping; source preserved",
    );
  const pitches = [...new Set(events.map((e) => e.midi))].sort((a, b) => a - b);
  if (pitches.length > 28)
    throw new Error("More than 28 live pitches: author phrase-specific banks");
  const duration = Math.max(
    seq.durationSeconds,
    ...events.map((e) => e.startSeconds + e.durationSeconds),
  );
  // Phrase boundaries advance to a release; never cut a sustain or bend.
  const ranges = [];
  let start = 0;
  while (start < duration) {
    let end = Math.min(duration, start + (16 * 60) / bpm);
    for (const e of events)
      if (e.startSeconds < end && e.startSeconds + e.durationSeconds > end)
        end = e.startSeconds + e.durationSeconds;
    ranges.push([start, end]);
    start = end;
  }
  const lesson = ([start, end], i, full = false) => ({
    id: full ? "performance" : `phrase-${i + 1}`,
    title: full ? "Complete guided performance" : `Phrase ${i + 1}`,
    goal: "Follow the numeric pitch targets, prepare at the onset cue, sustain, bend in the indicated direction, release and observe rests.",
    practice: true,
    demonstration: true,
    skip: true,
    completePerformance: full,
    startSeconds: start,
    endSeconds: end,
    eventIds: events
      .filter((e) => e.startSeconds >= start && e.startSeconds < end)
      .map((e) => e.id),
    setup:
      "Prepared stable pitch bank; melody is the live role. Review the conversion report for supporting-part exclusions.",
    assessment: {
      pitchCents: 25,
      onsetSeconds: 0.15,
      durationSeconds: 0.2,
      bendCents: 50,
      extraPenalty: true,
    },
    success: "Matching live pitches, onsets, holds, releases and bends.",
    retry: "Release all notes, then Practice for a fresh count-in.",
  });
  const definition = {
    schemaVersion: 1,
    id: options.id,
    title: options.title,
    contentVersion: options.version || 1,
    bpm,
    liveRole: "melody",
    source: normalized.source,
    importOptions: structuredClone(options),
    normalizedSource: {
      file: `${hash(normalized)}.normalized.json`,
      sha256: hash(normalized),
      sequence: options.sequence ?? 0,
    },
    score: {
      events,
      durationSeconds: duration,
      tempo: seq.tempo,
      meter: seq.meter,
    },
    arrangement: {
      recipes: [
        ...pitches.map((midi, i) => ({
          kind: "honk",
          role: `pitch-${midi}`,
          midi,
          position: [((i % 7) - 3) * 0.22, 0.6 - Math.floor(i / 7) * 0.32, 0],
          scale: 1.2,
        })),
        {
          kind: "metronome",
          role: "metronome",
          position: [-0.8, -0.5, 0],
          scale: 0.65,
        },
      ],
      provenance: `MIDI ${normalized.source.sha256}`,
      roleAssignments: [
        {
          role: "melody",
          sequence: options.sequence ?? 0,
          source: structuredClone(options.live),
        },
      ],
      transformations: [{ type: "transpose", semitones: transpose }],
      exclusions: excluded.map((n) => ({
        eventId: n.id,
        reason: options.exclusionsReason,
      })),
      backing: [],
      decisions: [
        "Numeric pitch identity retained",
        "Velocity is presented as a cue; fixed Honk timbre substitutes the source program",
        "One stable target per pitch; no quantization or trimming",
        "Sustain sounding ends become held Honk durations; physical key releases remain in normalized source",
      ],
    },
    lessons: [
      ...ranges.map((r, i) => lesson(r, i)),
      lesson([0, duration], ranges.length, true),
    ],
    recording: {
      countIn: 4,
      tailMs: 500,
      end: "manual",
      synchronization: "captured-noise-once",
    },
    requirements: { maxHonks: pitches.length, maxLoopers: 0, maxLiveVoices: 1 },
    warnings: normalized.warnings,
    authored: structuredClone(previous?.authored || {}),
  };
  if (previous?.id === definition.id) {
    if (
      previous.source.sha256 !== definition.source.sha256 &&
      options.version <= previous.contentVersion
    )
      throw new Error("Changed source needs a new content version");
    // Authored overrides are explicit and survive deterministic re-import.
    definition.authored = structuredClone(previous.authored || {});
    if (definition.authored.lessons)
      definition.lessons = definition.authored.lessons;
    if (definition.authored.recipes)
      definition.arrangement.recipes = definition.authored.recipes;
  }
  definition.contentHash = hash(definition);
  if (
    previous?.id === definition.id &&
    previous.contentHash !== definition.contentHash &&
    definition.contentVersion <= previous.contentVersion
  )
    throw new Error("Changed arrangement needs a new content version");
  return validateDataArrangement(validateComposition(definition));
}
