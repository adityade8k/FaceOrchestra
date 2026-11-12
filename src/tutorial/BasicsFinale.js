import { LESSON_STEPS } from "../compositions/songs/jog/definition.js";
import { TutorialSession } from "./TutorialSession.js";

const part = (id, title, instruction, requiredTakes = []) =>
  Object.freeze({
    ...LESSON_STEPS.find((step) => step.id === id),
    title,
    instruction,
    requiredTakes,
    alignBacking: true,
    prerequisites: [],
    entry:
      "Demonstrate previews this part; complete Practice to continue. Only learner performance earns completion.",
  });
export const BASICS_FINALE_STEPS = Object.freeze([
  part(
    "record-chords",
    "Record your chord loop",
    "Build your first composition. The instruments are connected and both loopers are empty. Demonstrate shows the pattern. Practice counts you in: play Groups 1–4 on beats 1, 5, 9 and 13, holding each until its ring finishes. Your 16-beat take becomes the backing.",
  ),
  part(
    "record-percussion",
    "Add your percussion loop",
    "Keep your chord take. Watch Demonstrate, then hold Grip in empty space for a stick. Practice plays your chords while you record: Honk on 1, Metronome wood on 3, Looper hihat on 4. Repeat four times, withdrawing after each strike.",
    ["chordLooper"],
  ),
  part(
    "learn-bend",
    "Follow the melody bend",
    "Release Grip to put away the stick. Watch the Eb4 → C4 demonstration, then Practice: hold Trigger on Eb4 and follow the radial bend indicator down to C. Keep one continuous note, settle on C, then release. Both recorded loops are kept.",
    ["chordLooper", "percussionLooper"],
  ),
  part(
    "performance",
    "Play the complete composition",
    "Your chord and percussion loops accompany you. Demonstrate previews the full melody without changing your takes. Practice counts you in: follow the highlighted melody notes, sustain rings and bend indicators through A, B, A, C, B, D. Leave the final beat silent.",
    ["chordLooper", "percussionLooper"],
  ),
]);

// Reuse the composition's recording, demonstrations, scoring and bend guides.
// Basics retains ownership of the scene and the user's saved Play workspace.
export class BasicsFinale {
  constructor(basics) {
    this.basics = basics;
    this.host = basics.host;
    this.session = new TutorialSession({ steps: BASICS_FINALE_STEPS, now: performance.now() });
    this.session.requireCompletion = true;
    this.host.session = this.session;
    this.host.report = null;
    this.host.uiFeedback = "";
    this.host.adapter.origin = "learner";
    this.host.panel.recenter(this.host.r.getUserCamera(), true);
  }
  async action(id) {
    if (id === "restart-finale" || id === "reset-lesson")
      return (this.basics.pending = this.basics.enter(this.basics.index, { reset: true }));
    if (id === "previous-step" && this.session.index === 0)
      return (this.basics.pending = this.basics.enter(this.basics.index - 1));
    if (id === "next-step") {
      if (this.session.outcomes.get(this.session.step.id)?.status !== "passed") {
        this.host.uiFeedback = "Complete this part in Practice before continuing.";
        return;
      }
      if (this.session.index === this.session.steps.length - 1) {
        this.basics.complete(performance.now());
        return (this.basics.pending = this.basics.enter(this.basics.index + 1));
      }
    }
    return this.host.flow.action(id);
  }
  dispose() {
    this.host.flow.cancelOutgoing();
    if (this.host.session === this.session) this.host.session = null;
    this.host.backingLayout.dispose();
    this.host.cues.reset();
    this.host.uiFeedback = "";
  }
}
