import { validateComposition } from "./CompositionDefinition.js";
import { bendCueState } from "../tutorial/bendCueState.js";

export function validateRishte(d) {
  validateComposition(d);
  const fail = message => { throw new Error(`Invalid Rishte arrangement: ${message}`); };
  if (d.playback !== "honk-looper-two-hand-v1") fail("playback contract");
  const roles = new Map(d.arrangement.recipes.map(r => [r.role, r]));
  if (roles.size !== d.arrangement.recipes.length) fail("duplicate role");
  for (const r of roles.values()) {
    if (!["honk", "looper", "metronome"].includes(r.kind) || r.position.length !== 3 ||
        !r.position.every(Number.isFinite) || !(r.scale > 0) ||
        (r.kind === "honk" && (!Number.isInteger(r.midi) || r.midi < 36 || r.midi > 84))) fail("recipe");
    if (["vowel", "nose", "gain", "envelope"].some(k => k in r)) fail("sound override");
  }
  const ids = new Set();
  const ends = { R: -Infinity, L: -Infinity };
  for (const e of d.score.events) {
    if (ids.has(e.id) || roles.get(e.role)?.midi !== e.midi || !e.sourceIds?.length ||
        !["R", "L"].includes(e.hand) || roles.get(e.role)?.hand !== e.hand ||
        e.beat < 0 || e.beat < ends[e.hand] - 1e-9 || !(e.beats > 0) || e.beat + e.beats > d.score.durationBeats) fail("live gate");
    ids.add(e.id); ends[e.hand] = e.beat + e.beats;
  }
  let cursor = 0;
  for (const b of d.arrangement.blocks) {
    if (b.beat !== cursor || ![2, 4, 8, 16].includes(b.beats) || b.patterns.length !== 2) fail("block boundary");
    for (const p of b.patterns) {
      if (p.beats !== b.beats || new Set(p.events.map(e => e.role)).size > 7) fail("Looper capacity");
      for (const e of p.events) if (roles.get(e.role)?.midi !== e.midi || e.beat < 0 ||
          !(e.beats > 0) || e.beat + e.beats > b.beats) fail("backing gate");
    }
    cursor += b.beats;
  }
  if (cursor < d.score.durationBeats || cursor - d.score.durationBeats >= 16) fail("ending");
  const all = [...d.score.events, ...d.arrangement.backing];
  if (new Set(all.map(e => e.id)).size !== all.length || all.length !== d.arrangement.sourceDecisions.length) fail("source assignments");
  for (const l of d.lessons) if (!l.eventIds.length || l.eventIds.some(id => !ids.has(id)) ||
      l.startBeat < 0 || l.endBeat > d.score.durationBeats || l.endBeat <= l.startBeat ||
      d.score.events.some(e => l.eventIds.includes(e.id) && (e.beat < l.startBeat || e.beat + e.beats > l.endBeat + 1e-9))) fail("phrase boundary");
  return d;
}

// A tempo change preserves phase. Historical observations must use the tempo
// that applied at their timestamp, not the final BPM of the attempt.
export function beatAtTime(history, atMs) {
  const segment = history.findLast(s => s.atMs <= atMs) || history[0];
  return segment ? segment.beat + (atMs - segment.atMs) * segment.bpm / 60000 : 0;
}

export function assessMelody(definition, lesson, heard, beatAt) {
  const remaining = heard.filter(e => e.origin === "learner" && ["note", "strike"].includes(e.kind));
  const events = definition.score.events.filter(e => lesson.eventIds.includes(e.id));
  const tolerance = lesson.assessment;
  let correct = 0;
  for (const note of events) {
    const index = remaining.findIndex(e => e.released && e.voiced && !e.invalidMembers &&
      e.midis?.length === 1 && Math.abs(e.midis[0] - note.midi) * 100 <= tolerance.pitchCents &&
      Math.abs(beatAt(e.startMs) - note.beat) <= tolerance.onsetBeats &&
      Math.abs(beatAt(e.endMs) - beatAt(e.startMs) - note.beats) <= tolerance.durationBeats &&
      matchesMelodyBend(note, e, tolerance, beatAt));
    if (index >= 0) { correct++; remaining.splice(index, 1); }
  }
  return { correct, total: events.length, extra: remaining.length, ok: correct === events.length && !remaining.length };
}

export function matchesMelodyBend(note, heard, tolerance, beatAt) {
  if (!note.bend?.length) return true;
  const samples = (heard.bendSamples || []).filter(s => Number.isFinite(s.offsetMs) && Number.isFinite(s.semitones));
  const timing = tolerance.bendTimingBeats ?? .16;
  const cents = tolerance.bendCents ?? 75;
  // Compare the performed curve in beats, using the tempo at each observation.
  // A small response window accommodates wrist/audio smoothing without giving
  // credit for a neutral hold or a bend in the opposite direction.
  const start = beatAt(heard.startMs);
  return note.bend.every(p => samples.some(s =>
    Math.abs(beatAt(heard.startMs + s.offsetMs) - start - p.fraction * note.beats) <= timing &&
    Math.abs(s.semitones - p.semitones) * 100 <= cents));
}

export class MelodyGuidance {
  constructor(ensemble, definition, startBeat = 0, endBeat = definition.score.durationBeats) {
    Object.assign(this, { ensemble, startBeat, endBeat });
    this.singleVoice = definition.requirements?.maxLiveVoices === 1;
    this.hasBends = definition.score.events.some(e => e.bend?.length);
    this.hasBacking = Boolean(definition.arrangement?.backing?.length);
    this.anchorMs = 0;
    this.step = { type: "data", timed: true, cueStyle: "attack-next", beats: endBeat,
      events: definition.score.events.filter(e => e.beat >= startBeat && e.beat < endBeat) };
  }
  get beatMs() { return 60000 / this.ensemble.a.get("metronome").bpm; }
  beatAt(now) { return this.ensemble.beatAt(now); }
  complete(now) { return this.beatAt(now) >= this.endBeat; }
  model(now) {
    const beat = this.beatAt(now);
    const next = this.step.events.find(e => e.beat + e.beats > beat);
    const bend = next?.bend && beat >= next.beat
      ? bendCueState(next.bend, (beat - next.beat) / next.beats, next) : null;
    return {
      transport: beat < this.startBeat ? `Count in: ${Math.ceil(this.startBeat - beat - 1e-9)}` :
        beat >= this.endBeat ? "Complete" : next && beat >= next.beat ? "Hold, then release" : "Release · rest",
      instruction: bend?.instruction || (this.hasBends
        ? "Highlighted square: press Trigger. White circle: next press. Keep Trigger held through the bend gauge; release and press again for repeated accents. Either hand works."
        : "Highlighted square: play this note now. White circle: next note. Aim and hold Trigger to sound the Honk; release Trigger to stop. Roll while holding Trigger to bend. Either hand is accepted."),
      feedback: this.hasBends
        ? "Triangle: target bend. Dot: your bend. Follow each turn while holding; return to a neutral wrist for the next press."
        : this.singleVoice && this.hasBacking
        ? "One melody note at a time. Follow the beat over the backing; if you miss a note, rejoin at the highlighted square."
        : "Keep your wrist neutral. Coordinate both hands through the overlapping holds. Cues follow the beat even if you miss a note.",
    };
  }
}
