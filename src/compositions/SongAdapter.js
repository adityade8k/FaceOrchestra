import { SongTutorial } from '../tutorial/SongTutorial.js';
import { MelodyGuidance } from './MelodyScore.js';
import { resolveLessonSequence } from './LessonSequence.js';

// A fresh selection owns its ensemble and guide. No song can replace the
// ensemble captured by an already prepared recording session.
export function songAdapter(definition, Ensemble) {
  const select = () => {
    let ensemble;
    return {
      definition,
      createEnsemble(host) { return ensemble = new Ensemble(host, definition); },
      createGuidance(anchor) {
        const clock = ensemble || { a: { get: () => ({ bpm: definition.bpm }) },
          beatAt: now => (now - anchor) * definition.bpm / 60000 };
        return new MelodyGuidance(clock, definition);
      },
      async enterTutorial(host) {
        host.freePlayScene ??= host.r.sceneSerializer.serialize();
        host.dataTutorial = new SongTutorial(host, definition, {
          Ensemble, accompaniment: Boolean(definition.arrangement.backing.length),
          maxBpm: definition.maxBpm ?? definition.bpm, resolveLesson: resolveLessonSequence,
        });
        host.dataTutorial.prepare();
        host.r.sessionMode = 'practice';
      },
    };
  };
  return { ...select(), selectArrangement: async () => select() };
}
