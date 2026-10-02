import {
  PRACTICE_TEMPOS,
  PRACTICE_DEFAULT_BPM,
  practiceBpm,
} from "./timing.js";

export const PROGRESSION_POLICY = Object.freeze({
  minimumScore: 85,
  requireCriteria: true,
});
// Stored within the composition/arrangement/section-version namespace.
export class PracticeProgress {
  constructor(saved = {}, policy = PROGRESSION_POLICY) {
    this.sections = structuredClone(saved.sections || {});
    this.enabled = saved.enabled !== false;
    this.policy = policy;
  }
  section(id) {
    return (this.sections[id] ||= {
      bpm: PRACTICE_DEFAULT_BPM,
      completed: {},
      attempts: {},
    });
  }
  select(id, bpm) {
    this.section(id).bpm = practiceBpm(bpm);
    return this.section(id).bpm;
  }
  record(id, bpm, result) {
    const section = this.section(id);
    const passed =
      result.score >= this.policy.minimumScore &&
      (!this.policy.requireCriteria || result.requiredCriteriaMet === true);
    section.attempts[bpm] = { ...result, passed, bpm };
    if (passed) section.completed[bpm] = true;
    const stage = PRACTICE_TEMPOS.indexOf(bpm);
    const next =
      passed && this.enabled && stage >= 0
        ? PRACTICE_TEMPOS[Math.min(stage + 1, PRACTICE_TEMPOS.length - 1)]
        : bpm;
    section.bpm = next;
    return { passed, next, bpm };
  }
  describe(id, bpm = this.section(id).bpm) {
    const s = this.section(id),
      stage = PRACTICE_TEMPOS.indexOf(bpm);
    const completed = PRACTICE_TEMPOS.filter((b) => s.completed[b]);
    return `Practice ${bpm} BPM · Song tempo: 92 BPM · ${stage < 0 ? "Manual tempo" : `Stage ${stage + 1}/${PRACTICE_TEMPOS.length}`}\nCompleted: ${completed.length ? `${completed.join(", ")} BPM` : "none"}`;
  }
  export() {
    return { enabled: this.enabled, sections: this.sections };
  }
}
