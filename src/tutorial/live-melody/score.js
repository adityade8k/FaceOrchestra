import { getHonkPitchBendRange } from "../../config/honk.js";
import { validateComposition } from "../../compositions/CompositionDefinition.js";

// All source notes belong to the learner. Two independent controller holds
// preserve overlapping notes without a Looper or an automatic melody voice.
// Events assign demonstration hands; a recipe without a hand is shared.
export function validateLiveMelody(d) {
  validateComposition(d);
  const fail = message => { throw new Error(`Invalid live melody: ${message}`); };
  if (d.playback !== "honk-live-two-hand-v1" || d.arrangement.backing.length ||
      d.requirements.maxLoopers !== 0 || ![1, 2].includes(d.requirements.maxLiveVoices) ||
      !Number.isFinite(d.score.durationBeats) || d.score.durationBeats <= 0) fail("playback contract");
  const validRange = item => item.pitchBendRange === undefined || [4, 5].includes(item.pitchBendRange);
  if (!validRange(d)) fail("bend range");
  const roles = new Map();
  for (const r of d.arrangement.recipes) {
    if (["vowel", "nose", "gain", "envelope", "waveform", "voice", "sample", "audioUrl"].some(k => k in r))
      fail("sound override");
    if (!r.role || roles.has(r.role) || !["honk", "metronome"].includes(r.kind) ||
        r.position?.length !== 3 || !r.position.every(Number.isFinite) || !(r.scale > 0) ||
        (r.kind === "honk" && (!Number.isInteger(r.midi) || r.midi < 36 || r.midi > 84 ||
          (r.hand !== undefined && !["L", "R"].includes(r.hand))))) fail("recipe");
    if (!validRange(r) || getHonkPitchBendRange(r) > getHonkPitchBendRange(d)) fail("recipe bend range");
    roles.set(r.role, r);
  }
  if (roles.get("metronome")?.kind !== "metronome" ||
      [...roles.values()].filter(r => r.kind === "metronome").length !== 1) fail("clock");
  const ids = new Set(), sourceIds = new Set(), ends = { L: 0, R: 0 };
  let previous = 0, previousEnd = 0;
  for (const e of d.score.events) {
    if (!e.id || ids.has(e.id) || !Array.isArray(e.sourceIds) || !e.sourceIds.length || e.sourceIds[0] !== e.id ||
        new Set(e.sourceIds).size !== e.sourceIds.length ||
        e.sourceIds.some(id => typeof id !== "string" || !id || sourceIds.has(id)) ||
        (e.sourceIds.length > 1 && (e.articulation !== "continuous-bend" || !e.bend)) ||
        roles.get(e.role)?.kind !== "honk" || roles.get(e.role)?.midi !== e.midi ||
        (roles.get(e.role)?.hand !== undefined && roles.get(e.role).hand !== e.hand) ||
        !["L", "R"].includes(e.hand) ||
        !Number.isFinite(e.beat) || !Number.isFinite(e.beats) || e.beats <= 0 ||
        e.beat < previous || e.beat < ends[e.hand] - 1e-9 ||
        e.beat + e.beats > d.score.durationBeats + 1e-9) fail("live gate");
    if (d.requirements.maxLiveVoices === 1 && e.beat < previousEnd - 1e-9) fail("overlapping single-voice hold");
    if (!validRange(e) || getHonkPitchBendRange(e) !== getHonkPitchBendRange(roles.get(e.role)))
      fail("event bend range");
    if (e.bend !== undefined) {
      if (!Array.isArray(e.bend) || e.bend.length < 2 || e.bend[0].fraction !== 0 ||
          e.bend[0].semitones !== 0 || e.bend.at(-1).fraction !== 1 ||
          e.bend.some((p,i) => !Number.isFinite(p.fraction) || p.fraction < 0 || p.fraction > 1 ||
            !Number.isFinite(p.semitones) || Math.abs(p.semitones) > getHonkPitchBendRange(e) ||
            (i > 0 && p.fraction <= e.bend[i-1].fraction))) fail("bend curve");
    }
    ids.add(e.id); e.sourceIds.forEach(id => sourceIds.add(id));
    previous = e.beat; ends[e.hand] = e.beat + e.beats;
    previousEnd = Math.max(previousEnd, e.beat + e.beats);
  }
  if (!ids.size) fail("empty score");
  for (const l of d.lessons) {
    if (!l.eventIds?.length || new Set(l.eventIds).size !== l.eventIds.length ||
        l.eventIds.some(id => !ids.has(id)) || !Number.isFinite(l.startBeat) ||
        !Number.isFinite(l.endBeat) || l.startBeat < 0 || l.endBeat > d.score.durationBeats ||
        l.endBeat <= l.startBeat || !Number.isFinite(l.recommendedBpm) ||
        l.recommendedBpm < 30 || l.recommendedBpm > d.bpm ||
        ["pitchCents", "onsetBeats", "durationBeats"].some(k => !Number.isFinite(l.assessment[k]) || l.assessment[k] < 0)) fail("lesson");
    if (d.score.events.some(e => l.eventIds.includes(e.id) && e.bend) &&
        ["bendCents", "bendTimingBeats"].some(k => !Number.isFinite(l.assessment[k]) || l.assessment[k] < 0)) fail("bend assessment");
    const expected = d.score.events.filter(e => e.beat >= l.startBeat && e.beat < l.endBeat);
    if (expected.length !== l.eventIds.length || expected.some(e => !l.eventIds.includes(e.id)) ||
        d.score.events.some(e => (e.beat < l.startBeat && e.beat + e.beats > l.startBeat + 1e-9) ||
          (e.beat < l.endBeat && e.beat + e.beats > l.endBeat + 1e-9))) fail("phrase cuts a hold");
    if (l.completePerformance && (l.startBeat !== 0 || l.endBeat !== d.score.durationBeats ||
        l.eventIds.length !== ids.size)) fail("incomplete performance");
  }
  return d;
}
