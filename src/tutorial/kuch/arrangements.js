import { kuchTiming } from "./timing.js";
import {
  MELODY,
  MELODY_PARTS,
  STEPS,
  SECTION_VERSION,
  PERFORMANCE_BEATS,
  noteName,
} from "./score.js";

export const KUCH_CONTENT_VERSION = 2;
export const DEFAULT_ARRANGEMENT = "easier-bends";
// Reviewed source IDs, pitches and ZERO-BASED shortened-performance onsets.
// Validate these at the content boundary; never infer additional merges.
export const BEND_PAIRS = [
  [3, 4, 64, 66, 2, 2.5],
  [14, 15, 64, 66, 10, 10.5],
  [41, 42, 64, 66, 26, 26.5],
  [52, 53, 64, 66, 34, 34.5],
  [61, 62, 64, 66, 48.5, 49.25],
  [64, 65, 64, 66, 50, 50.75],
  [72, 73, 64, 66, 56.5, 57.25],
  [75, 76, 64, 66, 58, 58.75],
  [83, 84, 67, 66, 64.5, 65.25],
  [102, 103, 64, 66, 74, 74.5],
  [113, 114, 64, 66, 82, 82.5],
  [126, 127, 69, 71, 98, 98.5],
  [128, 129, 71, 73, 100.75, 101.25],
  [138, 139, 69, 71, 106, 106.5],
  [140, 141, 71, 73, 108.75, 109.25],
  [146, 147, 67, 66, 112.5, 113.25],
  [165, 166, 64, 66, 122, 122.5],
  [176, 177, 64, 66, 130, 130.5],
];
export const MELODY_ASSESSMENT = {
  basePitchCents: 20,
  pitchCents: 35,
  onsetMs: 115,
  releaseMs: 115,
  startHoldMs: 80,
  settleMs: 110,
  landingEarlyMs: 65,
  landingLateMs: 180,
  maxSampleGapMs: 95,
  directionCents: 35,
  requirePitchSamples: true,
};
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
freeze(BEND_PAIRS);
freeze(MELODY_ASSESSMENT);

function gesture(first, last = first) {
  const sources = first === last ? [first] : [first, last];
  const endBeat = last.beat + last.beats,
    beats = first === last ? first.beats : endBeat - first.beat;
  const event = {
    ...first,
    id: sources.map((n) => n.id).join("+"),
    endBeat,
    beats,
    sourceEventIds: sources.map((n) => n.id),
    landmarks: sources.map((n) => ({
      sourceEventId: n.id,
      midi: n.midi,
      sourceBeat: n.beat,
      offsetBeats: n.beat - first.beat,
      releaseOffsetBeats: n.beat + n.beats - first.beat,
    })),
    assessment: MELODY_ASSESSMENT,
    articulation:
      first === last
        ? "original attack and release"
        : "one sustained slide replaces two attacks and bridges the one-tick gap",
  };
  if (first !== last) {
    const landmark = last.beat - first.beat,
      semitones = last.midi - first.midi;
    // Establish the base pitch first. Begin a short portamento 130 ms before
    // the source landmark; command its endpoint 26 ms after it. Assessment
    // permits processed/audio smoothing while requiring a destination hold.
    const start = landmark - 0.2,
      end = landmark + 0.04;
    event.transition = {
      startOffsetBeats: start,
      endOffsetBeats: end,
      landmarkOffsetBeats: landmark,
      destinationMidi: last.midi,
      semitones,
    };
    event.bend = [
      { fraction: 0, semitones: 0 },
      { fraction: start / beats, semitones: 0 },
      { fraction: end / beats, semitones },
      { fraction: 1, semitones },
    ];
  }
  return event;
}
function deriveEasier() {
  const pairs = new Map(),
    consumed = new Set();
  for (const [a, b, pitchA, pitchB, beatA, beatB] of BEND_PAIRS) {
    const first = MELODY[a],
      last = MELODY[b];
    const drill = MELODY_PARTS.find((p) =>
      p.events.some((e) => e.id === first?.id),
    );
    if (
      !first ||
      !last ||
      b !== a + 1 ||
      first.id !== `lead-${a}` ||
      last.id !== `lead-${b}` ||
      first.midi !== pitchA ||
      last.midi !== pitchB ||
      first.beat !== beatA ||
      last.beat !== beatB ||
      !drill?.events.some((e) => e.id === last.id) ||
      first.beats < 239 / 480 ||
      last.beats < 239 / 480 ||
      Math.abs(last.beat - first.beat - first.beats - 1 / 480) > 1e-9 ||
      ![2, -1].includes(last.midi - first.midi) ||
      consumed.has(a) ||
      consumed.has(b)
    )
      throw new Error(`Kuch bend source changed: lead-${a} + lead-${b}`);
    pairs.set(a, b);
    consumed.add(a);
    consumed.add(b);
  }
  const gestures = [];
  for (let i = 0; i < MELODY.length; i++) {
    if (pairs.has(i)) {
      gestures.push(gesture(MELODY[i], MELODY[pairs.get(i)]));
      i++;
    } else gestures.push(gesture(MELODY[i]));
  }
  return gestures;
}
function makeArrangement(id, title, events) {
  const parts = MELODY_PARTS.map((part) => ({
    ...part,
    events: events
      .filter(
        (e) =>
          e.beat >= part.sourceStart && e.beat < part.sourceStart + part.beats,
      )
      .map((e) => ({
        ...e,
        beat: e.beat - part.sourceStart,
        endBeat: e.endBeat - part.sourceStart,
      })),
    instruction:
      id === "original"
        ? part.instruction
        : `Learn part ${MELODY_PARTS.indexOf(part) + 1} of four. Green shrinks to the attack; squeeze as green closes, then release when yellow grows to the white circle. For a slide, preview the radial marker in green, then hold the same Trigger through the yellow ring and follow the bend after the initial hold. Other notes keep separate attacks.`,
  }));
  const sourceIds = parts.flatMap((p) =>
    p.events.flatMap((e) => e.sourceEventIds),
  );
  if (
    sourceIds.length !== MELODY.length ||
    new Set(sourceIds).size !== MELODY.length ||
    parts.some((p) => p.events.some((e) => e.beat < 0 || e.endBeat > p.beats))
  )
    throw new Error("Kuch sections split or duplicate the source score");
  const intro =
    id === "original"
      ? []
      : [
          {
            id: "bend-intro",
            title: "Held pitch bends",
            kind: "bend",
            beats: 6,
            events: [
              events.find((e) => e.id === "lead-3+lead-4"),
              events.find((e) => e.id === "lead-83+lead-84"),
            ].map((e, i) => ({
              ...e,
              id: `intro-${e.id}`,
              beat: 1 + i * 2,
              endBeat: 1 + i * 2 + e.beats,
            })),
            instruction:
              "Hold E4 on the same Trigger: establish E4, roll up two semitones to F♯4, settle, then release. Next hold G4 and roll down one semitone to F♯4. Follow the wrist marker; its screen direction follows your controller orientation. Demonstrate first, then Practice.",
          },
        ];
  const steps = [
    ...STEPS.slice(0, 4),
    ...intro,
    ...parts,
    {
      ...STEPS.at(-1),
      events,
      instruction:
        STEPS.at(-1).instruction +
        (id === "original"
          ? ""
          : " Keep holding the starting Honk through each authored slide; do not attack its destination Honk."),
    },
  ].map((s, i) => ({
    ...s,
    title: `${i + 1} · ${s.title.replace(/^\d+ · /, "")}`,
  }));
  return freeze(
    structuredClone({
      id,
      title,
      version: 1,
      sectionVersion: SECTION_VERSION,
      events,
      parts,
      steps,
      beats: PERFORMANCE_BEATS,
      sourceEventCount: MELODY.length,
      articulationChanges: events
        .filter((e) => e.bend)
        .map((e) => ({
          gestureId: e.id,
          sourceEventIds: e.sourceEventIds,
          description: e.articulation,
        })),
      description:
        id === "original"
          ? "185 separate melody attacks; original timing and articulation."
          : "167 squeeze gestures, 185 source pitch landmarks. Eighteen sustained slides replace adjacent attacks. Candidate arrangement; comfort and musical phrasing still need listening/headset review.",
    }),
  );
}
export const ARRANGEMENTS = freeze({
  original: makeArrangement(
    "original",
    "Original",
    MELODY.map((n) => gesture(n)),
  ),
  "easier-bends": makeArrangement(
    "easier-bends",
    "Easier bends",
    deriveEasier(),
  ),
});
export function kuchArrangement(id = DEFAULT_ARRANGEMENT) {
  const arrangement = ARRANGEMENTS[id];
  if (!arrangement) throw new Error(`Unknown Kuch arrangement: ${id}`);
  return arrangement;
}
export function createKuchGuidance(
  phase,
  anchorMs,
  mode = "practice",
  timing = kuchTiming(),
) {
  if (
    !phase ||
    !["melody", "performance", "bend", "chords", "drums"].includes(phase.kind)
  )
    return null;
  return {
    step: {
      id: phase.id,
      type:
        phase.kind === "drums"
          ? "drums"
          : phase.kind === "chords"
            ? "chords"
            : "melody",
      timed: true,
      beats: phase.beats,
      events: phase.events,
    },
    anchorMs,
    beatMs: timing.beatMs,
    bpm: timing.bpm,
    mode,
    beatAt: (now) => (now - anchorMs) / timing.beatMs,
    complete: (now) => (now - anchorMs) / timing.beatMs > phase.beats + 0.3,
  };
}
export function gestureInstruction(event) {
  if (!event) return "";
  if (!event.transition) return `${noteName(event.midi)} · hold, then release`;
  const { semitones, destinationMidi } = event.transition;
  return `Hold ${noteName(event.midi)} · roll ${semitones > 0 ? "up" : "down"} ${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? "" : "s"} to ${noteName(destinationMidi)} · settle · release`;
}
