import {
  BPM,
  MELODY,
  CHORDS,
  DRUMS,
  VOICINGS,
  PATTERN_CHANGES,
} from "../tutorial/kuch/score.js";
import {
  ARRANGEMENTS,
  DEFAULT_ARRANGEMENT,
  KUCH_CONTENT_VERSION,
  kuchArrangement,
  createKuchGuidance,
  gestureInstruction,
} from "../tutorial/kuch/arrangements.js";
import { KuchTutorial } from "../tutorial/kuch/KuchTutorial.js";
import { KuchEnsemble } from "../performance/KuchEnsemble.js";

export const defaultArrangement = DEFAULT_ARRANGEMENT;
export const arrangements = Object.values(ARRANGEMENTS).map(
  ({ id, title, version, description }) => ({
    id,
    title,
    version,
    description,
  }),
);
function definitionFor(arrangement) {
  return {
    schemaVersion: 1,
    id: "kuch-to-hua-hai",
    title: "Kuch To Hua Hai",
    contentVersion: KUCH_CONTENT_VERSION,
    bpm: BPM,
    liveRole: "melody",
    score: {
      melody: MELODY,
      gestures: arrangement.events,
      chords: CHORDS,
      drums: DRUMS,
    },
    arrangement: {
      id: arrangement.id,
      title: arrangement.title,
      version: arrangement.version,
      sectionVersion: arrangement.sectionVersion,
      sections: arrangement.parts.map((p) => ({
        id: p.id,
        start: p.sourceStart,
        beats: p.beats,
      })),
      voicings: VOICINGS,
      patternChanges: PATTERN_CHANGES,
      articulationChanges: arrangement.articulationChanges,
      provenance:
        "Existing MIDI-derived arrangement; introduction omitted and two interludes shortened to eight beats, as authored. " +
        arrangement.description,
    },
    lessons: arrangement.steps.map((s) => ({
      id: s.id,
      goal: s.instruction,
      practice: true,
      demonstration: true,
      assessment: s.events[0]?.assessment || {
        pitchCents: 35,
        onsetBeats: 0.4,
        durationBeats: 0.45,
        percussionWithdrawal: true,
        extrasPenalized: true,
      },
      skip: true,
      completePerformance: s.kind === "performance",
      sourceStep: s.id,
    })),
    recording: {
      countIn: 4,
      tailMs: 500,
      end: "manual",
      synchronization: "captured-noise-once",
    },
  };
}
function guidance(arrangement, anchor) {
  const guide = createKuchGuidance(
    arrangement.steps.at(-1),
    anchor,
    "performance",
  );
  guide.model = (now) => {
    const beat = guide.beatAt(now),
      event = arrangement.events.find((e) => e.beat + e.beats > beat);
    return {
      transport:
        beat < 0
          ? `Count in: ${Math.ceil(-beat)}`
          : `Beat ${Math.floor(beat) + 1} / 136`,
      instruction: `${arrangement.title}: play the melody live. ${gestureInstruction(event)}`,
      feedback: event
        ? "Green prepares; yellow marks the current hold. Follow each written attack, slide and release."
        : "Written melody complete. Stop Recording when ready.",
    };
  };
  return guide;
}
export const definition = definitionFor(kuchArrangement());
export const enterTutorial = (host, simulate = false) =>
  host.enterKuch(simulate, KuchTutorial, kuchArrangement());
export const createEnsemble = (host) =>
  new KuchEnsemble(host, kuchArrangement());
export const createGuidance = (anchor) => guidance(kuchArrangement(), anchor);

// Selection owns its definition and closures: an active attempt cannot change.
export async function selectArrangement(id = defaultArrangement) {
  const arrangement = kuchArrangement(id),
    selected = definitionFor(arrangement);
  const bytes = new TextEncoder().encode(JSON.stringify(selected));
  selected.contentHash = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    definition: selected,
    enterTutorial: (host, simulate = false) =>
      host.enterKuch(simulate, KuchTutorial, arrangement),
    createEnsemble: (host) => new KuchEnsemble(host, arrangement),
    createGuidance: (anchor) => guidance(arrangement, anchor),
  };
}
