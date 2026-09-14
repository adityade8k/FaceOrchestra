import { COMPOSITION as C, TOLERANCES as T } from './composition.js';
import { LESSON_STEPS, SIMULATION_STEPS } from './lessonSteps.js';
import { expectedForStep, validateNote, validateSequence, validateSetup, validateTake } from './validation.js';
import { scoreAttempt, scoreForStep, PRACTICE_TOLERANCES as P } from './scoring.js';
import { setupStatus } from './TutorialLessonPolicy.js';

// Pure state machine: no Three.js, DOM, audio or wall-clock dependencies.
export class TutorialSession {
  constructor({ mode = 'practice', now = 0, steps = null, origin = null } = {}) {
    this.mode = mode; this.origin = origin || (mode === 'simulation' ? 'simulation' : 'learner');
    this.steps = steps || (mode === 'simulation' ? SIMULATION_STEPS : LESSON_STEPS); this.index = 0; this.enteredAt = now; this.attempt = 1;
    this.evidence = []; this.seen = new Set(); this.checkpoints = new Map();
    this.feedback = ''; this.failed = false; this.anchorMs = null; this.beatMs = C.beatMs; this.complete = false;
    this.takeEvidence = {}; this.validatedTakes = {}; this.repairReturnIndex = null; this.phrasesPassed = []; this.revision = 0; this.playbackSince = null;
    this.phase=mode==='practice'?'ready':'automatic';this.result=null;this.outcomes=new Map();this.demonstrated=new Set();this.assisted=new Set();
    if(mode==='practice')this.attempt=0;
  }
  get step() { return this.steps[this.index] || null; }
  accept(event) {
    if (this.complete || this.failed || (this.mode==='practice'&&this.phase!=='practicing') || !event || event.origin !== this.origin ||
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
    this.anchorBeat = this.musicalClock?.(anchorMs)?.beatPosition ?? null;
    return true;
  }
  beatAt(now) {
    const timing=this.musicalClock?.(now);
    return Number.isFinite(this.anchorBeat)&&Number.isFinite(timing?.beatPosition)
      ? timing.beatPosition-this.anchorBeat : (now-this.anchorMs)/this.beatMs;
  }
  advance(now) {
    if(this.mode==='practice'){this.finishResult({ok:true,message:'Setup ready.',assisted:this.assisted.has(this.step.id)},now);return;}
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
  reject(message) {
    if(this.mode==='practice'){this.finishResult({ok:false,message},this.enteredAt);return false;}
    this.feedback = message; this.failed = true; this.revision++; return false;
  }
  navigate(index,now) {
    if(this.mode!=='practice')return false;
    if(this.step&&!this.outcomes.has(this.step.id))this.outcomes.set(this.step.id,{status:this.assisted.has(this.step.id)?'assisted':'skipped'});
    this.index=Math.max(0,Math.min(index,this.steps.length));this.complete=this.index>=this.steps.length;
    this.discardAttempt(now);this.phase='ready';this.result=null;this.attempt=0;this.attemptAssisted=false;this.revision++;return true;
  }
  discardAttempt(now) {
    this.evidence=[];this.seen.clear();this.anchorMs=null;this.enteredAt=now;this.failed=false;this.playbackSince=null;this.phrasesPassed=[];this.feedback='';this.finalRestApplied=false;this.pendingAssessment=null;
  }
  startAttempt(now,{assisted=false}={}) {
    this.discardAttempt(now);this.phase='practicing';this.result=null;this.attempt++;this.attemptAssisted=assisted;this.revision++;
  }
  finishResult(result,now) {
    if(this.phase==='results')return;
    this.result=result;this.phase='results';this.feedback=result.message;this.revision++;
    const assisted=Boolean(result.assisted||this.attemptAssisted);
    this.outcomes.set(this.step.id,{status:assisted?'assisted':result.ok?'passed':'practiced',at:now,score:result.score,components:result.components});
    if(result.ok&&!assisted)this.checkpoints.set(this.step.id,{at:now,attempt:this.attempt});
    if(this.step.type==='record')this.takeEvidence[this.step.looperRole]=this.evidence.map(e=>({...e}));
  }
  finishAttempt(snapshot,now,reason='') {
    const step=this.step;
    const capture=snapshot.loopers?.[step.looperRole];
    if(step.type==='record'&&(capture?.recording||capture?.recordArmed)){
      this.pendingAssessment={now,reason};return;
    }
    this.pendingAssessment=null;
    if(scoreForStep(step).length){
      let result=scoreAttempt(step,this.evidence,{reason});
      if(step.type==='record'&&result.ok){
        const take=validateTake(snapshot.loopers?.[step.looperRole]?.timeline,this.evidence,step.looperRole,snapshot.takeRoutes?.[step.looperRole]||snapshot.routes,{onsetBeats:P.onsetBeats,durationBeats:P.holdBeats});
        if(!take.ok)result={...result,ok:false,message:take.message};
      }
      this.finishResult(result,now);return;
    }
    const result=validateSetup(step,snapshot,null)||{ok:false,message:reason||'The action is incomplete. Check the instruments, then press Practice.'};
    this.finishResult({...result,assisted:this.attemptAssisted},now);
  }
  retry(now, { recording = false } = {}) {
    if(this.mode==='practice'){this.startAttempt(now);return;}
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
    if(this.mode==='practice'){this.updatePractice(snapshot,now);return;}
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
      if (setup.ok&&(this.mode!=='demonstration'||now-this.enteredAt>=1100)) this.advance(now);
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
        result = validateTake(owner.timeline,this.takeEvidence[step.looperRole] || [],step.looperRole,snapshot.takeRoutes?.[step.looperRole]||snapshot.routes);
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
      const command=this.evidence.some(e=>e.kind==='command'&&e.action===step.action);
      const valid=step.type==='start-all' ? command && snapshot.startAllRequest?.ok && snapshot.aligned &&
        snapshot.loopers.chordLooper.startBeat===snapshot.startAllRequest.targetBeat &&
        snapshot.loopers.chordLooper.playbackObserved && snapshot.loopers.percussionLooper.playbackObserved
        : owner?.playing && !owner.playArmed && owner.playbackObserved;
      if (!quiet || !valid || !snapshot.audioRunning) this.playbackSince = null;
      else this.playbackSince ??= now;
      result.ok = this.playbackSince !== null && now - this.playbackSince >= 16*C.beatMs;
    } else if (step.timed && this.anchorMs !== null && now >= this.anchorMs) {
      const beat = this.beatAt(now);
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
      if (step.type === 'record' && (snapshot.loopers?.[step.looperRole]?.recording || snapshot.loopers?.[step.looperRole]?.recordArmed)) return;
      if (beat >= step.beats && (!(snapshot.liveGestures||snapshot.anyStickContact)||beat>=step.beats+P.releaseGraceBeats)) {
        if (step.type === 'drums' || (step.type==='record' && step.looperRole==='percussionLooper')) result = validateSequence(C.percussion,musical,{kind:'strike'});
        else {
          result = validateSequence(notes,musical);
        }
        if (result.ok && snapshot.liveGestures) result = {ok:false,message:'Release the final held voice before continuing.'};
        if (result.ok && step.type === 'record' && !snapshot.loopers?.[step.looperRole]?.recording&&!snapshot.loopers?.[step.looperRole]?.timeline) result = {ok:false,message:'Arm Record before the take. Re-record this attempt.'};
        if (!result.ok) this.reject(result.message);
      }
    }
    if (result.ok) this.advance(now);
  }
  updatePractice(snapshot,now) {
    const automatic=setupStatus(this.step,snapshot);
    if(automatic){
      this.feedback=automatic.message;
      if(automatic.ok){
        if(this.phase!=='results')this.finishResult(automatic,now);
      }else{
        this.phase='ready';this.result=null;this.checkpoints.delete(this.step.id);
        if(this.outcomes.get(this.step.id)?.status==='passed')this.outcomes.delete(this.step.id);
      }
      return;
    }
    if(this.phase!=='practicing')return;
    const step=this.step,elapsed=now-this.enteredAt;
    if(step.timed&&snapshot.roles&&scoreForStep(step).some(event=>!snapshot.roles[event.role]?.ready)){
      this.finishAttempt(snapshot,now,'A required target is missing. Place it with the radial menu, then press Practice.');return;
    }
    const writtenRest=step.type==='performance'&&this.anchorMs!==null&&now>=this.anchorMs+95*this.beatMs;
    if(step.timed&&!writtenRest&&snapshot.clockPlaying!==undefined&&(!snapshot.clockPlaying||Math.abs(snapshot.bpm-C.bpm)>T.bpm)){
      this.finishAttempt(snapshot,now,'The clock changed or paused. Start it at 80 BPM, then press Practice.');return;
    }
    if(step.looperRole&&snapshot.loopers?.[step.looperRole]?.clockWired===false&&['record','playback'].includes(step.type)){
      this.finishResult({ok:false,message:'Reconnect the Looper clock cable, then press Practice.'},now);return;
    }
    const setup=validateSetup(step,snapshot,null);
    if(setup){
      if(setup.ok)this.finishResult({...setup,assisted:this.attemptAssisted},now);
      else if(elapsed>30000)this.finishResult(setup,now);
      else this.feedback=setup.message;
      return;
    }
    if(step.timed){
      if(this.anchorMs===null){if(elapsed>10000)this.finishResult({ok:false,message:'Start the Metronome at 80 BPM, then press Practice.'},now);return;}
      const beat=this.beatAt(now);
      const progress=snapshot.loopers?.[step.looperRole]?.recordingProgress;
      if(step.type==='record'&&progress?.state==='complete'&&!progress.automatic) {
        this.finishAttempt(snapshot,now,`Stopped early: ${Number(progress.beats.toFixed(2))} beats saved.`);return;
      }
      if(beat<step.beats)return;
      if((snapshot.liveGestures||snapshot.anyStickContact)&&beat<step.beats+P.releaseGraceBeats)return;
      this.finishAttempt(snapshot,now,beat>=step.beats+P.releaseGraceBeats&&(snapshot.liveGestures||snapshot.anyStickContact)?'Release the held target before trying again.':'');return;
    }
    if(['note','strike'].includes(step.type)){
      if(this.evidence.some(e=>e.kind==='note'||e.kind==='strike')||elapsed>P.untimedTimeoutMs)this.finishAttempt(snapshot,now,elapsed>P.untimedTimeoutMs?'No completed note or strike was received. Follow the highlighted target, then release.':'');return;
    }
    let result;
    if(step.type==='ack')result={ok:true,message:'Ready for the composition.'};
    if(step.type==='stick'&&snapshot.stickActive&&snapshot.stickOrigin==='learner')result={ok:true,message:'Stick ready.'};
    if(step.type==='unequip'&&!snapshot.anyStickActive)result={ok:true,message:'Hands ready for melody.'};
    if(step.type==='finalize'){
      const owner=snapshot.loopers?.[step.looperRole];
      if(!owner?.recording&&!owner?.recordArmed)result=validateTake(owner?.timeline,snapshot.takeEvidence?.[step.looperRole]||this.takeEvidence[step.looperRole]||[],step.looperRole,snapshot.takeRoutes?.[step.looperRole]||snapshot.routes,{onsetBeats:P.onsetBeats,durationBeats:P.holdBeats});
    }
    if(['playback','start-all'].includes(step.type)){
      const owner=snapshot.loopers?.[step.looperRole];
      const playing=step.type==='start-all'?snapshot.aligned&&snapshot.startAllRequest?.ok&&snapshot.loopers.chordLooper.playbackObserved&&snapshot.loopers.percussionLooper.playbackObserved:owner?.playing&&!owner.playArmed&&owner.playbackObserved;
      if(playing&&snapshot.audioRunning&&!snapshot.liveGestures&&!snapshot.anyStickContact){this.playbackSince??=now;if(now-this.playbackSince>=C.loopBeats*C.beatMs)result={ok:true,message:step.type==='start-all'?'Both parts launched together on the same beat.':'One complete backing cycle heard.'};}
      else this.playbackSince=null;
    }
    if(result)this.finishResult(result,now);
    else if(elapsed>30000)this.finishResult({ok:false,message:'This action did not complete. Check the instrument, then press Practice again or skip with Next Step.'},now);
  }
  exportProgress() { return { composition:C.id,version:C.version,mode:this.mode,complete:this.complete,
    checkpoints:[...this.checkpoints.keys()],outcomes:Object.fromEntries(this.outcomes),demonstrated:[...this.demonstrated],phrasesPassed:[...this.phrasesPassed] }; }
}
