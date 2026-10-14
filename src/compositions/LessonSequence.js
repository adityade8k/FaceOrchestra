import { splitPatterns } from "./BackingPatterns.js";

const cached = new WeakMap();

// A tutorial-only timeline: preserve each phrase and its backing, then place
// the next phrase directly after it. The recorded/full-song score stays intact.
export function resolveLessonSequence(definition, lesson) {
  if (!lesson.sequenceLessonIds) return { definition, lesson };
  const fail = () => { throw new Error("Invalid Kuch phrase sequence"); };
  const ids = lesson.sequenceLessonIds;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      !Number.isInteger(lesson.countInBeats) || lesson.countInBeats < 1 || lesson.countInBeats > 4 ||
      lesson.completePerformance) fail();
  const parts = ids.map(id => definition.lessons.find(l => l.id === id));
  if (parts.some((p, i) => !p || p.sequenceLessonIds || p.completePerformance ||
      (i && p.startBeat < parts[i - 1].endBeat))) fail();
  if (JSON.stringify(parts.flatMap(p => p.eventIds)) !== JSON.stringify(lesson.eventIds) ||
      lesson.startBeat !== parts[0].startBeat || lesson.endBeat !== parts.at(-1).endBeat) fail();
  let entries = cached.get(definition);
  if (!entries) cached.set(definition, entries = new Map());
  if (entries.has(lesson)) return entries.get(lesson);

  const events = [], backing = [];
  let durationBeats = 0;
  for (const part of parts) {
    const shift = durationBeats - part.startBeat;
    for (const event of definition.score.events.filter(e => part.eventIds.includes(e.id))) {
      events.push({ ...event, beat: event.beat + shift,
        pitchTargets: event.pitchTargets.map(t => ({ ...t, beat: t.beat + shift })) });
    }
    for (const event of definition.arrangement.backing) {
      const start = Math.max(event.beat, part.startBeat);
      const end = Math.min(event.beat + event.beats, part.endBeat);
      if (end > start) backing.push({ ...event, beat: start + shift, beats: end - start,
        ...(start > event.beat ? { carry: true } : {}) });
    }
    durationBeats += part.endBeat - part.startBeat;
  }
  const playback = {
    definition: { ...definition, score: { ...definition.score, events, durationBeats },
      arrangement: { ...definition.arrangement, backing, blocks: splitPatterns(backing, 0, durationBeats) } },
    lesson: { ...lesson, startBeat: 0, endBeat: durationBeats },
  };
  entries.set(lesson, playback);
  return playback;
}
