import { finalizeDefinition } from './definition-identity.mjs';
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateLiveMelody } from "../../src/tutorial/live-melody/score.js";

const root = new URL("../../src/compositions/tu-kisi-rail-si/", import.meta.url);
const source = JSON.parse(await readFile(new URL("normalized.json", root)));
const sequence = source.sequences[0], ppq = source.source.division.ppq;
if (source.source.sha256 !== "ce00474f06ea7e4b5af71ae009ca99c12fe8d1ef368d9a06b73dcd7924620f46")
  throw new Error("Review changed MIDI before replacing the authored arrangement");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bpm = 60000000 / sequence.tempo[0].us;
const raw = sequence.notes.map(n => ({
  id: n.id, sourceIds: [n.id], midi: n.midi, velocity: n.velocity,
  startTick: n.startTick, releaseTick: n.releaseTick,
  beat: n.startTick / ppq, beats: (n.releaseTick - n.startTick) / ppq,
}));
const pitches = [...new Set(raw.map(n => n.midi))].sort((a, b) => a - b);
// One shared target per pitch, ascending left to right across two rows.
const position = midi => {
  const index = pitches.indexOf(midi);
  return [(index % 5 - 2) * .2, .19 + Math.floor(index / 5) * .24, .2];
};
const distance = (a, b) => Math.hypot(...position(a).map((v, i) => v - position(b)[i]));
// Occupied hands are unavailable. Among exact assignments, prefer a short
// move and time to release/reposition at the 60 BPM practice tempo.
let states = new Map([["-1,-1", { last: { R: -1, L: -1 }, cost: 0, hands: [] }]]);
for (const [index, n] of raw.entries()) {
  const next = new Map();
  for (const state of states.values()) for (const hand of ["R", "L"]) {
    const prev = raw[state.last[hand]];
    if (prev && prev.releaseTick > n.startTick) continue;
    let cost = hand === "L" ? .24 : 0;
    if (prev) {
      const attack = n.beat - prev.beat, gap = attack - prev.beats, travel = distance(prev.midi, n.midi);
      cost += Math.max(0, .5 - attack) ** 2 * 100 + Math.max(0, .08 + travel * .4 - gap) ** 2 * 30 + travel ** 2 / Math.max(attack, .1);
    }
    const last = { ...state.last, [hand]: index }, key = `${last.R},${last.L}`;
    const value = { last, cost: state.cost + cost, hands: [...state.hands, hand] };
    if (!next.has(key) || value.cost < next.get(key).cost) next.set(key, value);
  }
  if (!next.size) throw new Error(`More than two simultaneous holds at ${n.id}`);
  states = next;
}
const assignment = [...states.values()].sort((a, b) => a.cost - b.cost)[0];
const events = raw.map((n, i) => ({ ...n, hand: assignment.hands[i], role: `lead-${n.midi}` }));
const durationBeats = Math.max(...sequence.events.map(e => e.tick)) / ppq;
const lessons = [];
let start = 0;
while (start < events.length) {
  let heldUntil = events[start].beat + events[start].beats;
  const candidates = [];
  for (let i = start + 1; i < events.length; i++) {
    const span = events[i].beat - events[start].beat;
    if (events[i].beat >= heldUntil - 1e-9 && span >= 6) candidates.push(i);
    if (span > 12 && candidates.length) break;
    heldUntil = Math.max(heldUntil, events[i].beat + events[i].beats);
  }
  const next = candidates.length ? candidates.sort((a, b) =>
    Math.abs(events[a].beat - events[start].beat - 10) - Math.abs(events[b].beat - events[start].beat - 10))[0] : events.length;
  const phrase = events.slice(start, next);
  lessons.push({
    id: `phrase-${lessons.length + 1}`, title: `Phrase ${lessons.length + 1}`,
    goal: "Play the labelled melody targets with both hands. Hold each note until its release cue, including overlaps. Keep your wrist neutral.",
    practice: true, demonstration: true, skip: true, completePerformance: false,
    startBeat: start === 0 ? 0 : events[start].beat,
    endBeat: next < events.length ? events[next].beat : durationBeats,
    eventIds: phrase.map(e => e.id), recommendedBpm: 60,
    assessment: { pitchCents: 25, onsetBeats: .15, durationBeats: .2 },
  });
  start = next;
}
lessons.push({ ...lessons[0], id: "performance", title: "Complete guided performance",
  startBeat: 0, endBeat: durationBeats, eventIds: events.map(e => e.id), recommendedBpm: bpm, completePerformance: true });
const recipes = pitches.map(midi => ({ kind: "honk", role: `lead-${midi}`, midi, position: position(midi), scale: .85 }));
recipes.push({ kind: "metronome", role: "metronome", position: [-.85, -.6, .05], scale: .65 });
const options = { id: "tu-kisi-rail-si", title: "Tu Kisi Rail Si", version: 2, sequence: 0,
  live: { track: 0, channel: 0, port: 0 }, transpose: 0, playback: "honk-live-two-hand-v1",
  teachingGrid: "Quarter-note pulses at the MIDI tempo; four-pulse count-in. Source has no meter event.",
  authoringScript: "scripts/midi/arrange-tu-kisi-rail-si.mjs" };
const definition = {
  schemaVersion: 1, id: options.id, title: options.title, contentVersion: 2,
  bpm, sourceBpm: bpm, practiceBpm: 60, liveRole: "melody", playback: options.playback,
  source: source.source, importOptions: options,
  normalizedSource: { file: "normalized.json", sha256: hash(source), sequence: 0 },
  score: { events, durationBeats, durationSeconds: sequence.durationSeconds,
    sourceTempo: sequence.tempo, sourceMeter: sequence.meter },
  arrangement: { id: "live-melody", title: "Two-hand live melody", version: 2, recipes, backing: [],
    provenance: `All 159 notes from MIDI ${source.source.sha256}; no automatic backing.`,
    roleAssignments: [{ role: "melody", sequence: 0, source: options.live }], exclusions: [],
    decisions: [
      "Every source attack and key release is retained, including the opening rest and all two-note overlaps. No transposition, quantization, merging or trimming.",
      "One shared Honk per distinct pitch, reused for every repeated note. Two-hand assignments preserve independent overlapping holds; either hand can play each target. Highlighting uses plain squares.",
      "No Looper instruments, Looper tracks, or automatic accompaniment. The Metronome supplies timing only.",
      "Source piano timbre is replaced by the normal Honk voice. MIDI velocity remains provenance; normal Trigger dynamics apply.",
      options.teachingGrid,
    ] }, lessons,
  recording: { countIn: 4, tailMs: 500, end: "manual", synchronization: "captured-noise-once",
    instructions: "Play every melody note live with both hands. Aim at the Honk with the highlighted square and hold Trigger to play; the gray circle marks the next note. Release Trigger before pressing again for the next note. This song has no Looper or backing track." },
  requirements: { maxHonks: recipes.length - 1, maxLoopers: 0, maxLiveVoices: 2 }, warnings: source.warnings,
};
validateLiveMelody(definition);
await finalizeDefinition(definition, root);
for (const [file, value] of [["composition.json", definition], ["import-options.json", options]])
  await writeFile(new URL(file, root), JSON.stringify(value, null, 2) + "\n");
console.log(JSON.stringify({ notes: events.length, phrases: lessons.length - 1, bpm, durationSeconds: sequence.durationSeconds,
  honks: recipes.length - 1, loopers: 0, hash: definition.contentHash }));
