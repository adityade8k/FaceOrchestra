import {
  BPM,
  STEPS,
  MELODY,
  CHORDS,
  DRUMS,
  VOICINGS,
  PATTERN_CHANGES,
} from "../tutorial/kuch/score.js";
import { KuchTutorial } from "../tutorial/kuch/KuchTutorial.js";
import { KuchEnsemble } from "../performance/KuchEnsemble.js";
export const definition = {
  schemaVersion: 1,
  id: "kuch-to-hua-hai",
  title: "Kuch To Hua Hai",
  contentVersion: 1,
  bpm: BPM,
  liveRole: "melody",
  score: { melody: MELODY, chords: CHORDS, drums: DRUMS },
  arrangement: {
    voicings: VOICINGS,
    patternChanges: PATTERN_CHANGES,
    provenance:
      "Existing MIDI-derived arrangement; introduction omitted and two interludes shortened to eight beats, as authored",
  },
  lessons: STEPS.map((s) => ({
    id: s.id,
    goal: s.instruction,
    practice: true,
    demonstration: true,
    assessment: {
      pitchCents: 20,
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
export const enterTutorial = (host, simulate = false) =>
  host.enterKuch(simulate, KuchTutorial);
export const createEnsemble = (host) => new KuchEnsemble(host);
export const createGuidance = (anchor) => ({
  anchorMs: anchor,
  beatMs: 60000 / BPM,
  step: { type: "data", timed: true, beats: 136, events: MELODY },
  beatAt: (now) => (now - anchor) / (60000 / BPM),
  complete: (now) => (now - anchor) / (60000 / BPM) >= 136,
  model(now) {
    const beat = (now - anchor) / (60000 / BPM),
      event = MELODY.find((e) => e.beat + e.beats > beat);
    return {
      transport:
        beat < 0
          ? `Count in: ${Math.ceil(-beat)}`
          : `Beat ${Math.floor(beat) + 1} / 136`,
      instruction:
        "Play the melody live. Squeeze the highlighted bottom sphere, hold, then release. Keep your wrist neutral.",
      feedback: event
        ? `Next pitch: MIDI ${event.midi} · hold ${event.beats.toFixed(2)} beats`
        : "Written melody complete. Stop Recording when ready.",
    };
  },
});
