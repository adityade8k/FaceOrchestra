import { validateComposition } from "../../compositions/CompositionRegistry.js";

export function validateRishte(d) {
  validateComposition(d);
  const fail = message => { throw new Error(`Invalid Rishte arrangement: ${message}`); };
  if (d.playback !== "honk-looper-human-v1") fail("playback contract");
  const roles = new Map(d.arrangement.recipes.map(r => [r.role, r]));
  if (roles.size !== d.arrangement.recipes.length) fail("duplicate role");
  for (const r of roles.values()) {
    if (!["honk", "looper", "metronome"].includes(r.kind) || r.position.length !== 3 ||
        !r.position.every(Number.isFinite) || !(r.scale > 0) ||
        (r.kind === "honk" && (!Number.isInteger(r.midi) || r.midi < 36 || r.midi > 84))) fail("recipe");
    if (["vowel", "nose", "gain", "envelope"].some(k => k in r)) fail("sound override");
  }
  const ids = new Set();
  let end = -Infinity;
  for (const e of d.score.events) {
    if (ids.has(e.id) || roles.get(e.role)?.midi !== e.midi || !e.sourceIds?.length ||
        e.beat < 0 || e.beat < end || !(e.beats > 0) || e.beat + e.beats > d.score.durationBeats) fail("live gate");
    ids.add(e.id); end = e.beat + e.beats;
  }
  let cursor = 0;
  for (const b of d.arrangement.blocks) {
    if (b.beat !== cursor || ![4, 8].includes(b.beats) || b.patterns.length !== 2) fail("block boundary");
    for (const p of b.patterns) {
      if (!p.events.length || p.beats !== b.beats || new Set(p.events.map(e => e.role)).size > 7) fail("Looper capacity");
      for (const e of p.events) if (roles.get(e.role)?.midi !== e.midi || e.beat < 0 ||
          !(e.beats > 0) || e.beat + e.beats > b.beats) fail("backing gate");
    }
    cursor += b.beats;
  }
  if (cursor !== d.score.durationBeats) fail("ending");
  for (const l of d.lessons) if (!l.eventIds.length || l.eventIds.some(id => !ids.has(id)) ||
      !d.arrangement.blocks.some(b => b.beat === l.startBeat) ||
      !d.arrangement.blocks.some(b => b.beat + b.beats === l.endBeat)) fail("phrase boundary");
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
      Math.abs(beatAt(e.endMs) - beatAt(e.startMs) - note.beats) <= tolerance.durationBeats);
    if (index >= 0) { correct++; remaining.splice(index, 1); }
  }
  return { correct, total: events.length, extra: remaining.length, ok: correct === events.length && !remaining.length };
}

export class RishteGuidance {
  constructor(ensemble, definition, startBeat = 0, endBeat = definition.score.durationBeats) {
    Object.assign(this, { ensemble, startBeat, endBeat });
    this.anchorMs = 0;
    this.step = { type: "data", timed: true, beats: endBeat,
      events: definition.score.events.filter(e => e.beat >= startBeat && e.beat < endBeat) };
  }
  get beatMs() { return 60000 / this.ensemble.a.get("metronome").bpm; }
  beatAt(now) { return this.ensemble.beatAt(now); }
  complete(now) { return this.beatAt(now) >= this.endBeat; }
  model(now) {
    const beat = this.beatAt(now);
    const next = this.step.events.find(e => e.beat + e.beats > beat);
    return {
      transport: beat < this.startBeat ? `Count in: ${Math.ceil(this.startBeat - beat)}` :
        beat >= this.endBeat ? "Complete" : next && beat >= next.beat ? "Hold, then release" : "Release · rest",
      instruction: "You play the upper melody arc. Green prepares the next target; yellow shows the hold. The lower Honks are the Looper accompaniment.",
      feedback: "Keep your wrist neutral. Release before moving to the next target.",
    };
  }
}
