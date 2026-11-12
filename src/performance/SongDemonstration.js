import { bendAt } from "../compositions/bendCurve.js";

// Drives the same controller input paths as practice demonstrations.
// Only the physical XR input sources are sampled by CaptureRecorder.
export class SongDemonstration {
  constructor(host, ensemble, definition) {
    Object.assign(this, { host, ensemble, definition, a: host.adapter });
    this.active = false;
    this.events =
      definition.score.events || definition.arrangement.liveEvents.filter((e) => e.pitch);
  }
  start() {
    this.active = true;
    this.noteId = null;
    this.finalRest = false;
    this.nextEvent = 0;
    this.lastBeat = -Infinity;
    this.a.setVirtualsActive(true, "demonstration", { showHelpers: false });
  }
  schedule(beatAt, onError) {
    clearInterval(this.timer);
    // Input can advance between rendered frames. Capture still samples only the
    // ordinary XR animation callback; this adds no synthetic poses or helpers.
    this.timer = setInterval(() => {
      if (!this.active) return;
      try {
        const now = performance.now();
        this.update(now, beatAt(now));
      } catch (error) {
        onError(error);
      }
    }, 16);
  }
  update(now, beat) {
    if (!this.active) return;
    // An animation timestamp can precede the timer tick that just ran.
    if (beat < this.lastBeat) return;
    this.lastBeat = beat;
    // Never report a perfect completed take if a stalled frame skipped a note.
    while (this.nextEvent < this.events.length && this.events[this.nextEvent].beat <= beat) {
      const event = this.events[this.nextEvent];
      const release = this.ensemble.hands ? 0 : 0.07;
      if (beat >= event.beat + event.beats - release)
        throw new Error(
          "Demonstration missed a note after a playback interruption. Start a new take.",
        );
      this.nextEvent++;
    }
    if (this.ensemble.hands) {
      // A final note's beat + duration can exceed the score end by rounding.
      // Once the conductor releases it, never attack it again at that endpoint.
      if (beat >= this.definition.score.durationBeats) {
        if (!this.finalRest) this.ensemble.hands.release();
        this.finalRest = true;
      } else {
        if (this.ensemble.anchor === null)
          throw new Error("Demonstration playback stopped before the piece ended.");
        this.ensemble.hands.play(this.definition.score.events, beat, now);
      }
    } else {
      // Jog's practice conductor leaves a short release before each attack.
      const note = this.definition.arrangement.liveEvents.find(
        (event) => event.pitch && beat >= event.beat && beat < event.beat + event.beats - 0.07,
      );
      if (note?.id !== this.noteId) {
        this.a.squeeze(null, false, 0, now);
        this.noteId = note?.id;
      }
      if (note)
        this.a.squeeze(note.role, true, bendAt(note.bend, (beat - note.beat) / note.beats), now);
      if (beat >= 95 && !this.finalRest) {
        this.finalRest = true;
        this.ensemble.cancel();
      }
    }
    this.host.r?.updateHorn(now);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.active) return;
    this.ensemble.hands?.release();
    this.a.releaseVirtuals();
    this.a.setVirtualsActive(false);
    this.active = false;
  }
}
