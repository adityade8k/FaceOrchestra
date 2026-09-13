import { COMPOSITION as C, TOLERANCES as T } from './composition.js';
import { LESSON_STEPS, SIMULATION_STEPS } from './lessonSteps.js';
import { expectedForStep, validateNote, validateSequence, validateSetup, validateTake } from './validation.js';

// Pure state machine: no Three.js, DOM, audio or wall-clock dependencies.
export class TutorialSession {
  constructor({ mode = 'practice', now = 0, steps = null, origin = null } = {}) {
    this.mode = mode; this.origin = origin || (mode === 'simulation' ? 'simulation' : 'learner');
    this.steps = steps || (mode === 'simulation' ? SIMULATION_STEPS : LESSON_STEPS); this.index = 0; this.enteredAt = now; this.attempt = 1;
    this.evidence = []; this.seen = new Set(); this.checkpoints = new Map();
    this.feedback = ''; this.failed = false; this.anchorMs = null; this.beatMs = C.beatMs; this.complete = false;
    this.takeEvidence = {}; this.validatedTakes = {}; this.repairReturnIndex = null; this.phrasesPassed = []; this.revision = 0; this.playbackSince = null;
  }
  get step() { return this.steps[this.index] || null; }
  accept(event) {
    if (this.complete || this.failed || !event || event.origin !== this.origin ||
        event.startMs < this.enteredAt || this.seen.has(event.id)) return false;
    this.seen.add(event.id);
    if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value);
    const tagged = {...event};
    if (this.anchorMs !== null) {
      tagged.beat = (event.startMs - this.anchorMs) / this.beatMs;
      if(event.endMs !== undefined)tagged.durationBeats = (event.endMs-event.startMs)/this.beatMs;
    }
    this.evidence.push(tagged);
    if (this.evidence.length > 512) this.evidence.shift();
    return true;
  }
  startCountIn(anchorMs, beatMs = C.beatMs) {
    if (!this.step?.timed || this.failed) return false;
    this.anchorMs = anchorMs; this.beatMs = beatMs; this.evidence = []; this.phrasesPassed = []; this.revision++;
    return true;
  }
  advance(now) {
    this.checkpoints.set(this.step.id, {at:now,attempt:this.attempt});
    if (this.step.type === 'record') this.takeEvidence[this.step.looperRole] = this.evidence.map(e=>({...e}));
    if (this.repairReturnIndex !== null) {
      this.index = this.repairReturnIndex; this.repairReturnIndex = null;
    } else this.index++;
    this.enteredAt = now; this.attempt = 1; this.evidence = [];
    this.anchorMs = null; this.feedback = 'Well done. Next action.'; this.revision++;
    this.playbackSince = null;
    this.complete = this.index >= this.steps.length;
  }
  reject(message) { this.feedback = message; this.failed = true; this.revision++; return false; }
  retry(now, { recording = false } = {}) {
    if (recording || this.step?.type === 'finalize') {
      const role=this.step?.looperRole;
      const index=this.steps.findIndex(s=>s.type==='record' && s.looperRole===role);
      if(index>=0)this.index=index;
    }
    this.failed = false; this.evidence = []; this.enteredAt = now; this.anchorMs = null;
    this.phrasesPassed = []; this.playbackSince = null; this.attempt++; this.feedback = 'Try again when ready.'; this.revision++;
  }
  update(snapshot, now) {
    if (this.complete) return;
    // Setup is checked from cached actual state, including after deletion/retuning/disconnection.
    for (let i = 0; i < this.index; i++) {
      const old = this.steps[i];
      if (!this.checkpoints.has(old.id)) continue;
      // Clock intentionally stops during the last rest.
      if (old.type === 'tempo' && this.step.type === 'performance' && this.anchorMs !== null && now >= this.anchorMs + 95*this.beatMs) continue;
      const result = validateSetup(old,snapshot,this.origin);
      if (result && !result.ok) {
        this.repairReturnIndex ??= this.index;
        this.index = i;
        this.checkpoints.delete(old.id);
        this.retry(now); this.feedback = `Repair: ${result.message}`; return;
      }
    }
    const step = this.step;
    if (this.failed) return;
    const setup = validateSetup(step,snapshot,this.origin);
    if (setup) {
      this.feedback = setup.message;
      if (setup.ok) this.advance(now);
      return;
    }
    let result = {ok:false};
    if (step.type === 'ack') result.ok = this.evidence.some(e=>e.kind==='command' && e.action === step.action);
    else if (step.type === 'note') {
      const notes = this.evidence.filter(e=>e.kind==='note');
      for (const note of notes) {
        result = validateNote(note,step);
        if (result.ok) break;
      }
      if (!result.ok && result.message) this.feedback = result.message;
    } else if (step.type === 'stick') result.ok = snapshot.stickActive && snapshot.stickOrigin === this.origin;
    else if (step.type === 'unequip') result.ok = !snapshot.anyStickActive;
    else if (step.type === 'strike') result.ok = this.evidence.some(e=>e.kind==='strike' && e.role===step.role && e.withdrawn);
    else if (step.type === 'finalize') {
      const owner=snapshot.loopers?.[step.looperRole];
      if (owner && !owner.recording && !owner.recordArmed && owner.timeline) {
        result = validateTake(owner.timeline,this.takeEvidence[step.looperRole] || [],step.looperRole);
        if (result.ok && step.looperRole==='percussionLooper' && this.validatedTakes.chordLooper &&
          JSON.stringify(snapshot.loopers.chordLooper.timeline)!==this.validatedTakes.chordLooper) {
          result={ok:false,message:'The successful chord take changed. Restore or re-record Chords before continuing.'};
        }
        if (!result.ok) this.reject(result.message);
        else this.validatedTakes[step.looperRole]=JSON.stringify(owner.timeline);
      }
    } else if (step.type === 'playback' || step.type === 'start-all') {
      const quiet = snapshot.liveGestures === 0 && !snapshot.anyStickContact;
      const owner=snapshot.loopers?.[step.looperRole];
      const other=snapshot.loopers?.[step.looperRole==='chordLooper'?'percussionLooper':'chordLooper'];
      const command=this.evidence.some(e=>e.kind==='command'&&e.action===step.action);
      const valid=step.type==='start-all' ? command && snapshot.startAllRequest?.ok && snapshot.aligned &&
        snapshot.loopers.chordLooper.startBeat===snapshot.startAllRequest.targetBeat &&
        snapshot.loopers.chordLooper.playbackObserved && snapshot.loopers.percussionLooper.playbackObserved
        : owner?.playing && !owner.playArmed && !other?.playing && owner.playbackObserved;
      if (!quiet || !valid || !snapshot.audioRunning) this.playbackSince = null;
      else this.playbackSince ??= now;
      result.ok = this.playbackSince !== null && now - this.playbackSince >= 16*C.beatMs;
    } else if (step.timed && this.anchorMs !== null && now >= this.anchorMs) {
      const beat = (now-this.anchorMs)/this.beatMs;
      const notes = expectedForStep(step);
      const musical = this.evidence.filter(e=>e.kind==='note' || e.kind==='strike');
      if (step.type === 'performance') {
        const done = Math.min(6,Math.floor(beat/16));
        for (let i=this.phrasesPassed.length;i<done;i++) {
          const observed = musical.filter(e=>e.kind==='note' && e.beat >= i*16-T.onsetBeats && e.beat < (i+1)*16-T.onsetBeats);
          const expected = notes.filter(e=>e.phraseIndex===i);
          const phraseResult = validateSequence(expected,observed);
          if (!phraseResult.ok) return this.reject(`Phrase ${C.order[i]} (${i+1}/6): ${phraseResult.message}`);
          this.phrasesPassed.push(C.order[i]); this.revision++;
        }
      }
      if (beat >= step.beats - (step.type === 'record' ? 0.25 : 0)) {
        if (step.type === 'drums' || (step.type==='record' && step.looperRole==='percussionLooper')) result = validateSequence(C.percussion,musical,{kind:'strike'});
        else {
          result = validateSequence(notes,musical);
        }
        if (result.ok && snapshot.liveGestures) result = {ok:false,message:'Release the final held voice before continuing.'};
        if (result.ok && step.type === 'record' && !snapshot.loopers?.[step.looperRole]?.recording) result = {ok:false,message:'Arm Record before the take. Re-record this attempt.'};
        if (!result.ok) this.reject(result.message);
      }
    }
    if (result.ok) this.advance(now);
  }
  exportProgress() { return { composition:C.id,version:C.version,mode:this.mode,complete:this.complete,
    checkpoints:[...this.checkpoints.keys()],phrasesPassed:[...this.phrasesPassed] }; }
}
