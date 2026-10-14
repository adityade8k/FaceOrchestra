import { finalizeDefinition } from './definition-identity.mjs';
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateLiveMelody } from "../../src/tutorial/live-melody/score.js";

const root = new URL("../../src/compositions/nazariya-honk-bends/", import.meta.url);
const hash = value => createHash("sha256").update(value).digest("hex");
const sourceHash = "d2ca1e4bc2aef6de444843875920e0fe38b06e101e390d52d89a93390b3733f1";
const approvedFile = "approved-70bpm-screenshot-arrangement.json";
const approvedHash = "6a5face108b5df85064a11945f0bf6a30a7c1ffafe89458d86ff6879732791c1";
const approvedBytes = await readFile(new URL(approvedFile, root));
if (hash(approvedBytes) !== approvedHash) throw new Error("Review changes to the approved 70 BPM screenshot arrangement");
const approved = JSON.parse(approvedBytes);
const normalized = JSON.parse(await readFile(new URL("normalized.json", root)));
if (normalized.source.sha256 !== sourceHash ||
    hash(await readFile(new URL(`${sourceHash}.mid`, root))) !== sourceHash)
  throw new Error("Original screenshot-derived MIDI has changed");

const previous = JSON.parse(await readFile(new URL("provenance/layout-v4.json", root)));
const screenshotBytes = await readFile(new URL("screenshot-notes.json", root));
if (hash(screenshotBytes) !== approved.source.sha256) throw new Error("Screenshot reconstruction has changed");
const screenshotNotes = JSON.parse(screenshotBytes).notes;
const bpm = approved.bpm, version = 5, durationBeats = approved.score.durationBeats;
// Import the accepted preview's exact note gates and beat-relative curves.
// Its offline approximation of the voice is never part of the app.
const events = approved.score.events.map(n => ({ ...n, sourceIds: [n.id] }));
// Keep the familiar positions, including pitches reached only within a bend.
const pitches = previous.arrangement.recipes.filter(r => r.kind === "honk").map(r => r.midi);
if (events.some(e => !pitches.includes(e.midi))) throw new Error("Missing starting pitch in the approved layout");
const recoveredTargets = events.flatMap(e => e.pitchTargets);
if (recoveredTargets.length !== screenshotNotes.length || recoveredTargets.some((p,i) =>
    p.sourceId !== screenshotNotes[i].id || p.midi !== screenshotNotes[i].pitch ||
    p.beat !== screenshotNotes[i].start || p.endBeat !== screenshotNotes[i].end))
  throw new Error("The arrangement no longer covers every screenshot pitch target");
const columns = Math.ceil(pitches.length / 2);
const recipes = pitches.map((midi,i) => ({ kind: "honk", role: `lead-${midi}`, midi,
  position: [(i % columns - (columns - 1) / 2) * .23, .19 + Math.floor(i / columns) * .26, .2], scale: .85 }));
recipes.push({ kind: "metronome", role: "metronome", position: [-.85, -.6, .05], scale: .65 });

const goals = [
  "Keep the opening taps distinct. Hold C♯ through the rising and falling turn. Follow each held bend, then keep the final C♯ pressed as it bends down through B to A.",
  "Keep the low repeated pulses crisp. Hold F♯ through the descent to E and E♭. Keep C♯ held through the answering bends, and use one final hold for the descent through B to A.",
  "Keep the high repeated notes distinct. Hold G♯ through F♯ and back to G♯, then hold A through the crest at B and the descent to F♯.",
  "Hold E as it bends up through F♯ to G♯, then keep the repeated G♯ taps distinct. Use one press for each following bend phrase, staying held through every turn and return to neutral.",
  "Follow the falling and rising turns with continuous holds. Do not press again within a bend phrase. Keep the returning E pulses distinct.",
  "Hold through each quick turn and keep the repeated E accents distinct. Keep the final E held through all its rising and falling bends to C♯.",
  "Hold the opening C♯ through the answering bends. Use one hold for the C♯ to B to A descent, preserve the low pulses, and hold the final F♯ through E to E♭ before the two C♯ presses.",
];
const assessment = { pitchCents: 35, onsetBeats: .22, durationBeats: .3, bendCents: 75, bendTimingBeats: .16 };
// Boundaries follow original screenshot attacks, avoiding rounded MIDI ticks
// that would put an opening note just before its tutorial phrase.
const phraseStarts = [0, 17, 39, 52, 73, 92, 113];
const phrases = phraseStarts.map((sourceId,i) => ({
  id: previous.lessons[i].id, title: previous.lessons[i].title,
  startBeat: i === 0 ? 0 : screenshotNotes[sourceId].start,
  endBeat: i + 1 < phraseStarts.length ? screenshotNotes[phraseStarts[i+1]].start : durationBeats,
}));
const lessons = phrases.map((phrase,i) => ({ ...phrase, goal: goals[i],
  practice: true, demonstration: true, skip: true, completePerformance: false,
  eventIds: events.filter(e => e.beat >= phrase.startBeat && e.beat < phrase.endBeat).map(e => e.id),
  recommendedBpm: bpm, assessment,
}));
lessons.push({ ...lessons[0], id: "performance", title: "Complete guided performance",
  goal: "Play the whole section at 70 BPM. Keep Trigger held through each complete bend phrase, including every turn and return to neutral. Release only between separate notes and preserve the repeated rhythmic taps. Either hand works.",
  startBeat: 0, endBeat: durationBeats, eventIds: events.map(e => e.id), completePerformance: true });

const options = { id: "nazariya-honk-bends", title: "Nazariya Ki Maari", version,
  sequence: 0, live: { track: 1, channel: 0, port: 0 }, transpose: 0,
  playback: "honk-live-two-hand-v1", approvedArrangement: approvedFile,
  authoringScript: "scripts/midi/arrange-nazariya-honk-bends.mjs" };
const normalizedHash = hash(JSON.stringify(normalized));
const definition = {
  schemaVersion: 1, id: options.id, title: options.title, contentVersion: version,
  bpm, sourceBpm: 70, practiceBpm: bpm, maxBpm: bpm, pitchBendRange: 4,
  liveRole: "melody", playback: options.playback, source: normalized.source, importOptions: options,
  normalizedSource: { file: "normalized.json", sha256: normalizedHash, sequence: 0 },
  authoredSource: { file: approvedFile, sha256: approvedHash,
    sourcePreview: { filename: "nazariya-original-screenshots-bends-70bpm-composition.json", sha256: approvedHash },
    sourceScreenshots: { file: "screenshot-notes.json", sha256: hash(screenshotBytes), noteCount: screenshotNotes.length },
    sourceCompositionFile: "provenance/layout-v4.json", sourceCompositionHash: "67fa4ed500dbba504f664fad6631533c2effd4e03f2bbd24ae7697ad8facb170" },
  score: { events, durationBeats, durationSeconds: durationBeats*60/bpm,
    sourceTempo: normalized.sequences[0].tempo, sourceMeter: normalized.sequences[0].meter },
  arrangement: { id: "screenshot-contours-70", title: "Original screenshot contours and rhythmic taps", version,
    recipes, backing: [], provenance: `Approved 70 BPM arrangement ${approvedHash}; original MIDI ${sourceHash}`,
    roleAssignments: [{ role: "melody", sequence: 0, source: options.live }], exclusions: [],
    decisions: [
      "The accepted full 70 BPM preview is imported exactly: 58 presses with 26 continuous bend holds, preserving all 135 reconstructed pitch targets.",
      "Each live event references its approved arrangement event ID. Screenshot note IDs and exact target beats are retained; historical MIDI and normalized inventory are unchanged.",
      "Natural rises and falls use continuous bends. Repeated accents remain separate. Tutorial boundaries follow the screenshot timing and never cut a held gesture.",
      "The existing ten-Honk layout is preserved. Either hand can play; all bends within one hold use one Trigger press.",
      "Every sound uses the ordinary Honk instrument, voice engine, vowel, gain, envelope, and mixer. Only tuning, note timing and wrist bend are guided; preview audio and synthesis are not loaded.",
      "The original MIDI was reconstructed from the user's edited GarageBand screenshots; its timing remains approximate relative to that visual source.",
    ] }, lessons,
  recording: { bpm, countIn: 4, tailMs: 500, end: "manual", synchronization: "captured-noise-once",
    instructions: "Play at 70 BPM. Follow the squares for each new press. When the bend gauge appears, keep Trigger held through the entire bend phrase and every return to neutral. Release between separate notes and preserve repeated accents. Either hand works." },
  requirements: { maxHonks: pitches.length, maxLoopers: 0, maxLiveVoices: 1 }, warnings: normalized.warnings,
};
validateLiveMelody(definition);
await finalizeDefinition(definition, root);
for (const [file,value] of [["composition.json",definition],["import-options.json",options]])
  await writeFile(new URL(file,root), JSON.stringify(value,null,2)+"\n");
console.log(JSON.stringify({ notes: events.length, bentHolds: events.filter(e => e.bend).length,
  phrases: lessons.length-1, bpm, honks: pitches.length, durationSeconds: definition.score.durationSeconds }));
