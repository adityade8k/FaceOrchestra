import { validateComposition } from "../../compositions/CompositionDefinition.js";
import { validateLiveMelody } from "../live-melody/score.js";
import { compilePattern } from "../../compositions/CompositionCompiler.js";
import { splitPatterns } from "../../compositions/BackingPatterns.js";
import { resolveLessonSequence } from "../../compositions/LessonSequence.js";

export const LANES = ["foundation", "figures"];
export function validateKuchOrchestra(d) {
  validateComposition(d);
  const fail = message => { throw new Error(`Invalid Kuch orchestra: ${message}`); };
  if (d.playback !== "honk-kuch-orchestra-v1" || !d.arrangement.fixedBacking ||
      d.liveRole !== "melody" || d.requirements.maxLiveVoices !== 1) fail("playback contract");
  const recipes = d.arrangement.recipes;
  const roles = new Map(recipes.map(r => [r.role, r]));
  if (roles.size !== recipes.length) fail("duplicate role");
  for (const r of recipes) {
    if (!["honk", "looper", "metronome"].includes(r.kind) || r.position?.length !== 3 ||
        !r.position.every(Number.isFinite) || !(r.scale > 0) ||
        (r.kind === "honk" && (!Number.isInteger(r.midi) || r.midi < 36 || r.midi > 84)) ||
        ["vowel", "nose", "gain", "envelope", "waveform", "voice", "sample", "audioUrl"].some(k => k in r)) fail("recipe");
  }
  // Reuse the strict melody/bend contract, keeping all automatic roles out of
  // the learner's score, assessment, target squares and placement frame.
  validateLiveMelody({ ...d, playback: "honk-live-two-hand-v1",
    requirements: { ...d.requirements, maxLoopers: 0 },
    arrangement: { ...d.arrangement, backing: [], recipes: recipes.filter(r => r.part === "melody" || r.kind === "metronome") },
  });
  const ids = new Set(d.score.events.flatMap(e => e.sourceIds));
  for (const e of d.arrangement.backing) {
    if (!e.id || ids.has(e.id) || !Number.isFinite(e.beat) || !Number.isFinite(e.beats) ||
        e.beat < 0 || !(e.beats > 0) || e.beat + e.beats > d.score.durationBeats + 1e-9 ||
        !Number.isFinite(e.velocity) || e.velocity < 1 || e.velocity > 127) fail("backing event");
    ids.add(e.id);
    if (e.part === "hihat") {
      if (e.role !== "hihat" || e.sound !== "hihat") fail("hi-hat mapping");
    } else if (e.part === "percussion") {
      if (e.role !== "percussion" || e.sound !== "boink" || roles.get(e.role)?.kind !== "honk") fail("percussion mapping");
    } else if (!["flute", "chords"].includes(e.part) || e.sound ||
        roles.get(e.role)?.part !== e.part || roles.get(e.role)?.midi !== e.midi) fail("pitched backing mapping");
  }
  const blocks = splitPatterns(d.arrangement.backing, 0, d.score.durationBeats);
  if (JSON.stringify(blocks) !== JSON.stringify(d.arrangement.blocks)) fail("stale backing patterns");
  for (const lesson of d.lessons) if (lesson.sequenceLessonIds) resolveLessonSequence(d, lesson);
  return d;
}

export function compileKuchPattern(pattern, routes, bpm) {
  const timeline = compilePattern({ ...pattern, routes, beatMs: 60000 / bpm,
    defaults: { vowel: "A", nose: 0 },
  });
  // These are ordinary recorded vowel/nose controls. HonkVoice and both stick
  // percussion profiles remain untouched; no audio file or alternate synth runs.
  for (const role of new Set(pattern.events.filter(e => !e.sound).map(e => e.role))) {
    const track = timeline.tracks.get(routes[role].trackId);
    const chords = pattern.events.find(e => e.role === role).part === "chords";
    for (const event of track.events) if (event.type === "gestureSnapshot") {
      event.values.vowel = chords ? "O" : "A";
      event.values.nose = chords ? .6 : .1;
    }
    track.sorted = false;
  }
  return timeline;
}
