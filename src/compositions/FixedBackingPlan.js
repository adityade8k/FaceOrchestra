import { splitPatterns } from './BackingPatterns.js';
import { resolveLessonSequence } from './LessonSequence.js';
import { LOOPER_TRACK_COUNT, LOOPER_RECORD_BEATS, LOOPER_MAX_RECORDING_DURATION_MS } from '../config/looper.js';
import { METRONOME_CONNECTION_PORTS } from '../config/metronome.js';

// IDs describe provenance, not a different recording. Every musical field,
// route, cycle length and output remains part of the equality check.
export function patternKey(pattern) {
  return JSON.stringify({ lane: pattern.lane, beats: pattern.beats, gapBeats: pattern.gapBeats,
    events: pattern.events.map(({ role, beat, beats, type, sound, part, bend, pitchBendRange, velocity }) =>
      ({ role, beat, beats, type, sound, part, bend, pitchBendRange, velocity })) });
}
export function sequenceKey(backing, startBeat, endBeat) {
  return JSON.stringify([startBeat, endBeat, backing]);
}
export function fixedBackingPlan(definition) {
  const config = definition.arrangement.fixedBacking;
  if (!config || config.outputGroups.length > METRONOME_CONNECTION_PORTS.length)
    throw new Error('Fixed backing exceeds the four Metronome outputs.');
  const patterns = [], byKey = new Map(), sequences = new Map();
  const add = (backing, startBeat, endBeat) => {
    const key = sequenceKey(backing, startBeat, endBeat);
    if (sequences.has(key)) return;
    const blocks = splitPatterns(backing, startBeat, endBeat);
    const steps = blocks.map((block, index) => ({ ...block, patterns: block.patterns.map((sourcePattern, lane) => {
      const terminal = !blocks[index + 1]?.patterns[lane].events.length;
      // One ordinary Gap beat after a terminal cycle keeps its next repeat
      // silent while Stop is serviced. No in-song note or rest moves.
      const pattern = { ...sourcePattern, gapBeats: terminal ? config.terminalGapBeats : 0 };
      if (!pattern.events.length) return null; // A silent layer needs no fake recording.
      const tracks = new Set(pattern.events.filter(e => e.role !== 'hihat').map(e => e.role));
      if (tracks.size > LOOPER_TRACK_COUNT - 1) throw new Error('Fixed backing exceeds seven instrument tracks plus the clock.');
      if (!LOOPER_RECORD_BEATS.includes(pattern.beats) || pattern.beats * 60000 / 30 > LOOPER_MAX_RECORDING_DURATION_MS)
        throw new Error('Fixed backing exceeds the supported recording window.');
      const output = config.outputGroups.indexOf(pattern.lane);
      if (output < 0) throw new Error('Missing backing output group.');
      const identity = patternKey(pattern);
      if (!byKey.has(identity)) {
        const item = { ...pattern, role: `pattern-${pattern.lane}-${patterns.length + 1}`, output, volume: config.volume };
        patterns.push(item); byKey.set(identity, item);
      }
      return byKey.get(identity).role;
    }) }));
    sequences.set(key, { startBeat, endBeat, blocks: steps });
  };
  add(definition.arrangement.backing, 0, definition.score.durationBeats);
  for (const lesson of definition.lessons) {
    const resolved = resolveLessonSequence(definition, lesson);
    add(resolved.definition.arrangement.backing, resolved.lesson.startBeat, resolved.lesson.endBeat);
  }
  return { patterns, sequences };
}
