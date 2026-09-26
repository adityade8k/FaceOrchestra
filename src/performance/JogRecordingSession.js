import { SongRecordingSession } from "./SongRecordingSession.js";
import { COMPOSITION } from "../tutorial/composition.js";
import { JogMelodyGuidance } from "./JogMelodyGuidance.js";
export { PHONE_REMINDER } from "./SongRecordingSession.js";
// Compatibility entry for existing callers and capture tests.
export class JogRecordingSession extends SongRecordingSession {
  constructor(options) {
    super({
      composition: { ...COMPOSITION, contentVersion: COMPOSITION.version },
      createGuidance: (anchor) => new JogMelodyGuidance(anchor),
      ...options,
    });
  }
}
