import {
  COMPOSITION,
  performanceEvents,
  TOLERANCES,
  TUTORIAL_PRESETS,
} from "../tutorial/composition.js";
import { LESSON_STEPS } from "../tutorial/lessonSteps.js";
import { JogEnsemble } from "../performance/JogEnsemble.js";
import { JogMelodyGuidance } from "../performance/JogMelodyGuidance.js";
export const definition = {
  schemaVersion: 1,
  id: COMPOSITION.id,
  title: "Raag Jog",
  contentVersion: COMPOSITION.version,
  bpm: COMPOSITION.bpm,
  liveRole: "melody",
  score: structuredClone(COMPOSITION),
  arrangement: {
    recipes: structuredClone(TUTORIAL_PRESETS),
    liveEvents: performanceEvents(),
    provenance: "Existing authored VIRAG 2 Jog treatment, unchanged",
  },
  lessons: LESSON_STEPS.map((s) => ({
    id: s.id,
    goal: s.instruction,
    practice: true,
    demonstration: true,
    assessment: { ...TOLERANCES },
    skip: true,
    completePerformance: s.type === "performance",
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
  host.enter(simulate ? "simulation" : "practice");
export const createEnsemble = (host) => new JogEnsemble(host);
export const createGuidance = (anchor) => new JogMelodyGuidance(anchor);
