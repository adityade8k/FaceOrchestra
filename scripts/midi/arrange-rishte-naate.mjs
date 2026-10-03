import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateMidiPerformance } from "../../src/compositions/MidiPerformance.js";

// Authored mapping of the supplied, single-track piano performance. Rebuild
// from its preserved source; never infer notes from the filename.
const root = new URL("../../src/compositions/rishte-naate/", import.meta.url);
const normalized = JSON.parse(await readFile(new URL("normalized.json", root)));
const expected = "b5f63cb589b93c0bdab89edbcdaf44a1b0ce6ad4e3e72b6575cf0b96d70eea35";
if (normalized.source.sha256 !== expected) throw new Error("Unexpected source MIDI");
const sequence = normalized.sequences[0];
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Upper-register accompaniment tones identified by simultaneous higher attacks,
// arpeggio position and long inner-voice holds. They remain in full playback.
const innerVoices = new Set([12, 66, 92, 124, 178, 208, 285, 290, 295, 298, 306, 352, 382].map(i => `t0-e${i}`));
const options = {
  id: "rishte-naate", title: "rishte naate.mid", version: 1, sequence: 0,
  live: { track: 0, channel: 0, port: 0 }, transpose: 0,
  melody: { minimumMidi: 68, accompanimentExceptions: [...innerVoices] },
  rolePolicy: "Inferred upper piano line; MIDI contains no separate part labels. MIDI below 60 is bass, remaining non-melody notes are harmony.",
};
const events = sequence.notes.map(n => {
  const part = n.midi >= 68 && !innerVoices.has(n.id) ? "melody" : n.midi < 60 ? "bass" : "harmony";
  return { ...n, part, role: `${part}-${n.midi}` };
});
const recipes = [];
for (const [row, part] of ["melody", "harmony", "bass"].entries()) {
  const pitches = [...new Set(events.filter(e => e.part === part).map(e => e.midi))].sort((a,b) => a-b);
  pitches.forEach((midi, i) => recipes.push({ kind: "honk", role: `${part}-${midi}`, midi,
    position: [(i - (pitches.length - 1) / 2) * .24, .55 - row * .40, -row * .16], scale: 1,
    vowel: part === "melody" ? "A" : part === "bass" ? "U" : "O" }));
}
recipes.push({ kind: "metronome", role: "metronome", position: [-1.4, -.65, 0], scale: .65 });
const duration = sequence.durationSeconds, bpm = 60000000 / sequence.tempo[0].us;
// Extend nominal sixteen-beat phrases through every crossing pedal-held voice.
// These are practice windows, not asserted verse/chorus labels or new loops.
const ranges = [];
let start = 0;
while (start < duration) {
  let end = Math.min(duration, start + 16 * 60 / bpm);
  for (const event of events) {
    if (event.startSeconds < end) end = Math.max(end, event.endSeconds);
  }
  ranges.push([start, end]);
  start = end;
}
const lesson = ([startSeconds, endSeconds], i, full = false) => ({
  id: full ? "performance" : `phrase-${i + 1}`,
  title: full ? "Complete performance" : `Phrase ${i + 1}`,
  goal: "Play the upper row at the highlighted attacks. Release with the written key holds; the demonstration also includes the pedal tails.",
  practice: true, demonstration: true, skip: true, completePerformance: full,
  startSeconds, endSeconds,
  eventIds: events.filter(e => e.part === "melody" && e.startSeconds >= startSeconds && e.startSeconds < endSeconds).map(e => e.id),
  setup: "Upper row: melody. Middle row: harmony. Lower row: bass. Demonstrate plays the complete piano arrangement; Practice leaves the upper line to you.",
  assessment: { pitchCents: 25, onsetSeconds: .15, durationSeconds: .2, bendCents: 50 },
  success: "Melody attacks, pitches and key releases matched.",
  retry: "Practice / Retry starts a new four-beat count-in.",
});
const definition = {
  schemaVersion: 1, id: options.id, title: options.title, contentVersion: 1,
  playback: "polyphonic-midi-v1", bpm, liveRole: "melody", source: normalized.source,
  importOptions: options,
  normalizedSource: { file: `${hash(normalized)}.normalized.json`, sha256: hash(normalized), sequence: 0 },
  score: { events, durationSeconds: duration, tempo: sequence.tempo, meter: sequence.meter },
  arrangement: { recipes, backing: [],
    provenance: `MIDI ${expected}; all 296 notes retained with key and pedal releases`,
    roleAssignments: ["melody", "bass", "harmony"].map(role => ({ role, source: options.live, inferred: true, eventIds: events.filter(e=>e.part===role).map(e=>e.id) })),
    transformations: [], exclusions: [],
    decisions: [options.rolePolicy,
      "No quantization, transposition, trimming, repeats, percussion or additional notes.",
      "Independent Honk voices preserve equal-pitch overlaps and sustain; a through-played score avoids the 16-beat Looper limit.",
      "Velocity scales audio gain by velocity/127. A/U/O vowels substitute the piano; bass and harmony use 65% of the melody gain.",
      "All sounding durations are preserved in Demonstrate. Live practice assesses original key releases; a hand-played Honk has no sustain pedal.",
      "Sequencer-specific metadata is archived without interpretation; channel 2 has pedal messages but no notes.",
      "Practice windows extend beyond sixteen beats where pedal-held voices cross the nominal boundary. Full performance is uninterrupted."] },
  lessons: [...ranges.map((r,i)=>lesson(r,i)), lesson([0,duration], ranges.length, true)],
  recording: { countIn: 4, tailMs: 500, end: "manual", synchronization: "captured-noise-once" },
  requirements: { maxHonks: recipes.length - 1, maxLoopers: 0, maxPlaybackVoices: normalized.inventory[0].tracks[0].maximumPolyphony },
  warnings: normalized.warnings,
};
validateMidiPerformance(definition);
definition.contentHash = hash(definition);
for (const [name, value] of [["import-options.json", options], ["composition.json", definition], [`${definition.contentHash}.composition.json`, definition]])
  await writeFile(new URL(name, root), JSON.stringify(value, null, 2) + "\n");
console.log(JSON.stringify({ notes: events.length, roles: Object.fromEntries(["melody","bass","harmony"].map(p=>[p,events.filter(e=>e.part===p).length])), lessons: ranges, honks: recipes.length-1, contentHash: definition.contentHash }));
